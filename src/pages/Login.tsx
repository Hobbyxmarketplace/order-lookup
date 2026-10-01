import { useState } from "react";
import { api, type Me } from "../api";
import EyeIcon from "../components/EyeIcon";

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
