import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config.js";

const dbPath = path.resolve(config.usersDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS zones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_zones_default_singleton
    ON zones(is_default) WHERE is_default = 1;

  CREATE TABLE IF NOT EXISTS invoice_zones (
    invoice_number TEXT PRIMARY KEY COLLATE NOCASE,
    zone_id        INTEGER NOT NULL,
    moved_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_invoice_zones_zone ON invoice_zones(zone_id);

  CREATE TABLE IF NOT EXISTS move_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL COLLATE NOCASE,
    from_zone_id   INTEGER,
    to_zone_id     INTEGER NOT NULL,
    actor_user     TEXT NOT NULL,
    actor_ip       TEXT NOT NULL,
    ua_snip        TEXT,
    moved_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_moved_at ON move_audit(moved_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_invoice ON move_audit(invoice_number COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON move_audit(actor_user);
`);

export interface Zone {
  id: number;
  name: string;
  is_default: 0 | 1;
  created_at: string;
}

export interface ZoneWithCount extends Zone {
  invoice_count: number;
}

/** Seed a single default "Zone A" on first ever boot. Idempotent. */
export function bootstrapDefaultZoneIfEmpty(): void {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM zones").get() as { n: number })
    .n;
  if (n > 0) return;
  db.prepare("INSERT INTO zones (name, is_default) VALUES (?, 1)").run("Zone A");
  console.log("[zones] seeded default 'Zone A'");
}

export function listZones(): ZoneWithCount[] {
  return db
    .prepare(
      `
      SELECT z.id, z.name, z.is_default, z.created_at,
             COALESCE(c.n, 0) AS invoice_count
      FROM zones z
      LEFT JOIN (
        SELECT zone_id, COUNT(*) AS n
        FROM invoice_zones
        GROUP BY zone_id
      ) c ON c.zone_id = z.id
      ORDER BY z.is_default DESC, z.name ASC
      `
    )
    .all() as ZoneWithCount[];
}

export function getZone(id: number): Zone | undefined {
  return db.prepare("SELECT * FROM zones WHERE id = ?").get(id) as
    | Zone
    | undefined;
}

export function getDefaultZone(): Zone {
  const z = db
    .prepare("SELECT * FROM zones WHERE is_default = 1")
    .get() as Zone | undefined;
  if (!z) throw new Error("No default zone configured");
  return z;
}

export function createZone(name: string): Zone {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Zone name is required");
  if (trimmed.length > 60) throw new Error("Zone name too long");
  const info = db
    .prepare("INSERT INTO zones (name, is_default) VALUES (?, 0)")
    .run(trimmed);
  return getZone(Number(info.lastInsertRowid))!;
}

export function renameZone(id: number, name: string): Zone {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Zone name is required");
  const res = db.prepare("UPDATE zones SET name = ? WHERE id = ?").run(
    trimmed,
    id
  );
  if (res.changes === 0) throw new Error("Zone not found");
  return getZone(id)!;
}

/** Atomically flip the default flag to a target zone. */
export function setDefaultZone(id: number): void {
  const target = getZone(id);
  if (!target) throw new Error("Zone not found");
  const tx = db.transaction((zoneId: number) => {
    db.prepare("UPDATE zones SET is_default = 0 WHERE is_default = 1").run();
    db.prepare("UPDATE zones SET is_default = 1 WHERE id = ?").run(zoneId);
  });
  tx(id);
}

/**
 * Hard-delete a zone. All rows in invoice_zones pointing at it are
 * migrated to `migrateToZoneId` first, in a single transaction.
 * Guards:
 *   - cannot delete the default zone (admin must move default first)
 *   - migrate target must exist and differ from the zone being deleted
 *   - cannot delete when only one zone exists (nothing to migrate to)
 */
export function deleteZoneWithMigration(
  id: number,
  migrateToZoneId: number
): void {
  if (id === migrateToZoneId) {
    throw new Error("Migration target must differ from the deleted zone");
  }
  const src = getZone(id);
  if (!src) throw new Error("Zone not found");
  if (src.is_default) {
    throw new Error(
      "Cannot delete the default zone. Set another zone as default first."
    );
  }
  const dst = getZone(migrateToZoneId);
  if (!dst) throw new Error("Migration target zone not found");

  const tx = db.transaction((from: number, to: number) => {
    db.prepare(
      "UPDATE invoice_zones SET zone_id = ?, moved_at = datetime('now') WHERE zone_id = ?"
    ).run(to, from);
    db.prepare("DELETE FROM zones WHERE id = ?").run(from);
  });
  tx(id, migrateToZoneId);
}

/* -------- invoice-zone assignments -------- */

export function getZoneForInvoice(invoice: string): Zone {
  const row = db
    .prepare(
      `SELECT z.* FROM invoice_zones iz
       JOIN zones z ON z.id = iz.zone_id
       WHERE iz.invoice_number = ? COLLATE NOCASE`
    )
    .get(invoice) as Zone | undefined;
  return row ?? getDefaultZone();
}

export interface MoveContext {
  actorUser: string;
  actorIp: string;
  userAgent?: string;
}

const upsertStmt = db.prepare(
  `INSERT INTO invoice_zones (invoice_number, zone_id, moved_at)
   VALUES (?, ?, datetime('now'))
   ON CONFLICT(invoice_number) DO UPDATE SET
     zone_id = excluded.zone_id,
     moved_at = excluded.moved_at`
);

const currentZoneStmt = db.prepare(
  "SELECT zone_id FROM invoice_zones WHERE invoice_number = ? COLLATE NOCASE"
);

const auditStmt = db.prepare(
  `INSERT INTO move_audit
     (invoice_number, from_zone_id, to_zone_id, actor_user, actor_ip, ua_snip)
   VALUES (?, ?, ?, ?, ?, ?)`
);

function snipUa(ua: string | undefined): string | null {
  if (!ua) return null;
  return ua.length > 200 ? ua.slice(0, 200) : ua;
}

export function assignInvoice(
  invoice: string,
  zoneId: number,
  ctx: MoveContext
): { changed: boolean } {
  const zone = getZone(zoneId);
  if (!zone) throw new Error("Zone not found");
  let changed = false;
  const tx = db.transaction(() => {
    const prev = currentZoneStmt.get(invoice) as
      | { zone_id: number }
      | undefined;
    if (prev?.zone_id === zoneId) return;
    upsertStmt.run(invoice, zoneId);
    auditStmt.run(
      invoice,
      prev?.zone_id ?? null,
      zoneId,
      ctx.actorUser,
      ctx.actorIp,
      snipUa(ctx.userAgent)
    );
    changed = true;
  });
  tx();
  return { changed };
}

export function assignInvoicesBulk(
  invoices: string[],
  zoneId: number,
  ctx: MoveContext
): { updated: number; skipped: number } {
  const zone = getZone(zoneId);
  if (!zone) throw new Error("Zone not found");
  const ua = snipUa(ctx.userAgent);
  const tx = db.transaction((rows: string[]) => {
    let updated = 0;
    let skipped = 0;
    for (const inv of rows) {
      const prev = currentZoneStmt.get(inv) as
        | { zone_id: number }
        | undefined;
      if (prev?.zone_id === zoneId) {
        skipped++;
        continue;
      }
      upsertStmt.run(inv, zoneId);
      auditStmt.run(
        inv,
        prev?.zone_id ?? null,
        zoneId,
        ctx.actorUser,
        ctx.actorIp,
        ua
      );
      updated++;
    }
    return { updated, skipped };
  });
  return tx(invoices);
}

export interface AuditRow {
  id: number;
  invoice_number: string;
  from_zone_id: number | null;
  from_zone_name: string | null;
  to_zone_id: number;
  to_zone_name: string | null;
  actor_user: string;
  actor_ip: string;
  ua_snip: string | null;
  moved_at: string;
}

export interface AuditQuery {
  invoice?: string;
  actor?: string;
  fromDate?: string;
  toDate?: string;
  limit: number;
  offset: number;
}

export function listAudit(q: AuditQuery): { rows: AuditRow[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.invoice) {
    where.push("a.invoice_number LIKE ? COLLATE NOCASE");
    params.push(`%${q.invoice}%`);
  }
  if (q.actor) {
    where.push("a.actor_user = ?");
    params.push(q.actor);
  }
  if (q.fromDate) {
    where.push("a.moved_at >= ?");
    params.push(q.fromDate);
  }
  if (q.toDate) {
    where.push("a.moved_at < ?");
    params.push(q.toDate);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM move_audit a ${whereSql}`)
    .get(...params) as { n: number }).n;

  const rows = db
    .prepare(
      `SELECT a.id, a.invoice_number, a.from_zone_id, a.to_zone_id,
              a.actor_user, a.actor_ip, a.ua_snip, a.moved_at,
              zf.name AS from_zone_name, zt.name AS to_zone_name
       FROM move_audit a
       LEFT JOIN zones zf ON zf.id = a.from_zone_id
       LEFT JOIN zones zt ON zt.id = a.to_zone_id
       ${whereSql}
       ORDER BY a.moved_at DESC, a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, q.limit, q.offset) as AuditRow[];

  return { rows, total };
}

export function listAudit_forInvoice(invoice: string): AuditRow[] {
  return db
    .prepare(
      `SELECT a.id, a.invoice_number, a.from_zone_id, a.to_zone_id,
              a.actor_user, a.actor_ip, a.ua_snip, a.moved_at,
              zf.name AS from_zone_name, zt.name AS to_zone_name
       FROM move_audit a
       LEFT JOIN zones zf ON zf.id = a.from_zone_id
       LEFT JOIN zones zt ON zt.id = a.to_zone_id
       WHERE a.invoice_number = ? COLLATE NOCASE
       ORDER BY a.moved_at DESC, a.id DESC
       LIMIT 50`
    )
    .all(invoice) as AuditRow[];
}

/** Lookup map for many invoices in one query, used by the bulk-move list. */
export function getZonesForInvoices(
  invoices: string[]
): Map<string, Zone> {
  const out = new Map<string, Zone>();
  if (invoices.length === 0) return out;
  const placeholders = invoices.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT iz.invoice_number, z.*
       FROM invoice_zones iz
       JOIN zones z ON z.id = iz.zone_id
       WHERE iz.invoice_number IN (${placeholders}) COLLATE NOCASE`
    )
    .all(...invoices) as (Zone & { invoice_number: string })[];
  for (const r of rows) {
    const { invoice_number, ...zone } = r as any;
    out.set(String(invoice_number).toUpperCase(), zone as Zone);
  }
  return out;
}
