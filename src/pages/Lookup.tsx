import { useState } from "react";
import { api, LookupResult } from "../api";
import Stepper from "../components/Stepper";

function statusSlug(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function fmtDate(v: unknown): string {
  if (v == null || v === "") return "-";
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtYear(v: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 4);
  return String(d.getFullYear());
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
        <>
          <section className="result" data-status={statusSlug(result.status)}>
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
                <span className="value">{fmtDate(result.status_date)}</span>
              </div>
            </div>
            <div className="invoice-echo">
              Invoice #{result.invoice}
              {result.submission_number && (
                <> - Submission #{result.submission_number}</>
              )}
              {result.service_level && <> - {result.service_level}</>}
            </div>
          </section>

          {(result.owner_email || result.owner_login) && (
            <section className="user-card">
              <h2>Customer</h2>
              <div className="kv">
                {result.owner_email && (
                  <>
                    <div className="k">Email</div>
                    <div className="v">
                      <a href={`mailto:${result.owner_email}`}>
                        {result.owner_email}
                      </a>
                    </div>
                  </>
                )}
                {result.owner_login && (
                  <>
                    <div className="k">Username</div>
                    <div className="v">{result.owner_login}</div>
                  </>
                )}
                {result.owner_registered && (
                  <>
                    <div className="k">Member since</div>
                    <div className="v">{fmtYear(result.owner_registered)}</div>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="stepper-card">
            <h2>Progress</h2>
            <Stepper result={result} />
          </section>
        </>
      )}
    </div>
  );
}
