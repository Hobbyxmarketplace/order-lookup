import type { LookupResult } from "../api";

interface Step {
  key: string;
  label: string;
  date: string | null;
  description?: string;
}

const STANDARD_KEYS = [
  "orderArrived",
  "research",
  "grading",
  "assembly",
  "gradesReady",
  "completing",
  "pickupReady",
] as const;

const REHOLDER_KEYS = [
  "orderArrived",
  "research",
  "assembly",
  "gradesReady",
  "completing",
  "pickupReady",
] as const;

const LABELS: Record<string, string> = {
  orderArrived: "Order Arrived",
  research: "Research and ID",
  grading: "Grading",
  assembly: "Assembly",
  gradesReady: "Grades Ready",
  completing: "Completing",
  pickupReady: "Ready for Pickup",
  pickedUp: "Picked Up",
};

const DESCRIPTIONS: Record<string, string> = {
  orderArrived: "Your submission has arrived at PSA.",
  research: "Your submission is being researched and identified.",
  grading: "Your cards are being graded by PSA.",
  assembly: "Your cards are being assembled.",
  gradesReady: "Grades are ready. Finalising your order.",
  completing: "Your order is being completed and prepared for pickup.",
  pickupReady: "Your order is ready to be collected.",
  pickedUp: "Order has been picked up. Thank you!",
};

function fmtDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusToStepKey(status: string): string {
  const s = status.toLowerCase();
  if (s === "picked up") return "pickedUp";
  if (s === "ready for pickup" || s === "pickup ready") return "pickupReady";
  if (s === "completing" || s === "complete") return "completing";
  if (s === "grades ready") return "gradesReady";
  if (s === "assembly") return "assembly";
  if (s === "grading") return "grading";
  if (s === "research and id" || s === "research & id") return "research";
  if (s === "order arrived") return "orderArrived";
  return "orderArrived"; // Shipping and unknown → treat as not-yet-arrived (index 0 dim)
}

export function buildSteps(r: LookupResult): {
  steps: Step[];
  currentIdx: number;
  isPickedUp: boolean;
} {
  const keys = [
    ...(r.is_reholder_or_crc ? REHOLDER_KEYS : STANDARD_KEYS),
  ] as string[];
  const isPickedUp = statusToStepKey(r.status) === "pickedUp";
  if (isPickedUp) keys.push("pickedUp");

  const dates: Record<string, string | null> = {
    orderArrived: r.date_arrived,
    completing: r.date_completed,
    pickupReady: r.pickup_ready_at,
    pickedUp: r.pickup_date,
  };

  const steps: Step[] = keys.map((k) => ({
    key: k,
    label: LABELS[k],
    date: dates[k] ?? null,
    description: DESCRIPTIONS[k],
  }));

  let currentIdx = keys.indexOf(statusToStepKey(r.status));
  if (r.status.toLowerCase() === "shipping") currentIdx = 0;
  if (currentIdx < 0) currentIdx = 0;
  return { steps, currentIdx, isPickedUp };
}

function StepIcon({
  state,
}: {
  state: "done" | "current" | "future" | "picked";
}) {
  if (state === "done" || state === "picked") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 12l5 5L20 7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null; // future = empty circle
}

export default function Stepper({ result }: { result: LookupResult }) {
  const { steps, currentIdx, isPickedUp } = buildSteps(result);

  return (
    <ol className="stepper">
      {steps.map((s, i) => {
        const done = i < currentIdx || (isPickedUp && s.key === "pickedUp");
        const current = !isPickedUp && i === currentIdx;
        const state: "done" | "current" | "future" | "picked" = isPickedUp
          ? s.key === "pickedUp"
            ? "picked"
            : "done"
          : done
            ? "done"
            : current
              ? "current"
              : "future";
        const dateStr = fmtDate(s.date);
        return (
          <li key={s.key} className={`step step--${state}`}>
            <div className="step-line" aria-hidden />
            <div className="step-dot" aria-hidden>
              <StepIcon state={state} />
            </div>
            <div className="step-body">
              <div className="step-head">
                <span className="step-label">{s.label}</span>
                {dateStr && <span className="step-date">{dateStr}</span>}
              </div>
              {current && s.description && (
                <div className="step-desc">{s.description}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
