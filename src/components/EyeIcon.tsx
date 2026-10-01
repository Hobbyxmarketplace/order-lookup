/**
 * Lucide-style eye / eye-off icon. Fixed 20x20 so swapping between
 * states never changes the button footprint. `vector-effect` keeps the
 * stroke crisp at any device pixel ratio.
 */
export default function EyeIcon({ open }: { open: boolean }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { display: "block" as const },
  };
  return open ? (
    <svg {...common}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M10.6 5.1a10.7 10.7 0 0 1 1.4-.1c6.5 0 10 7 10 7a17.5 17.5 0 0 1-3.2 4.1" />
      <path d="M6.7 6.7A17.5 17.5 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.3-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
