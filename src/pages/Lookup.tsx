import { useState } from "react";
import { api, LookupResult, type Me } from "../api";
import Stepper from "../components/Stepper";
import MoveZoneDialog from "../components/MoveZoneDialog";
import EyeIcon from "../components/EyeIcon";

function statusSlug(status: string): string {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateRange(from: string | null, to: string | null): string {
  const a = fmtDate(from);
  const b = fmtDate(to);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b;
}

function fmtTurnaround(low: number | null, high: number | null): string {
  if (low != null && high != null && low !== high) return `${low}–${high} days`;
  if (low != null) return `${low} days`;
  if (high != null) return `${high} days`;
  return "";
}

function fmtItems(n: number | null): string {
  if (n == null) return "— items";
  return n === 1 ? "1 item" : `${n} items`;
}

/** One "field" inside an info block: an uppercase label + a value. */
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`field${wide ? " field--wide" : ""}`}>
      <div className="field-k">{label}</div>
      <div className="field-v">{children}</div>
    </div>
  );
}

export default function Lookup({ me }: { me: Me }) {
  const canMove = me.role === "admin" || (me.can_move ?? true);
  const [invoice, setInvoice] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [showSubmission, setShowSubmission] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Any new lookup should re-redact the submission number.
    setShowSubmission(false);
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

  const est =
    result &&
    fmtDateRange(
      result.estimated_completion,
      result.estimated_completion_upper
    );
  const turn =
    result &&
    fmtTurnaround(result.turnaround_days, result.turnaround_days_high);

  return (
    <div
      className={`page lookup${result ? " has-result" : ""}${
        result?.is_non_psa ? " non-psa" : ""
      }`}
    >
      <h1>Order lookup</h1>
      {!result && (
        <p className="lede">
          Enter the invoice number to see the current grading status,
          estimated completion date, and warehouse zone.
        </p>
      )}

      <div className="filters-bar">
        <form className="lookup-form" onSubmit={submit}>
          <div className="search-field">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden
            >
              <path
                d="M10.5 4a6.5 6.5 0 1 1-4.192 11.474l-3.16 3.161a1 1 0 1 1-1.414-1.414l3.16-3.16A6.5 6.5 0 0 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
                fill="currentColor"
              />
            </svg>
            <input
              autoFocus
              placeholder="Invoice number (e.g. H136260)"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              aria-label="Invoice number"
            />
          </div>
          <button className="primary" disabled={busy || !invoice.trim()}>
            {busy ? "Checking..." : "Submit"}
          </button>
        </form>
      </div>

      {busy && (
        <section
          className="result order-card two-col skeleton"
          aria-hidden
          aria-busy="true"
        >
          <div className="order-main">
            <header className="order-head">
              <div className="order-title">
                <span className="sk sk-badge" />
                <span className="sk sk-line sk-line--md" />
                <span className="sk sk-chip" />
              </div>
            </header>

            <div className="info-block">
              <div className="field">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--sm" />
              </div>
              <div className="field">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--sm" />
              </div>
              <div className="field">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--sm" />
              </div>
            </div>

            <div className="info-block">
              <div className="field">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--sm" />
              </div>
              <div className="field field--wide">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--lg" />
              </div>
            </div>

            <div className="info-block">
              <div className="field field--wide">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--md" />
              </div>
              <div className="field">
                <span className="sk sk-line sk-line--xs" />
                <span className="sk sk-line sk-line--sm" />
              </div>
            </div>
          </div>

          <aside className="order-progress">
            <div className="progress-title">Progress</div>
            <ol className="stepper">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="step">
                  <span className="sk sk-dot" />
                  <div className="step-body">
                    <span className="sk sk-line sk-line--md" />
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      )}

      {err && !busy && (
        <div className="notice error" role="alert" aria-live="assertive">
          {err}
        </div>
      )}

      {result && !busy && (
        <section
          className={`result order-card${result.is_non_psa ? " single-col" : " two-col"}`}
          data-status={statusSlug(result.status)}
        >
          <div className="order-main">
            <header className="order-head">
              <div className="order-title">
                <span className="company-badge">{result.grading_company}</span>
                <span className="order-service mono">
                  {result.invoice}
                </span>
                {result.zone && (
                  <span className="zone-chip in-title">{result.zone.name}</span>
                )}
              </div>
            </header>

            {result.is_delayed && (
              <div className="notice error delay-banner">
                This order is past its estimated completion date. PSA is still
                working on it.
              </div>
            )}

            {/* Block 1: order identifiers.
             * PSA has a submission number so we use the 4-col grid with the
             * redact + eye toggle. Non-PSA invoices (BGS/CGC/GEA) never carry
             * a submission number, so we drop that column entirely and use
             * the 3-col grid — cleaner than rendering a permanent em-dash. */}
            {result.is_non_psa ? (
              <div className="info-block info-block--3">
                <Field label="Service">
                  {result.service_level || "—"}
                </Field>
                <Field label="Shipment">{result.shipment || "—"}</Field>
                <Field label="Items">{fmtItems(result.items)}</Field>
              </div>
            ) : (
              <div className="info-block info-block--4">
                <Field label="Service">
                  {result.service_level || "—"}
                </Field>
                <Field label="Submission">
                  {result.submission_number ? (
                    <span className="redacted-value">
                      <span className="mono" aria-live="polite">
                        {showSubmission
                          ? result.submission_number
                          : // Fixed-length mask so the surrounding grid
                            // never jumps when toggled.
                            "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                      </span>
                      <button
                        type="button"
                        className="reveal-toggle"
                        onClick={() => setShowSubmission((v) => !v)}
                        aria-label={
                          showSubmission
                            ? "Hide submission number"
                            : "Show submission number"
                        }
                        aria-pressed={showSubmission}
                      >
                        <EyeIcon open={!showSubmission} />
                      </button>
                    </span>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Shipment">{result.shipment || "—"}</Field>
                <Field label="Items">{fmtItems(result.items)}</Field>
              </div>
            )}

            {/* Block 2: customer. Grid tracks mirror Block 1 so columns
             * line up top-to-bottom in both PSA and non-PSA layouts:
             *   PSA (4-col):   Customer | Phone | Email (spans Shipment+Items)
             *   non-PSA (3-col): Customer | Phone | Email (spans Items col)
             */}
            {(result.owner_display_name ||
              result.owner_email ||
              result.owner_phone) && (
              <div
                className={`info-block ${
                  result.is_non_psa ? "info-block--3" : "info-block--4"
                }`}
              >
                <Field label="Customer">
                  {result.owner_display_name || "—"}
                </Field>
                <Field label="Phone">
                  {result.owner_phone ? (
                    <a href={`tel:${result.owner_phone}`}>
                      {result.owner_phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field label="Email" wide>
                  {result.owner_email ? (
                    <a href={`mailto:${result.owner_email}`}>
                      {result.owner_email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Field>
              </div>
            )}

            {/* Block 3: schedule */}
            {(est || turn) && (
              <div className="info-block">
                {est && (
                  <Field label="Estimated completion" wide>
                    {est}
                  </Field>
                )}
                {turn && <Field label="Turnaround">{turn}</Field>}
              </div>
            )}

            {result.zone && canMove && (
              <div className="order-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setMoveOpen(true)}
                >
                  Move to another zone
                </button>
              </div>
            )}
          </div>

          {!result.is_non_psa && (
            <aside className="order-progress">
              <div className="progress-title">Progress</div>
              <Stepper result={result} />
            </aside>
          )}
        </section>
      )}

      {moveOpen && result && result.zone && (
        <MoveZoneDialog
          invoice={result.invoice}
          currentZoneId={result.zone.id}
          onClose={() => setMoveOpen(false)}
          onMoved={(z) => setResult({ ...result, zone: z })}
        />
      )}
    </div>
  );
}
