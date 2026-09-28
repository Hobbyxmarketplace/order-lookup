import { Router } from "express";
import { authGate } from "../lib/guard.js";
import { query } from "../db/pool.js";
import { loadSql } from "../db/read-sql.js";
import {
  assignInvoice,
  assignInvoicesBulk,
  getDefaultZone,
  getZonesForInvoices,
  type MoveContext,
} from "../db/zones.js";
import { invalidateLookupCache } from "../services/lookup.js";
import { clientIp } from "../lib/ip.js";
import type { AuthClaims } from "../lib/auth.js";

function moveCtx(req: import("express").Request): MoveContext {
  const claims = (req as import("express").Request & { user?: AuthClaims }).user;
  return {
    actorUser: claims?.sub ?? "unknown",
    actorIp: clientIp(req),
    userAgent: req.get("user-agent") ?? undefined,
  };
}

const router = Router();

const LIST_ALL_SQL = loadSql("list-all-invoices");
const COUNT_ITEMS_BATCH_SQL = loadSql("count-items-batch");

function normalizeInvoice(s: unknown): string {
  return String(s ?? "").trim().toUpperCase();
}

/**
 * Move a single invoice to a zone. Available to any authenticated user.
 */
router.post("/invoices/:invoice/move", authGate, (req, res) => {
  const invoice = normalizeInvoice(req.params.invoice);
  const { zoneId } = (req.body || {}) as { zoneId?: number };
  if (!invoice)
    return res.status(400).json({ error: "Missing invoice number." });
  if (!Number.isInteger(zoneId)) {
    return res.status(400).json({ error: "Please choose a zone." });
  }
  try {
    assignInvoice(invoice, zoneId as number, moveCtx(req));
    invalidateLookupCache(invoice);
    res.json({ ok: true });
  } catch (e: any) {
    if (/not found/i.test(e.message)) {
      return res.status(400).json({
        error:
          "That zone could not be found. It may have been deleted — please refresh the page.",
      });
    }
    res
      .status(400)
      .json({ error: "We couldn't move that invoice. Please refresh and try again." });
  }
});

/**
 * Move many invoices at once to a single target zone.
 * Body: { invoices: string[], zoneId: number }
 */
router.post("/invoices/bulk-move", authGate, (req, res) => {
  const { invoices, zoneId } = (req.body || {}) as {
    invoices?: unknown;
    zoneId?: number;
  };
  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res
      .status(400)
      .json({ error: "Please select at least one invoice to move." });
  }
  if (invoices.length > 1000) {
    return res.status(400).json({
      error: "You can move up to 1,000 invoices at a time. Please select fewer.",
    });
  }
  if (!Number.isInteger(zoneId)) {
    return res.status(400).json({ error: "Please choose a zone." });
  }
  const clean = Array.from(
    new Set(
      (invoices as unknown[])
        .map((v) => normalizeInvoice(v))
        .filter((s) => s.length > 0 && s.length <= 64)
    )
  );
  if (clean.length === 0) {
    return res
      .status(400)
      .json({ error: "None of the selected invoice numbers are valid." });
  }
  try {
    const { updated, skipped } = assignInvoicesBulk(
      clean,
      zoneId as number,
      moveCtx(req)
    );
    for (const inv of clean) invalidateLookupCache(inv);
    res.json({ ok: true, updated, skipped });
  } catch (e: any) {
    if (/not found/i.test(e.message)) {
      return res.status(400).json({
        error:
          "That zone could not be found. It may have been deleted — please refresh the page.",
      });
    }
    res
      .status(400)
      .json({ error: "We couldn't complete the move. Please refresh and try again." });
  }
});

/**
 * List every known invoice (PSA Ready-for-Pickup + all intake rows) with its
 * current zone, company, item count, and received/ready timestamp.
 *
 * Query params:
 *   search      substring match on invoice number (raw or digits-only)
 *   zoneIds     comma-separated zone id filter (post-processed in JS)
 *   companies   comma-separated PSA|BGS|CGC|GEA|Unknown filter
 *   limit       default 50, max 200
 *   offset      default 0
 */
router.get("/invoices/ready-for-pickup", authGate, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const like = search ? `%${search}%` : "";
  const limitRaw = Number(req.query.limit ?? 50);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

  const zoneIdsRaw = req.query.zoneIds;
  const zoneIdList =
    typeof zoneIdsRaw === "string" && zoneIdsRaw.length > 0
      ? zoneIdsRaw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n))
      : [];
  const zoneFilter = new Set<number>(zoneIdList);

  const companiesRaw = req.query.companies;
  const companyFilter =
    typeof companiesRaw === "string" && companiesRaw.length > 0
      ? new Set(companiesRaw.split(",").map((s) => s.trim().toUpperCase()))
      : null;

  try {
    const digitsOnly = search.replace(/\D/g, "");
    const digitsLike = digitsOnly ? `%${digitsOnly}%` : "\x00";

    // Two OR-arms in the SQL each need (raw, raw, digits): 6 params total.
    const rows = await query<{
      invoice_number: string;
      company: string | null;
      pickup_ready_at: string | null;
      submitted_at: string | null;
      submission_number: string | number | null;
      owner_email: string | null;
      owner_name: string | null;
    }>(LIST_ALL_SQL, [
      search, like, digitsLike,
      search, like, digitsLike,
    ]);

    const invoices = rows.map((r) => r.invoice_number);
    const zoneMap = getZonesForInvoices(invoices);
    const defaultZone = getDefaultZone();

    // Batch-fetch PSA item counts. Non-PSA counts come from parseServiceLevel
    // below (we don't have service_level in this SQL — item counts for non-PSA
    // are computed at lookup time; on the list page we show "— items" for
    // non-PSA to avoid an N+1 or a giant per-row LIKE. Acceptable trade-off.)
    let itemsMap = new Map<string, number>();
    const psaInvoices = rows
      .filter((r) => (r.company ?? "").toUpperCase() === "PSA")
      .map((r) => r.invoice_number.toUpperCase());
    if (psaInvoices.length > 0) {
      try {
        // mysql2 `.execute()` does NOT expand arrays into IN(?), so build
        // the placeholder list explicitly. The SQL file's IN (?) placeholder
        // is substituted with the real (?, ?, ...) before executing.
        const placeholders = psaInvoices.map(() => "?").join(",");
        const sql = COUNT_ITEMS_BATCH_SQL.replace("IN (?)", `IN (${placeholders})`);
        const counts = await query<{ invoice_number: string; items: number }>(
          sql,
          psaInvoices
        );
        for (const c of counts) itemsMap.set(c.invoice_number, c.items);
      } catch (e: any) {
        console.error("[ready-for-pickup] item count batch failed:", e.message);
      }
    }

    const allItems = rows.map((r) => {
      const key = r.invoice_number.toUpperCase();
      const z = zoneMap.get(key) ?? defaultZone;
      const company = (r.company ?? "Unknown").toUpperCase();
      const receivedAt = r.pickup_ready_at ?? r.submitted_at ?? null;
      return {
        invoice: r.invoice_number,
        company,
        submission_number:
          r.submission_number != null ? String(r.submission_number) : null,
        owner_email: r.owner_email,
        owner_name: r.owner_name,
        received_at: receivedAt,
        // Legacy field kept for backwards-compat with the current client.
        pickup_ready_at: r.pickup_ready_at,
        zone: { id: z.id, name: z.name },
        items: itemsMap.get(key) ?? null,
      };
    });

    // Sort newest first by whichever timestamp we have.
    allItems.sort((a, b) => {
      const ax = a.received_at ?? "";
      const bx = b.received_at ?? "";
      if (ax === bx) return a.invoice.localeCompare(b.invoice);
      return bx.localeCompare(ax);
    });

    const filtered = allItems.filter((i) => {
      if (zoneFilter.size > 0 && !zoneFilter.has(i.zone.id)) return false;
      if (companyFilter && !companyFilter.has(i.company)) return false;
      return true;
    });

    res.json({
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
    });
  } catch (e: any) {
    console.error("[ready-for-pickup]", e.message);
    res
      .status(500)
      .json({ error: "We couldn't load the invoice list right now. Please try again in a moment." });
  }
});

export default router;
