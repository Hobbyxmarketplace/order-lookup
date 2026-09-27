import { Router } from "express";
import { authGate, requireAdmin } from "../lib/guard.js";
import {
  createZone,
  deleteZoneWithMigration,
  getDefaultZone,
  getZonesForInvoices,
  listZones,
  renameZone,
  setDefaultZone,
} from "../db/zones.js";
import { query } from "../db/pool.js";
import { loadSql } from "../db/read-sql.js";

const router = Router();

const ALL_READY_SQL = loadSql("all-ready-for-pickup-invoices");

/**
 * Rewrite internal error strings from the SQLite/service layer into copy that
 * is safe to show to end users. Falls back to a generic message so we never
 * leak stack-trace-ish detail into the UI.
 */
function friendlyZoneError(msg: string): string {
  const m = msg || "";
  if (/default/i.test(m) && /delete/i.test(m)) {
    return "You can't delete the default zone. Set another zone as default first.";
  }
  if (/default/i.test(m)) {
    return "This action isn't allowed for the default zone.";
  }
  if (/differ/i.test(m)) {
    return "Please pick a different zone to move the invoices to.";
  }
  if (/migration target/i.test(m) || /not found/i.test(m)) {
    return "That zone could not be found. It may have been deleted — please refresh the page.";
  }
  if (/too long/i.test(m)) {
    return "That zone name is too long. Please use 60 characters or fewer.";
  }
  if (/required/i.test(m)) {
    return "Please enter a zone name.";
  }
  return "That change could not be applied. Please refresh the page and try again.";
}

/**
 * Compute per-zone occupancy for invoices actually in Ready-for-Pickup status.
 * Unassigned invoices roll into the default zone. Requires a MariaDB round-trip;
 * called only from the admin Zones page, which loads infrequently.
 */
async function occupancyByZoneId(): Promise<Map<number, number>> {
  const rows = await query<{ invoice_number: string }>(ALL_READY_SQL, []);
  const invoices = rows
    .map((r) => r.invoice_number)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const assigned = getZonesForInvoices(invoices);
  const defaultId = getDefaultZone().id;
  const counts = new Map<number, number>();
  for (const inv of invoices) {
    const z = assigned.get(inv.toUpperCase());
    const zid = z ? z.id : defaultId;
    counts.set(zid, (counts.get(zid) ?? 0) + 1);
  }
  return counts;
}

router.get("/zones", authGate, async (_req, res) => {
  const zones = listZones();
  try {
    const occ = await occupancyByZoneId();
    res.json({
      zones: zones.map((z) => ({
        ...z,
        invoice_count: occ.get(z.id) ?? 0,
      })),
    });
  } catch (e: any) {
    console.error("[zones] occupancy failed:", e.message);
    // Fall back to the sparse count so the page still renders when MariaDB is down
    res.json({ zones });
  }
});

/**
 * Reject zone names that contain characters likely to break the UI (angle
 * brackets), control characters, or ASCII quotes. Emoji and CJK are fine.
 */
function validateZoneName(raw: string | undefined | null): {
  ok: true;
  name: string;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "Please enter a zone name." };
  }
  const name = raw.trim();
  if (name.length > 60) {
    return {
      ok: false,
      error: "That zone name is too long. Please use 60 characters or fewer.",
    };
  }
  if (/[<>]/.test(name)) {
    return {
      ok: false,
      error: "Zone names can't contain the characters < or >.",
    };
  }
  // Any C0/C1 control character
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    return {
      ok: false,
      error: "Zone names can't contain control characters.",
    };
  }
  return { ok: true, name };
}

router.post("/zones", authGate, requireAdmin, (req, res) => {
  const { name } = (req.body || {}) as { name?: string };
  const check = validateZoneName(name);
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const zone = createZone(check.name);
    res.status(201).json(zone);
  } catch (e: any) {
    if (/UNIQUE/i.test(e.message)) {
      return res
        .status(409)
        .json({ error: "A zone with this name already exists." });
    }
    res.status(400).json({ error: friendlyZoneError(e.message) });
  }
});

router.patch("/zones/:id", authGate, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "That zone could not be found." });
  const { name, isDefault } = (req.body || {}) as {
    name?: string;
    isDefault?: boolean;
  };
  if (typeof name === "string") {
    const check = validateZoneName(name);
    if (!check.ok) return res.status(400).json({ error: check.error });
  }
  try {
    if (typeof name === "string") renameZone(id, name.trim());
    if (isDefault === true) setDefaultZone(id);
    res.json({ ok: true });
  } catch (e: any) {
    if (/UNIQUE/i.test(e.message)) {
      return res
        .status(409)
        .json({ error: "A zone with this name already exists." });
    }
    res.status(400).json({ error: friendlyZoneError(e.message) });
  }
});

router.delete("/zones/:id", authGate, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "That zone could not be found." });
  const { migrateToZoneId } = (req.body || {}) as { migrateToZoneId?: number };
  if (!Number.isInteger(migrateToZoneId)) {
    return res.status(400).json({
      error: "Please choose a zone to move the existing invoices to.",
    });
  }
  try {
    deleteZoneWithMigration(id, migrateToZoneId as number);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: friendlyZoneError(e.message) });
  }
});

export default router;
