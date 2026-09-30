import { useState } from "react";
import { api, type Me } from "../api";

/**
 * Lucide-style eye / eye-off icon. Rendered inside a fixed 20×20 SVG box
 * so both states occupy the exact same pixel footprint and the toggle
 * button never jumps when the icon swaps. Uses `vector-effect:
 * non-scaling-stroke` so the stroke weight stays crisp at any DPR.
 */
function EyeIcon({ open }: { open: boolean }) {
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

export default function Login({ onLogin }: { onLogin: (m: Me) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.login(username, password);
      onLogin({ user: r.user, role: r.role, can_move: r.can_move });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-row">
          <span className="brand-dot" />
          Hobbyx <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Order Lookup</span>
        </div>
        <h1>Welcome</h1>
        <p className="lede">Sign in to look up an order status.</p>
        <label htmlFor="u">Username</label>
        <input
          id="u"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="p">Password</label>
        <div className="password-field">
          <input
            id="p"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            tabIndex={-1}
          >
            <EyeIcon open={!showPassword} />
          </button>
        </div>
        {err && (
          <div
            className="notice error"
            role="alert"
            aria-live="assertive"
            style={{ marginTop: 14 }}
          >
            {err}
          </div>
        )}
        <button className="primary" disabled={busy || !username || !password}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
