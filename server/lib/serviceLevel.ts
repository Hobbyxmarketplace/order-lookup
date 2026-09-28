/**
 * Parse the `service_level` freeform string from `order_lookup_invoice_details`
 * into structured fields.
 *
 * Real-world formats (validated against 44,831 rows):
 *   "PSA - Value Bulk (Amount: 285.00 HKD, Quantity: 1)\nTotal: 285.00 HKD"
 *   "BGS - Standard (Subgrades) (Amount: 520.00 HKD, Quantity: 1)\nTotal: 520.00 HKD"
 *   "CGC - Economy (Amount: 170.00 HKD, Quantity: 1)\nTotal: 170.00 HKD"
 *   "GEA - Kouki Saitou 春天 (Amount: 200.00 HKD, Quantity: 1)\nTotal: 200.00 HKD"
 *   "PSA - Reholder 100000 (Amount: 3,580.00 HKD, 數量: 2)\nTotal: 7,160.00 HKD"
 *   "PSA - Value Bulk Special (Amount: 210.00 HKD, Quantity: 126, Batch: #_1:)\nTotal: 26,460.00 HKD"
 *   Multi-line: "PSA - Value Bulk (...)\\nPSA - Value Plus (...)\\nTotal: ..."
 *   Edge: "Total: 0.00" (no company/service info)
 */

export type Company = "PSA" | "BGS" | "CGC" | "GEA" | "Unknown";

const KNOWN_COMPANIES: Company[] = ["PSA", "BGS", "CGC", "GEA"];

export interface ParsedServiceLevel {
  company: Company;
  /** Service name before the first '(', trimmed. e.g. "Standard (Subgrades)". */
  service: string | null;
  /** Sum of Quantity / Special Quantity / 數量 across all line items. */
  quantity: number | null;
}

/** Match "Quantity: 12", "Special Quantity: 12", "數量: 12", "數量：12" (full-width colon). */
const QUANTITY_RE = /(?:Special\s+Quantity|Quantity|數量)\s*[:：]\s*(\d+)/g;

/**
 * Sum every Quantity keyword hit across the whole string. Multi-line orders
 * concatenate several line items with their own Quantity — we want the total.
 */
export function extractQuantity(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let total = 0;
  let matched = false;
  for (const m of raw.matchAll(QUANTITY_RE)) {
    total += parseInt(m[1], 10);
    matched = true;
  }
  return matched ? total : null;
}

/**
 * Extract the company prefix (first token before the first ' - ').
 * Returns "Unknown" if none of the known companies matches.
 */
export function extractCompany(raw: string | null | undefined): Company {
  if (!raw) return "Unknown";
  const firstLine = raw.split("\n")[0];
  const idx = firstLine.indexOf(" - ");
  if (idx < 0) return "Unknown";
  const prefix = firstLine.slice(0, idx).trim().toUpperCase();
  return (KNOWN_COMPANIES as string[]).includes(prefix)
    ? (prefix as Company)
    : "Unknown";
}

/**
 * Extract the service name from the first line: text between the first ' - '
 * and the first '('.
 */
export function extractService(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const firstLine = raw.split("\n")[0];
  const dashIdx = firstLine.indexOf(" - ");
  if (dashIdx < 0) return null;
  const after = firstLine.slice(dashIdx + 3);
  const parenIdx = after.indexOf("(");
  const name = (parenIdx >= 0 ? after.slice(0, parenIdx) : after).trim();
  return name || null;
}

export function parseServiceLevel(raw: string | null | undefined): ParsedServiceLevel {
  return {
    company: extractCompany(raw),
    service: extractService(raw),
    quantity: extractQuantity(raw),
  };
}

/** Format an item count as "1 item" / "2 items" / "— items" (null case). */
export function formatItems(n: number | null | undefined): string {
  if (n == null) return "— items";
  return n === 1 ? "1 item" : `${n} items`;
}
