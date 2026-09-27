import { useEffect, useState } from "react";
import { api, type Zone } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";

function fmtDateTime(v: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Pending =
  | { kind: "create"; name: string }
  | { kind: "rename"; id: number; name: string; oldName: string }
  | { kind: "default"; id: number; name: string };

export default function Zones() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [migrateTo, setMigrateTo] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  async function refresh() {
    setErr(null);
    try {
      const r = await api.zones();
      setZones(r.zones);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function askCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setPending({ kind: "create", name });
  }

  function askRename(id: number) {
    const name = renamingName.trim();
    const z = zones?.find((x) => x.id === id);
    if (!name || !z) return;
    if (name === z.name) {
      setRenamingId(null);
      setRenamingName("");
      return;
    }
    setPending({ kind: "rename", id, name, oldName: z.name });
  }

  function askMakeDefault(id: number) {
    const z = zones?.find((x) => x.id === id);
    if (!z) return;
    setPending({ kind: "default", id, name: z.name });
  }

  async function runPending() {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      if (pending.kind === "create") {
        await api.createZone(pending.name);
        setNewName("");
      } else if (pending.kind === "rename") {
        await api.patchZone(pending.id, { name: pending.name });
        setRenamingId(null);
        setRenamingName("");
      } else if (pending.kind === "default") {
        await api.patchZone(pending.id, { isDefault: true });
      }
      setPending(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: number) {
    if (migrateTo == null) return;
    setBusy(true);
    try {
      await api.deleteZone(id, migrateTo);
      setDeletingId(null);
      setMigrateTo(null);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const deletingZone = zones?.find((z) => z.id === deletingId) ?? null;
  const migrateOptions = zones?.filter((z) => z.id !== deletingId) ?? [];

  return (
    <div className="page zones">
      <h1>Zones</h1>
      <p className="lede">
        Create and manage warehouse zones. Staff can move invoices between
        active zones from the lookup and bulk-move pages.
      </p>

      <form className="lookup-form" onSubmit={askCreate}>
        <input
          placeholder="New zone name (e.g. Zone B)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
        />
        <button className="primary" disabled={busy || !newName.trim()}>
          Add zone
        </button>
      </form>

      {err && (
        <div className="notice error" role="alert" aria-live="assertive">
          {err}
        </div>
      )}

      {zones && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Default</th>
                <th title="Invoices currently in Ready-for-Pickup status that are assigned to this zone">
                  Ready for pickup
                </th>
                <th className="col-created">Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td>
                    {renamingId === z.id ? (
                      <input
                        autoFocus
                        value={renamingName}
                        onChange={(e) => setRenamingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") askRename(z.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      z.name
                    )}
                  </td>
                  <td>{z.is_default ? "★" : ""}</td>
                  <td>{z.invoice_count}</td>
                  <td className="col-created">{fmtDateTime(z.created_at)}</td>
                  <td className="actions">
                    {renamingId === z.id ? (
                      <>
                        <button
                          className="primary"
                          disabled={busy || !renamingName.trim()}
                          onClick={() => askRename(z.id)}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setRenamingId(null);
                            setRenamingName("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setRenamingId(z.id);
                            setRenamingName(z.name);
                          }}
                        >
                          Rename
                        </button>
                        {!z.is_default && (
                          <button
                            onClick={() => askMakeDefault(z.id)}
                            disabled={busy}
                          >
                            Make default
                          </button>
                        )}
                        {!z.is_default && zones.length > 1 && (
                          <button
                            className="danger"
                            onClick={() => {
                              setDeletingId(z.id);
                              const first = zones.find(
                                (o) => o.id !== z.id
                              );
                              setMigrateTo(first ? first.id : null);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "create"
              ? "Create zone?"
              : pending.kind === "rename"
                ? "Rename zone?"
                : "Change default zone?"
          }
          message={
            pending.kind === "create" ? (
              <>
                A new zone <strong>{pending.name}</strong> will be created.
                Staff will be able to assign invoices to it.
              </>
            ) : pending.kind === "rename" ? (
              <>
                Rename <strong>{pending.oldName}</strong> to{" "}
                <strong>{pending.name}</strong>? Existing invoice assignments
                are preserved.
              </>
            ) : (
              <>
                Set <strong>{pending.name}</strong> as the new default zone?
                Any invoice not explicitly assigned to another zone will now
                resolve here.
              </>
            )
          }
          confirmLabel={
            pending.kind === "create"
              ? "Create"
              : pending.kind === "rename"
                ? "Rename"
                : "Make default"
          }
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={runPending}
        />
      )}

      {deletingZone && (
        <div
          className="modal-backdrop"
          onClick={
            busy
              ? undefined
              : () => {
                  setDeletingId(null);
                  setMigrateTo(null);
                }
          }
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-zone-title"
          >
            <h2 id="delete-zone-title">Delete "{deletingZone.name}"?</h2>
            <p className="lede">
              {deletingZone.invoice_count} ready-for-pickup invoice(s) are
              currently in this zone. Choose where they should go before we
              delete it. Any invoice ever assigned to this zone will also be
              re-pointed.
            </p>
            <label htmlFor="migrate">Move existing invoices to</label>
            <select
              id="migrate"
              value={migrateTo ?? ""}
              onChange={(e) => setMigrateTo(Number(e.target.value))}
            >
              {migrateOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {z.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                onClick={() => {
                  setDeletingId(null);
                  setMigrateTo(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="danger"
                disabled={busy || migrateTo == null}
                onClick={() => confirmDelete(deletingZone.id)}
              >
                {busy ? "Deleting..." : "Delete zone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
