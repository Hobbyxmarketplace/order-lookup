import { LRUCache } from "lru-cache";
import { query } from "../db/pool.js";
import { loadSql } from "../db/read-sql.js";
import { config } from "../config.js";
import type { LookupResult } from "../types.js";

// LRUCache values must be non-null; wrap in an object to allow "found: null".
type CacheEntry = { result: LookupResult | null };
const cache = new LRUCache<string, CacheEntry>({
  max: config.lookup.cacheMax,
  ttl: config.lookup.cacheTtlSeconds * 1000,
});

const SQL = loadSql("lookup-invoice");

interface Row {
  grading_company: string;
  invoice_number: string;
  submission_number: string | number | null;
  status: string;
  status_date: string | Date | null;
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
  const result: LookupResult | null = row
    ? {
        invoice: row.invoice_number,
        grading_company: row.grading_company,
        status: row.status,
        status_date:
          row.status_date instanceof Date
            ? row.status_date.toISOString().slice(0, 10)
            : row.status_date,
        submission_number:
          row.submission_number != null ? String(row.submission_number) : null,
      }
    : null;

  if (config.lookup.cacheTtlSeconds > 0) {
    cache.set(invoice, { result });
  }
  return result;
}

export function invalidateLookupCache(invoice?: string): void {
  if (invoice) cache.delete(normalize(invoice));
  else cache.clear();
}
