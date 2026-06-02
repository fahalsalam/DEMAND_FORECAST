import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { FestivalIn, FestivalOut } from "../types";

const EMPTY: FestivalIn = {
  name: "",
  date: "",
  expected_uplift: 1.5,
  lead_days: 7,
  tail_days: 2,
  active: true,
  notes: "",
};

const fmtDate = (iso: string) => {
  try { return new Date(iso + "T00:00:00").toLocaleDateString(); } catch { return iso; }
};

export function Settings() {
  const [rows, setRows] = useState<FestivalOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FestivalIn>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listFestivals();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  function startEdit(f: FestivalOut) {
    setEditingId(f.id);
    setForm({
      name: f.name,
      date: f.date,
      expected_uplift: f.expected_uplift,
      lead_days: f.lead_days,
      tail_days: f.tail_days,
      active: f.active,
      notes: f.notes ?? "",
    });
  }

  function startNew() {
    setEditingId("new");
    setForm({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
  }

  async function save() {
    setSaving(true);
    try {
      if (!form.name.trim() || !form.date) {
        setToast({ kind: "err", text: "Name and date are required." });
        return;
      }
      const payload: FestivalIn = { ...form, notes: form.notes?.trim() || null };
      if (editingId === "new") {
        await api.createFestival(payload);
        setToast({ kind: "ok", text: `Created "${payload.name}"` });
      } else if (typeof editingId === "number") {
        await api.updateFestival(editingId, payload);
        setToast({ kind: "ok", text: `Updated "${payload.name}"` });
      }
      setEditingId(null);
      await fetchRows();
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "save failed",
      });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete(id: number) {
    try {
      await api.deleteFestival(id);
      setToast({ kind: "ok", text: "Festival removed." });
      setConfirmDelete(null);
      await fetchRows();
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof ApiError ? err.message : err instanceof Error ? err.message : "delete failed",
      });
    }
  }

  return (
    <main className="page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Manage the festival calendar that drives the Seasonal Outlook overlays.</p>
        </div>
        <div className="page-header-actions">
          {editingId === null && (
            <button className="btn btn-primary" onClick={startNew}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add festival
            </button>
          )}
        </div>
      </header>

      {toast && <div className={`row-toast row-toast-${toast.kind}`}>{toast.text}</div>}

      {editingId !== null && (
        <section className="festival-form">
          <h3>{editingId === "new" ? "Add festival" : "Edit festival"}</h3>
          <div className="festival-grid">
            <Field label="Name">
              <input
                className="search-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Diwali"
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className="search-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Expected uplift (×)">
              <input
                type="number"
                step="0.1" min="0.5" max="20"
                className="search-input"
                value={form.expected_uplift}
                onChange={(e) => setForm({ ...form, expected_uplift: Number(e.target.value) })}
              />
            </Field>
            <Field label="Lead days (before)">
              <input
                type="number" min="0" max="90"
                className="search-input"
                value={form.lead_days}
                onChange={(e) => setForm({ ...form, lead_days: Number(e.target.value) })}
              />
            </Field>
            <Field label="Tail days (after)">
              <input
                type="number" min="0" max="30"
                className="search-input"
                value={form.tail_days}
                onChange={(e) => setForm({ ...form, tail_days: Number(e.target.value) })}
              />
            </Field>
            <Field label="Active?">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                <span>Show on seasonal chart</span>
              </label>
            </Field>
            <Field label="Notes" full>
              <input
                className="search-input"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="optional — what categories this affects, why, etc."
              />
            </Field>
          </div>
          <div className="festival-form-actions">
            <button className="btn btn-ghost" onClick={() => setEditingId(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>
      )}

      <section className="festival-table">
        {loading && <div className="data-empty">loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="data-empty">No festivals yet — click "Add festival" to create one.</div>
        )}
        {!loading && rows.length > 0 && (
          <div className="data-table festival-cols">
            <div className="data-thead">
              <div>Date</div>
              <div>Name</div>
              <div className="num">Uplift</div>
              <div className="num">Lead</div>
              <div className="num">Tail</div>
              <div>Status</div>
              <div>Notes</div>
              <div className="td-actions-col">Actions</div>
            </div>
            <div className="data-tbody">
              {rows.map((f) => (
                <div key={f.id} className={`data-row ${!f.active ? "is-inactive" : ""}`}>
                  <div className="muted-cell">{fmtDate(f.date)}</div>
                  <div><strong>{f.name}</strong></div>
                  <div className="num strong">{f.expected_uplift.toFixed(1)}×</div>
                  <div className="num">-{f.lead_days}d</div>
                  <div className="num">+{f.tail_days}d</div>
                  <div>
                    <span className={`badge ${f.active ? "badge-on" : "badge-off"}`}>
                      {f.active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="muted-cell">{f.notes ?? "—"}</div>
                  <div className="td-actions">
                    {confirmDelete === f.id ? (
                      <>
                        <span className="confirm-text">Delete?</span>
                        <button className="btn-mini btn-mini-danger" onClick={() => void doDelete(f.id)}>Yes</button>
                        <button className="btn-mini" onClick={() => setConfirmDelete(null)}>No</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-mini" onClick={() => startEdit(f)}>Edit</button>
                        <button className="row-delete" title="Delete" onClick={() => setConfirmDelete(f.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`field ${full ? "field-full" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
