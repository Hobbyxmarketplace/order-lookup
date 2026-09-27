import { LRUCache } from "lru-cache";
import { query } from "../db/pool.js";
import { loadSql } from "../db/read-sql.js";
import { config } from "../config.js";
import type { LookupResult } from "../types.js";
import { getZoneForInvoice } from "../db/zones.js";
import { formatShipmentLabel } from "../lib/shipment.js";

// LRUCache values must be non-null; wrap in an object to allow "found: null".
type CacheEntry = { result: LookupResult | null };
const cache = new LRUCache<string, CacheEntry>({
  max: config.lookup.cacheMax,
  ttl: config.lookup.cacheTtlSeconds * 1000,
});

const SQL = loadSql("lookup-invoice");

/**
 * True when `now`'s calendar day is strictly after `iso`'s calendar day, using
 * the server's local calendar. Matches the mobile app's `isCalendarDayAfter`.
 */
function isAfterCalendar(now: Date, iso: string): boolean {
  const target = new Date(`${iso}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return today.getTime() > day.getTime();
}

interface Row {
  grading_company: string;
  invoice_number: string;
  submission_number: string | number | null;
  status: string;
  status_date: string | Date | null;
  owner_email: string | null;
  owner_login: string | null;
  owner_display_name: string | null;
  owner_phone: string | null;
  owner_registered: string | Date | null;
  date_arrived: string | Date | null;
  date_completed: string | Date | null;
  pickup_ready_at: string | Date | null;
  pickup_date: string | Date | null;
  service_level: string | null;
  is_reholder_or_crc: 0 | 1;
  shipment_raw: string | null;
  turnaround_days: number | null;
  turnaround_days_high: number | null;
  estimated_completion: string | Date | null;
  estimated_completion_upper: string | Date | null;
}

function normalize(invoice: string): string {
  return invoice.trim().toUpperCase();
}

export async function lookupInvoice(
  invoiceRaw: string
): Promise<LookupResult | null> {
  const invoice = normalize(invoiceRaw);
  if (!invoice) return null;

  if (config.lookup.cacheTtlSeconds > 0) {
    const hit = cache.get(invoice);
    if (hit !== undefined) return hit.result;
  }

  const rows = await query<Row>(SQL, [invoice]);
  const row = rows[0];
  const toIsoDate = (v: string | Date | null): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    // mysql2 with dateStrings=true returns 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm:ss'
    return String(v).slice(0, 10);
  };
  const toIso = (v: string | Date | null): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  };
  const estUpperDate = toIsoDate(row?.estimated_completion_upper) ??
    toIsoDate(row?.estimated_completion);

  const inProgress = row && !(
    row.status === "Picked Up" || row.status === "Ready for Pickup"
  );

  const isDelayed = !!(inProgress && estUpperDate && isAfterCalendar(new Date(), estUpperDate));

  let result: LookupResult | null = row
    ? {
        invoice: row.invoice_number,
        grading_company: row.grading_company,
        status: row.status,
        status_date: toIsoDate(row.status_date),
        submission_number:
          row.submission_number != null ? String(row.submission_number) : null,
        owner_email: row.owner_email,
        owner_login: row.owner_login,
        owner_display_name: row.owner_display_name,
        owner_phone: row.owner_phone,
        owner_registered: toIso(row.owner_registered),
        date_arrived: toIsoDate(row.date_arrived),
        date_completed: toIsoDate(row.date_completed),
        pickup_ready_at: toIso(row.pickup_ready_at),
        pickup_date: toIsoDate(row.pickup_date),
        service_level: row.service_level,
        is_reholder_or_crc: row.is_reholder_or_crc === 1,
        zone: null,
        shipment: formatShipmentLabel(row.shipment_raw) || null,
        turnaround_days: row.turnaround_days ?? null,
        turnaround_days_high: row.turnaround_days_high ?? null,
        estimated_completion: toIsoDate(row.estimated_completion),
        estimated_completion_upper: toIsoDate(row.estimated_completion_upper),
        is_delayed: isDelayed,
      }
    : null;

  if (result && result.status === "Ready for Pickup") {
    const z = getZoneForInvoice(result.invoice);
    result = { ...result, zone: { id: z.id, name: z.name } };
  }

  if (config.lookup.cacheTtlSeconds > 0) {
    cache.set(invoice, { result });
  }
  return result;
}

export function invalidateLookupCache(invoice?: string): void {
  if (invoice) cache.delete(normalize(invoice));
  else cache.clear();
}
