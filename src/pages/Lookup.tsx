import { useState } from "react";
import { api, LookupResult } from "../api";

function statusSlug(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(v: unknown): string {
  if (v == null || v === "") return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "picked up") return "Picked up on";
  if (s === "ready for pickup") return "Ready date";
  if (s === "completing") return "Completed";
  return "Status date";
}

export default function Lookup() {
  const [invoice, setInvoice] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = invoice.trim();
    if (!q) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.lookup(q);
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page lookup">
      <h1>Check your order status</h1>
      <p className="lede">
        Enter your invoice number to see the current grading status and
        ready-for-pickup date.
      </p>

      <form className="lookup-form" onSubmit={submit}>
        <input
          autoFocus
          placeholder="Invoice number (e.g. H136260)"
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
        />
        <button className="primary" disabled={busy || !invoice.trim()}>
          {busy ? "Checking..." : "Submit"}
        </button>
      </form>

      {busy && (
        <div className="result skeleton" aria-hidden>
          <div className="row">
            <div className="col">
              <span className="label">Grading</span>
              <span className="value">loading</span>
            </div>
            <div className="col">
              <span className="label">Status</span>
              <span className="value">loading</span>
            </div>
            <div className="col">
              <span className="label">Date</span>
              <span className="value">loading</span>
            </div>
          </div>
        </div>
      )}

      {err && !busy && <div className="notice error">{err}</div>}

      {result && !busy && (
        <div className="result" data-status={statusSlug(result.status)}>
          <div className="row">
            <div className="col">
              <span className="label">Grading</span>
              <span className="value company">{result.grading_company}</span>
            </div>
            <div className="col">
              <span className="label">Status</span>
              <span className="value status">{result.status}</span>
            </div>
            <div className="col">
              <span className="label">{dateLabel(result.status)}</span>
              <span className="value">{formatDate(result.status_date)}</span>
            </div>
          </div>
          <div className="invoice-echo">Invoice #{result.invoice}</div>
        </div>
      )}
    </div>
  );
}
