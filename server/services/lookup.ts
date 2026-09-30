import { LRUCache } from "lru-cache";
import { query } from "../db/pool.js";
import { loadSql } from "../db/read-sql.js";
import { config } from "../config.js";
import type { LookupResult } from "../types.js";
import { getZoneForInvoice } from "../db/zones.js";
import { formatShipmentLabel, buildShipmentFromGroup } from "../lib/shipment.js";
import { parseServiceLevel } from "../lib/serviceLevel.js";

// LRUCache values must be non-null; wrap in an object to allow "found: null".
type CacheEntry = { result: LookupResult | null };
const cache = new LRUCache<string, CacheEntry>({
  max: config.lookup.cacheMax,
  ttl: config.lookup.cacheTtlSeconds * 1000,
});

const SQL = loadSql("lookup-invoice");
const NONPSA_SQL = loadSql("lookup-nonpsa");
const COUNT_ITEMS_SQL = loadSql("count-items");

interface NonPsaRow {
  invoice_number: string;
  submission_date: string | Date | null;
  submitted_at: string | Date | null;
  submission_year: number | null;
  submission_month: number | null;
  group_code: string | null;
  handler: string | null;
  service_level_raw: string | null;
  first_name: string | null;
  last_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  owner_international_phone: string | null;
  preferred_language: string | null;
}

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
  if (!invoice || invoice === "T") return null;

  if (config.lookup.cacheTtlSeconds > 0) {
    const hit = cache.get(invoice);
    if (hit !== undefined) return hit.result;
  }

  const digitsOnly = invoice.replace(/\D/g, "");
  // SQL needs: exact-match, digits-only match, exact-match (again, for ORDER BY).
  const rows = await query<Row>(SQL, [invoice, digitsOnly, invoice]);
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
        owner_international_phone: null,
        items: null,
        is_non_psa: false,
      }
    : null;

  if (result && result.status === "Ready for Pickup") {
    const z = getZoneForInvoice(result.invoice);
    result = { ...result, zone: { id: z.id, name: z.name } };
  }

  // Attach PSA item count from psa_certOwners. Use the canonical invoice
  // number returned by the lookup query, not the raw user input — otherwise
  // digits-only searches (e.g. '141957' → 'H141957') miss the cert-count join.
  if (result) {
    try {
      const [c] = await query<{ items: number }>(COUNT_ITEMS_SQL, [
        result.invoice,
      ]);
      result = { ...result, items: c?.items ?? null };
    } catch (e: any) {
      console.error("[lookup] item count failed:", e.message);
    }
  }

  // No PSA hit? Try the intake table (BGS/CGC/GEA/unknown).
  if (!result) {
    result = await lookupNonPsa(invoice);
  }

  if (config.lookup.cacheTtlSeconds > 0) {
    cache.set(invoice, { result });
  }
  return result;
}

async function lookupNonPsa(invoice: string): Promise<LookupResult | null> {
  const digitsOnly = invoice.replace(/\D/g, "");
  // SQL: exact-match, digits-only match, exact-match (again for ORDER BY).
  const rows = await query<NonPsaRow>(NONPSA_SQL, [
    invoice,
    digitsOnly,
    invoice,
  ]);
  const row = rows[0];
  if (!row) return null;

  const parsed = parseServiceLevel(row.service_level_raw);

  // PSA source of truth is psa_certOwners. If this intake row parses as PSA
  // (or has no recognisable company), the invoice is either a PSA order that
  // never made it into the PSA pipeline or a garbage row — treat as 404.
  if (parsed.company === "PSA" || parsed.company === "Unknown") {
    return null;
  }
  const displayName = [row.first_name, row.last_name]
    .filter((s) => s && s.trim())
    .join(" ") || null;
  const contactPhone = row.owner_phone || row.owner_international_phone;
  const shipment = buildShipmentFromGroup(
    row.group_code,
    row.submission_year,
    row.submission_month
  ) || null;

  // Preserve exact stored invoice number (case), fall back to what user typed.
  const inv = row.invoice_number || invoice;

  let result: LookupResult = {
    invoice: inv,
    grading_company: parsed.company,
    status: "Non-PSA",
    status_date: null,
    submission_number: null,
    owner_email: row.owner_email,
    owner_login: null,
    owner_display_name: displayName,
    owner_phone: contactPhone,
    owner_international_phone: row.owner_international_phone,
    owner_registered: null,
    date_arrived: null,
    date_completed: null,
    pickup_ready_at: null,
    pickup_date: null,
    service_level: parsed.service,
    is_reholder_or_crc: false,
    zone: null,
    shipment,
    turnaround_days: null,
    turnaround_days_high: null,
    estimated_completion: null,
    estimated_completion_upper: null,
    is_delayed: false,
    items: parsed.quantity,
    is_non_psa: true,
  };

  // Every non-PSA invoice defaults to the default zone; explicit assignments
  // in invoice_zones override it (same sparse model as PSA).
  const z = getZoneForInvoice(inv);
  result = { ...result, zone: { id: z.id, name: z.name } };

  return result;
}

export function invalidateLookupCache(invoice?: string): void {
  if (invoice) cache.delete(normalize(invoice));
  else cache.clear();
}
