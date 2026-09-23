import { useState } from "react";
import { api } from "../api";

export default function Login({ onLogin }: { onLogin: (u: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.login(username, password);
      onLogin(r.user);
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
        <input
          id="p"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="notice error" style={{ marginTop: 14 }}>{err}</div>}
        <button className="primary" disabled={busy || !username || !password}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
