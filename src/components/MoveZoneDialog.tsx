import { useEffect, useState } from "react";
import { api, type Zone } from "../api";

export default function MoveZoneDialog({
  invoice,
  currentZoneId,
  onClose,
  onMoved,
}: {
  invoice: string;
  currentZoneId: number | null;
  onClose: () => void;
  onMoved: (zone: { id: number; name: string }) => void;
}) {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(currentZoneId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .zones()
      .then((r) => {
        setZones(r.zones);
        if (zoneId == null) {
          const def = r.zones.find((z) => z.is_default) ?? r.zones[0];
          if (def) setZoneId(def.id);
        }
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (zoneId == null) return;
    setBusy(true);
    setErr(null);
    try {
      await api.moveInvoice(invoice, zoneId);
      const z = zones?.find((x) => x.id === zoneId);
      if (z) onMoved({ id: z.id, name: z.name });
      onClose();
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-zone-title"
      >
        <h2 id="move-zone-title">Move invoice #{invoice}</h2>
        {!zones && !err && <p className="lede">Loading zones...</p>}
        {err && (
          <div className="notice error" role="alert" aria-live="assertive">
            {err}
          </div>
        )}
        {zones && zones.length > 0 && (
          <>
            <label htmlFor="zone">Target zone</label>
            <select
              id="zone"
              value={zoneId ?? ""}
              onChange={(e) => setZoneId(Number(e.target.value))}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                  {z.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy || zoneId == null || zoneId === currentZoneId}
              >
                {busy ? "Moving..." : "Move"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
