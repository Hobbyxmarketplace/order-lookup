import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Layout({
  user,
  onLogout,
  children,
}: {
  user: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <>
      <header className="site-header">
        <div className="inner">
          <Link to="/" className="brand">
            <span className="brand-dot" />
            Hobbyx <span className="sub">Order Lookup</span>
          </Link>
          <div className="spacer" />
          <span className="user">Signed in as {user}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        Hobbyx Order Lookup - internal tool
      </footer>
    </>
  );
}
