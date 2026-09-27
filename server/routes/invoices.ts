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

const LIST_ALL_SQL = loadSql("list-ready-for-pickup-all");

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
 * List Ready-for-Pickup invoices with their current zone.
 * Query: ?search=&limit=&offset=
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

  try {
    // Support digits-only search too: user can type "131055" to match "H131055".
    // Empty digits string keeps the OR arm inert (matches nothing) because we
    // wrap it with %; when search is empty we bail before the LIKE anyway.
    const digitsOnly = search.replace(/\D/g, "");
    const digitsLike = digitsOnly ? `%${digitsOnly}%` : "\x00"; // sentinel that never matches

    const rows = await query<{
      invoice_number: string;
      submission_number: string | number | null;
      owner_email: string | null;
      pickup_ready_at: string | null;
    }>(LIST_ALL_SQL, [search, like, digitsLike]);

    const invoices = rows.map((r) => r.invoice_number);
    const zoneMap = getZonesForInvoices(invoices);
    const defaultZone = getDefaultZone();

    const allItems = rows.map((r) => {
      const z = zoneMap.get(r.invoice_number.toUpperCase()) ?? defaultZone;
      return {
        invoice: r.invoice_number,
        submission_number:
          r.submission_number != null ? String(r.submission_number) : null,
        owner_email: r.owner_email,
        pickup_ready_at: r.pickup_ready_at,
        zone: { id: z.id, name: z.name },
      };
    });

    const filtered =
      zoneFilter.size > 0
        ? allItems.filter((i) => zoneFilter.has(i.zone.id))
        : allItems;

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
