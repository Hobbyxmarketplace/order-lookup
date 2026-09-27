import { useEffect, useRef, useState } from "react";
import { api, type AuditRow } from "../api";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmtDateTime(v: string | null): string {
  if (!v) return "-";
  // SQLite datetime('now') writes as "YYYY-MM-DD HH:MM:SS" in UTC.
  const iso = v.includes("T") ? v : v.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [invoiceInput, setInvoiceInput] = useState("");
  const [actorInput, setActorInput] = useState("");
  const debouncedInvoice = useDebounced(invoiceInput.trim(), DEBOUNCE_MS);
  const debouncedActor = useDebounced(actorInput.trim(), DEBOUNCE_MS);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);
    api
      .auditMoves(
        {
          invoice: debouncedInvoice,
          actor: debouncedActor,
          limit: PAGE_SIZE,
          offset,
        },
        ac.signal
      )
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: any) => {
        if (e?.name !== "AbortError") setErr(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [debouncedInvoice, debouncedActor, offset]);

  useEffect(() => setOffset(0), [debouncedInvoice, debouncedActor]);

  return (
    <div className="page audit">
      <h1>Move history</h1>
      <p className="lede">
        Every zone move made through the tool. Newest first.
      </p>

      <div className="filters-bar">
        <div className="search-field">
          <input
            type="search"
            placeholder="Filter by invoice number"
            value={invoiceInput}
            onChange={(e) => setInvoiceInput(e.target.value)}
            aria-label="Filter by invoice number"
          />
          {invoiceInput && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setInvoiceInput("")}
              aria-label="Clear invoice filter"
            >
              ×
            </button>
          )}
        </div>
        <div className="search-field">
          <input
            type="search"
            placeholder="Filter by user (e.g. staff1)"
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            aria-label="Filter by user"
          />
          {actorInput && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setActorInput("")}
              aria-label="Clear user filter"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="notice error" role="alert" aria-live="assertive">
          {err}
        </div>
      )}

      <div className={`table-wrap${loading ? " is-loading" : ""}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Invoice</th>
              <th>From</th>
              <th>To</th>
              <th>User</th>
              <th className="col-created">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <span className="spinner inline" /> Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {debouncedInvoice || debouncedActor
                    ? "No moves match these filters."
                    : "No moves have been recorded yet."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>
                  {fmtDateTime(r.moved_at)}
                </td>
                <td className="mono">{r.invoice_number}</td>
                <td>
                  {r.from_zone_name ? (
                    <span className="zone-chip">{r.from_zone_name}</span>
                  ) : (
                    <span className="muted">— (first assignment)</span>
                  )}
                </td>
                <td>
                  {r.to_zone_name ? (
                    <span className="zone-chip">{r.to_zone_name}</span>
                  ) : (
                    <span className="muted">deleted zone #{r.to_zone_id}</span>
                  )}
                </td>
                <td>{r.actor_user}</td>
                <td className="mono col-created">{r.actor_ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <span className="pager-info">
          {total === 0
            ? loading
              ? "Loading…"
              : "0 results"
            : `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`}
        </span>
        <button
          disabled={offset + rows.length >= total || loading}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
