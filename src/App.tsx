import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { api, type Me } from "./api";
import Login from "./pages/Login";
import Lookup from "./pages/Lookup";
import Zones from "./pages/Zones";
import BulkMove from "./pages/BulkMove";
import Audit from "./pages/Audit";
import Layout from "./components/Layout";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then((r) => setMe(r))
      .catch(() => setMe(null));

    const onExpired = () => setMe(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  if (me === undefined) return null;

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setMe} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const wrap = (node: React.ReactNode) => (
    <Layout me={me} onLogout={() => setMe(null)}>
      {node}
    </Layout>
  );

  const canMove = me.role === "admin" || (me.can_move ?? true);

  return (
    <Routes>
      <Route path="/" element={wrap(<Lookup me={me} />)} />
      {canMove && (
        <Route path="/bulk-move" element={wrap(<BulkMove />)} />
      )}
      {me.role === "admin" && (
        <>
          <Route path="/zones" element={wrap(<Zones />)} />
          <Route path="/audit" element={wrap(<Audit />)} />
        </>
      )}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
