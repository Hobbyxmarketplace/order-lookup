import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ReadyPickupItem, type Zone } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function fmtDate(v: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A small debounce hook: returns `value` throttled by `delay` ms. Immediate
 * updates during typing don't fire until the user pauses.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function BulkMove() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [items, setItems] = useState<ReadyPickupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const [zoneFilter, setZoneFilter] = useState<Set<number>>(new Set());

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Zone that each selected invoice was in AT THE TIME it was ticked.
  // Preserved across page changes so we can show accurate "N already in
  // target" counts for the full selection, not just the current page.
  const [selectedZones, setSelectedZones] = useState<Map<string, number>>(
    new Map()
  );
  const [targetZoneId, setTargetZoneId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const initialLoadRef = useRef(true);

  // Fetch zones once for the filter chips and the target-zone dropdown.
  useEffect(() => {
    api
      .zones()
      .then((r) => {
        setZones(r.zones);
        const def = r.zones.find((z) => z.is_default) ?? r.zones[0];
        if (def) setTargetZoneId(def.id);
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Whenever search / zone filter / offset changes, refetch. Old request is
  // aborted so racing responses can't clobber newer state.
  useEffect(() => {
    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);
    api
      .readyForPickup(
        {
          search: debouncedSearch,
          limit: PAGE_SIZE,
          offset,
          zoneIds: Array.from(zoneFilter),
        },
        ac.signal
      )
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: any) => {
        if (e?.name === "AbortError") return;
        setErr(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
        initialLoadRef.current = false;
      });

    return () => ac.abort();
  }, [debouncedSearch, zoneFilter, offset]);

  // Reset to page 1 when the search string or zone filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOffset(0), [debouncedSearch, zoneFilter]);

  async function refresh() {
    const ac = new AbortController();
    setLoading(true);
    try {
      const r = await api.readyForPickup(
        {
          search: debouncedSearch,
          limit: PAGE_SIZE,
          offset,
          zoneIds: Array.from(zoneFilter),
        },
        ac.signal
      );
      setItems(r.items);
      setTotal(r.total);
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleZoneFilter(id: number) {
    setZoneFilter((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function toggle(item: ReadyPickupItem) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(item.invoice)) s.delete(item.invoice);
      else s.add(item.invoice);
      return s;
    });
    setSelectedZones((prev) => {
      const m = new Map(prev);
      if (m.has(item.invoice)) m.delete(item.invoice);
      else m.set(item.invoice, item.zone.id);
      return m;
    });
  }

  function togglePage() {
    const allSelected = items.every((i) => selected.has(i.invoice));
    setSelected((prev) => {
      const s = new Set(prev);
      for (const i of items) {
        if (allSelected) s.delete(i.invoice);
        else s.add(i.invoice);
      }
      return s;
    });
    setSelectedZones((prev) => {
      const m = new Map(prev);
      for (const i of items) {
        if (allSelected) m.delete(i.invoice);
        else m.set(i.invoice, i.zone.id);
      }
      return m;
    });
  }

  // Count of selected invoices whose remembered zone equals the target.
  // Covers on-page AND off-page selections since we snapshot the zone at
  // tick-time. Works even when the current page shows none of them.
  const alreadyInTarget = useMemo(() => {
    if (targetZoneId == null) return 0;
    let n = 0;
    for (const zid of selectedZones.values()) {
      if (zid === targetZoneId) n++;
    }
    return n;
  }, [selectedZones, targetZoneId]);
  const allSelectionsAreNoOp =
    selected.size > 0 && alreadyInTarget === selected.size;

  async function runMove() {
    if (targetZoneId == null || selected.size === 0) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const invoicesToSend = Array.from(selected);
      const r = await api.bulkMoveInvoices(invoicesToSend, targetZoneId);
      const z = zones?.find((x) => x.id === targetZoneId);
      const parts = [`Moved ${r.updated} invoice(s) to ${z?.name ?? "zone"}.`];
      if (r.skipped > 0) {
        parts.push(`${r.skipped} already there — skipped.`);
      }
      setMsg(parts.join(" "));
      setSelected(new Set());
      setSelectedZones(new Map());
      setConfirming(false);
      await refresh();
    } catch (e: any) {
      setErr(e.message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const pageAllSelected =
    items.length > 0 && items.every((i) => selected.has(i.invoice));

  return (
    <div className="page bulk-move">
      <h1>Bulk move</h1>
      <p className="lede">
        Invoices that are currently ready for pickup. Select any number and
        move them to a zone.
      </p>

      <div className="filters-bar">
        <div className="search-field">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden
          >
            <path
              d="M10.5 4a6.5 6.5 0 1 1-4.192 11.474l-3.16 3.161a1 1 0 1 1-1.414-1.414l3.16-3.16A6.5 6.5 0 0 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
              fill="currentColor"
            />
          </svg>
          <input
            type="search"
            placeholder="Search invoice number"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search invoice number"
          />
          {searchInput && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>

        {zones && zones.length > 0 && (
          <div className="zone-filter">
            <span className="zone-filter-label">Zone</span>
            <div className="zone-filter-chips">
              {zones.map((z) => {
                const active = zoneFilter.has(z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    className={`zone-filter-chip${active ? " active" : ""}`}
                    onClick={() => toggleZoneFilter(z.id)}
                    aria-pressed={active}
                  >
                    {z.name}
                  </button>
                );
              })}
              {zoneFilter.size > 0 && (
                <button
                  type="button"
                  className="zone-filter-clear"
                  onClick={() => setZoneFilter(new Set())}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="notice error" role="alert" aria-live="assertive">
          {err}
        </div>
      )}
      {msg && (
        <div className="notice info" role="status" aria-live="polite">
          {msg}
        </div>
      )}

      <div className={`table-wrap${loading ? " is-loading" : ""}`}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={togglePage}
                  disabled={items.length === 0}
                />
              </th>
              <th>Invoice</th>
              <th>Submission</th>
              <th>Owner</th>
              <th>Ready</th>
              <th>Current zone</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  <span className="spinner inline" /> Loading…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {debouncedSearch || zoneFilter.size > 0
                    ? "No invoices match these filters."
                    : "No invoices are currently ready for pickup."}
                </td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.invoice}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(it.invoice)}
                    onChange={() => toggle(it)}
                  />
                </td>
                <td className="mono">{it.invoice}</td>
                <td className="mono">{it.submission_number ?? "-"}</td>
                <td>{it.owner_email ?? "-"}</td>
                <td>{fmtDate(it.pickup_ready_at)}</td>
                <td>
                  <span className="zone-chip">{it.zone.name}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Previous
        </button>
        <span className="pager-info">
          {total === 0
            ? loading
              ? "Loading…"
              : "0 results"
            : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}
        </span>
        <button
          disabled={offset + items.length >= total || loading}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
      </div>

      {selected.size > 0 && (
        <div className="bulk-actions">
          <span>
            {selected.size} selected
            {alreadyInTarget > 0 && (
              <span className="muted">
                {" "}
                ({alreadyInTarget} already in target)
              </span>
            )}
          </span>
          <select
            value={targetZoneId ?? ""}
            onChange={(e) => setTargetZoneId(Number(e.target.value))}
          >
            {zones?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
                {z.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={
              busy ||
              targetZoneId == null ||
              selected.size === 0 ||
              allSelectionsAreNoOp
            }
            onClick={() => setConfirming(true)}
            title={
              allSelectionsAreNoOp
                ? "All selected invoices are already in this zone"
                : undefined
            }
          >
            {busy ? "Moving..." : `Move ${selected.size}`}
          </button>
          <button
            onClick={() => {
              setSelected(new Set());
              setSelectedZones(new Map());
            }}
            disabled={busy}
          >
            Clear selection
          </button>
        </div>
      )}

      {confirming && targetZoneId != null && (
        <ConfirmDialog
          title={`Move ${selected.size} invoice(s)?`}
          message={
            <>
              This will move <strong>{selected.size}</strong> invoice(s) to{" "}
              <strong>
                {zones?.find((z) => z.id === targetZoneId)?.name ?? "zone"}
              </strong>
              . Any that are already in this zone will be skipped
              automatically.
            </>
          }
          confirmLabel="Move"
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={runMove}
        />
      )}
    </div>
  );
}
