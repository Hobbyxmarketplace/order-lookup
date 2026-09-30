export interface LookupResult {
  invoice: string;
  grading_company: string;
  status: string;
  status_date: string | null;
  submission_number: string | null;

  owner_email: string | null;
  owner_login: string | null;
  owner_display_name: string | null;
  owner_phone: string | null;
  owner_international_phone: string | null;
  owner_registered: string | null;

  date_arrived: string | null;
  date_completed: string | null;
  pickup_ready_at: string | null;
  pickup_date: string | null;

  service_level: string | null;
  is_reholder_or_crc: boolean;

  zone: { id: number; name: string } | null;

  shipment: string | null;

  turnaround_days: number | null;
  turnaround_days_high: number | null;
  estimated_completion: string | null;
  estimated_completion_upper: string | null;

  is_delayed: boolean;

  /** Physical item count. PSA: cert rows. Non-PSA: sum of Quantity. */
  items: number | null;

  /** True for BGS/CGC/GEA (no live status, no stepper). */
  is_non_psa: boolean;
}

export interface Zone {
  id: number;
  name: string;
  is_default: 0 | 1;
  created_at: string;
  invoice_count: number;
}

export interface ReadyPickupItem {
  invoice: string;
  company: string;
  submission_number: string | null;
  owner_email: string | null;
  owner_name: string | null;
  pickup_ready_at: string | null;
  received_at: string | null;
  zone: { id: number; name: string };
  items: number | null;
}

export interface ReadyPickupPage {
  items: ReadyPickupItem[];
  total: number;
  limit: number;
  offset: number;
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

export interface AuditPage {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    // Network failure, DNS, offline, CORS reject, etc.
    throw new Error(
      "We couldn't reach the server. Please check your connection and try again."
    );
  }
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Server returned non-JSON (e.g. a gateway HTML error page)
    if (!res.ok) {
      throw new Error(
        "Something went wrong on our end. Please try again in a moment."
      );
    }
  }
  if (res.status === 401 && !url.endsWith("/api/login")) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!res.ok) {
    throw new Error(
      data.error ||
        "Something went wrong. Please try again in a moment."
    );
  }
  return data as T;
}

export type Role = "admin" | "staff";

export interface Me {
  user: string;
  role: Role;
  /**
   * Whether this account is allowed to assign invoices to zones.
   * Admins always get `true`; staff accounts carry a per-user flag.
   * Optional on the type so older cached JSON keeps parsing —
   * missing = treated as `true` (legacy behaviour) in the UI.
   */
  can_move?: boolean;
}

export const api = {
  me: () => req<Me>("/api/me"),
  login: (username: string, password: string) =>
    req<{ ok: true; user: string; role: Role; can_move: boolean }>(
      "/api/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }
    ),
  logout: () => req<{ ok: true }>("/api/logout", { method: "POST" }),
  lookup: (invoice: string) =>
    req<LookupResult>(`/api/lookup?invoice=${encodeURIComponent(invoice)}`),

  zones: () => req<{ zones: Zone[] }>("/api/zones"),
  createZone: (name: string) =>
    req<Zone>("/api/zones", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  patchZone: (id: number, patch: { name?: string; isDefault?: boolean }) =>
    req<{ ok: true }>(`/api/zones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteZone: (id: number, migrateToZoneId: number) =>
    req<{ ok: true }>(`/api/zones/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ migrateToZoneId }),
    }),

  moveInvoice: (invoice: string, zoneId: number) =>
    req<{ ok: true }>(
      `/api/invoices/${encodeURIComponent(invoice)}/move`,
      { method: "POST", body: JSON.stringify({ zoneId }) }
    ),
  bulkMoveInvoices: (invoices: string[], zoneId: number) =>
    req<{ ok: true; updated: number; skipped: number }>(
      "/api/invoices/bulk-move",
      {
        method: "POST",
        body: JSON.stringify({ invoices, zoneId }),
      }
    ),
  readyForPickup: (
    opts: {
      search?: string;
      limit?: number;
      offset?: number;
      zoneIds?: number[];
      companies?: string[];
    } = {},
    signal?: AbortSignal
  ) => {
    const p = new URLSearchParams();
    if (opts.search) p.set("search", opts.search);
    if (opts.limit) p.set("limit", String(opts.limit));
    if (opts.offset) p.set("offset", String(opts.offset));
    if (opts.zoneIds && opts.zoneIds.length > 0)
      p.set("zoneIds", opts.zoneIds.join(","));
    if (opts.companies && opts.companies.length > 0)
      p.set("companies", opts.companies.join(","));
    const q = p.toString();
    return req<ReadyPickupPage>(
      "/api/invoices/ready-for-pickup" + (q ? `?${q}` : ""),
      { signal }
    );
  },

  auditMoves: (
    opts: {
      invoice?: string;
      actor?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      offset?: number;
    } = {},
    signal?: AbortSignal
  ) => {
    const p = new URLSearchParams();
    if (opts.invoice) p.set("invoice", opts.invoice);
    if (opts.actor) p.set("actor", opts.actor);
    if (opts.fromDate) p.set("fromDate", opts.fromDate);
    if (opts.toDate) p.set("toDate", opts.toDate);
    if (opts.limit) p.set("limit", String(opts.limit));
    if (opts.offset) p.set("offset", String(opts.offset));
    const q = p.toString();
    return req<AuditPage>(
      "/api/audit/moves" + (q ? `?${q}` : ""),
      { signal }
    );
  },
};
