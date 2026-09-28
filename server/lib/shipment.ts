/**
 * Format the raw `Shipment(ME)` string into the display label the mobile
 * backend produces, then apply the English abbreviation pass the mobile app
 * frontend runs on top.
 *
 * Ported directly from `HobbyX_Shipment_Formatter::format()` (PHP) and
 * `getGradingShipmentLabel()` (TypeScript) so the desk tool speaks the same
 * shipment language as customers.
 *
 * Examples (English only — Chinese variants intentionally omitted):
 *   "PSA #1 6/2026"           -> "Jun 26 - 1st Shipment"
 *   "PSA #2 6/2026"           -> "Jun 26 - 2nd Shipment"
 *   "PSA #Grade10 11/2025"    -> "Nov 25 - Grade10"
 *   "PSA #1.5 6/2026"         -> "Jun 26 - Special Shipment"
 *   "PSA #ComicCon 6/2026"    -> "Jun 26 - ComicCon"
 *   "6/2026 - Comic Con"      -> "Jun 26 - Comic Con"
 *   "June 26 - 1st Shipment"  -> "Jun 26 - 1st Shipment"  (pass-through + abbrev)
 *   ""                        -> ""
 */

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ENGLISH_MONTH_ABBREV: Record<string, string> = {
  january: "Jan", jan: "Jan",
  february: "Feb", feb: "Feb",
  march: "Mar", mar: "Mar",
  april: "Apr", apr: "Apr",
  may: "May",
  june: "Jun", jun: "Jun",
  july: "Jul", jul: "Jul",
  august: "Aug", aug: "Aug",
  september: "Sep", sep: "Sep", sept: "Sep",
  october: "Oct", oct: "Oct",
  november: "Nov", nov: "Nov",
  december: "Dec", dec: "Dec",
};

const FULL_MONTH_REGEX = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;

/** `1 -> 1st`, `2 -> 2nd`, `3 -> 3rd`, `11 -> 11th`, `21 -> 21st`. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function twoDigitYear(year: number): string {
  return String(year % 100).padStart(2, "0");
}

function fullMonth(month: number): string | null {
  if (month < 1 || month > 12) return null;
  return FULL_MONTHS[month - 1];
}

function shortMonth(month: number): string | null {
  if (month < 1 || month > 12) return null;
  return SHORT_MONTHS[month - 1];
}

/** Replace full month names in-place with 3-letter abbreviations. */
function abbrevMonthsInText(text: string): string {
  return text.replace(FULL_MONTH_REGEX, (m) => {
    return ENGLISH_MONTH_ABBREV[m.toLowerCase()] ?? m;
  });
}

/** Match e.g. "PSA #1 6/2026", "PSA #Grade10 6/2026", "#1 6/2026". */
const NUMERIC_PATTERNS: RegExp[] = [
  /^PSA #(?:[A-Za-z]+)?(\d+(?:\.\d+)?)\s(\d{1,2})\/(\d{4})$/i,
  /^#(\d+(?:\.\d+)?)\s(\d{1,2})\/(\d{4})$/,
];

/** Match e.g. "6/2026 - Comic Con". */
const MONTH_YEAR_FIRST = /^(\d{1,2})\/(\d{4})\s*-\s*(.+)$/i;

/** Match e.g. "PSA #ComicCon 6/2026", "#ComicCon 6/2026", "ComicCon 6/2026". */
const NAMED_TRAILING = /^(?:PSA\s+)?#?\s*([A-Za-z][A-Za-z0-9\s]*?)\s+(\d{1,2})\/(\d{4})$/i;

function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/\s+Shipment$/i, "")
    .trim();
}

function buildNamed(name: string, month: number, year: number): string | null {
  const short = shortMonth(month);
  if (!short) return null;
  return `${short} ${twoDigitYear(year)} - ${normalizeName(name)}`;
}

function tryNumericPsa(raw: string): string | null {
  const isShipment = !raw.includes("#Grade");
  for (const pattern of NUMERIC_PATTERNS) {
    const m = raw.match(pattern);
    if (!m) continue;
    const shippingNumber = m[1];
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const full = fullMonth(month);
    if (!full) return null;
    const monthYear = `${full} ${twoDigitYear(year)}`;
    if (isShipment) {
      if (shippingNumber.includes(".")) {
        return `${monthYear} - Special Shipment`;
      }
      return `${monthYear} - ${ordinal(parseInt(shippingNumber, 10))} Shipment`;
    }
    return `${monthYear} - Grade${shippingNumber}`;
  }
  return null;
}

/**
 * Convert a raw DB shipment label (or an already-formatted mobile-API label)
 * to the English display string the mobile app shows on-screen.
 */
export function formatShipmentLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";

  // "6/2026 - Comic Con" (month/year first).
  const first = trimmed.match(MONTH_YEAR_FIRST);
  if (first) {
    const out = buildNamed(first[3], parseInt(first[1], 10), parseInt(first[2], 10));
    if (out) return abbrevMonthsInText(out);
  }

  // Numeric PSA labels.
  const numeric = tryNumericPsa(trimmed);
  if (numeric) return abbrevMonthsInText(numeric);

  // Named PSA labels.
  const named = trimmed.match(NAMED_TRAILING);
  if (named) {
    const out = buildNamed(named[1], parseInt(named[2], 10), parseInt(named[3], 10));
    if (out) return abbrevMonthsInText(out);
  }

  // Already-formatted "June 26 - Xxx" style (or anything else) — just abbrev.
  return abbrevMonthsInText(trimmed);
}

/**
 * Build a shipment label from the intake-form group code + submission month/year.
 * Used for non-PSA orders where we have no `Shipment(ME)` string.
 *
 * Examples:
 *   ('#1',       2026, 8)  -> 'Aug 26 - 1st Shipment'
 *   ('#2',       2026, 8)  -> 'Aug 26 - 2nd Shipment'
 *   ('#1.5',     2026, 8)  -> 'Aug 26 - Special Shipment'
 *   ('#Grade10', 2026, 8)  -> 'Aug 26 - Grade10'
 *   ('#Comic Con', 2026, 8) -> 'Aug 26 - Comic Con'
 *
 * Returns an empty string when we can't derive anything meaningful.
 */
export function buildShipmentFromGroup(
  groupCode: string | null | undefined,
  year: number | null | undefined,
  month: number | null | undefined
): string {
  if (!groupCode || year == null || month == null) return "";
  const short = shortMonth(month);
  if (!short) return "";
  const monthYear = `${short} ${twoDigitYear(year)}`;

  // Strip leading '#' if present.
  const code = groupCode.trim().replace(/^#/, "").trim();
  if (!code) return "";

  // Numeric-only: 1, 2, 3 -> "1st Shipment", etc.
  const numeric = /^(\d+)$/.exec(code);
  if (numeric) {
    return `${monthYear} - ${ordinal(parseInt(numeric[1], 10))} Shipment`;
  }

  // Decimal (e.g. 1.5) -> Special Shipment.
  if (/^\d+\.\d+$/.test(code)) {
    return `${monthYear} - Special Shipment`;
  }

  // Named (Grade10, Comic Con, etc.) -> keep name as-is.
  return `${monthYear} - ${code}`;
}
