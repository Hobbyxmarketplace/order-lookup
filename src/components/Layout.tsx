import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { api, type Me } from "../api";

export default function Layout({
  me,
  onLogout,
  children,
}: {
  me: Me;
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
          <nav className="site-nav">
            <NavLink to="/" end>
              Lookup
            </NavLink>
            {/* Bulk move is only useful for accounts that can actually move
             * invoices. Admins always see it; staff see it only when their
             * account has can_move enabled. Legacy Me payloads without the
             * field default to true so existing sessions are unaffected. */}
            {(me.role === "admin" || (me.can_move ?? true)) && (
              <NavLink to="/bulk-move">Bulk move</NavLink>
            )}
            {me.role === "admin" && (
              <>
                <NavLink to="/zones">Zones</NavLink>
                <NavLink to="/audit">Audit</NavLink>
              </>
            )}
          </nav>
          <div className="spacer" />
          <span className="user">
            <span className="user-name-prefix">Signed in as </span>
            {me.user}{" "}
            <span className={`role-badge role-${me.role}`}>{me.role}</span>
          </span>
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
