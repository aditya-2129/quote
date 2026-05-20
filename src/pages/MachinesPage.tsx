import { useState, useEffect, type FormEvent } from "react";
import { Settings2, Plus, Edit2, Trash2, X, AlertTriangle } from "lucide-react";
import { getAllMachines, createMachine, updateMachine, deleteMachine } from "../db/queries";
import type { Machine, MachineCategory, NewMachine } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

const CATEGORY_LABELS: Record<MachineCategory, string> = {
  mill: "Mill",
  lathe: "Lathe",
  grind: "Grind",
  edm: "EDM",
  hand: "Hand",
  inspect: "Inspect",
  other: "Other",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as MachineCategory[];

export function MachinesPage() {
  const [rows, setRows] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Machine | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await getAllMachines(false));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = () => { setEditingItem(null); setModalOpen(true); };
  const handleEdit = (item: Machine) => { setEditingItem(item); setModalOpen(true); };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    await deleteMachine(confirmDeleteId);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleSave = async (data: NewMachine) => {
    if (editingItem) await updateMachine(editingItem.id, data);
    else await createMachine(data);
    setModalOpen(false);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Machines & Rates</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm" onClick={handleAdd}>
            <Plus size={14} /> New Machine
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Machines</div></div>
        {loading ? (
          <EmptyState text="Loading…" />
        ) : loadError ? (
          <EmptyState text={`Error: ${loadError}`} icon={<AlertTriangle size={24} />} />
        ) : rows.length === 0 ? (
          <EmptyState text="No machines yet." icon={<Settings2 size={24} />} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Short Name</th>
                <th>Category</th>
                <th>Rate/Hour</th>
                <th>Status</th>
                <th style={{ width: "80px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.shortName}</td>
                  <td>{CATEGORY_LABELS[r.category] ?? r.category}</td>
                  <td>₹ {r.ratePerHour.toLocaleString()}/hr</td>
                  <td>
                    <span className="status-pill" style={{
                      background: r.isActive ? "var(--success-bg, #dcfce7)" : "var(--bg-2)",
                      color: r.isActive ? "var(--success, #16a34a)" : "var(--text-3)",
                      fontSize: "11px", padding: "2px 8px",
                    }}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="icon-btn sm" onClick={() => handleEdit(r)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="icon-btn sm danger"
                        onClick={() => setConfirmDeleteId(r.id)}
                        title="Delete"
                        disabled={r.isSystem}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <MachineModal
          item={editingItem}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this machine? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  message, confirmLabel, onConfirm, onCancel,
}: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon"><AlertTriangle size={20} /></div>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="btn sm" onClick={onCancel}>Cancel</button>
          <button className="btn sm danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function MachineModal({
  item, onClose, onSave,
}: { item: Machine | null; onClose: () => void; onSave: (data: NewMachine) => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<Machine>>(
    item || {
      name: "",
      shortName: "",
      category: "mill",
      ratePerHour: 0,
      notes: "",
      isActive: true,
    }
  );

  const set = (patch: Partial<Machine>) => setFormData((prev) => ({ ...prev, ...patch }));
  const clearErr = (key: string) => setErrors((prev) => ({ ...prev, [key]: "" }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = "Name is required";
    if (!formData.shortName?.trim()) e.shortName = "Short name is required";
    if (!formData.category) e.category = "Category is required";
    const rate = Number(formData.ratePerHour);
    if (isNaN(rate) || rate < 0) e.ratePerHour = "Rate must be 0 or greater";
    return e;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const cleanData: NewMachine = {
      name: formData.name!.trim(),
      shortName: formData.shortName!.trim(),
      category: formData.category!,
      ratePerHour: Number(formData.ratePerHour),
      notes: formData.notes?.trim() || null,
      isActive: formData.isActive ?? true,
      isSystem: formData.isSystem ?? false,
    };

    setSaveError("");
    setIsSaving(true);
    try {
      await onSave(cleanData);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="title">{item ? "Edit Machine" : "New Machine"}</div>
          <button className="close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {saveError && (
              <div className="error-banner">
                <AlertTriangle size={14} />
                <span>{saveError}</span>
                <button type="button" onClick={() => setSaveError("")}><X size={12} /></button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group span-2">
                <label>Machine Name *</label>
                <input
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) => { set({ name: e.target.value }); clearErr("name"); }}
                  placeholder="e.g. Haas VF-2 VMC"
                  disabled={isSaving}
                  style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label>Short Name *</label>
                <input
                  type="text"
                  value={formData.shortName || ""}
                  onChange={(e) => { set({ shortName: e.target.value }); clearErr("shortName"); }}
                  placeholder="e.g. VF-2"
                  disabled={isSaving}
                  style={errors.shortName ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.shortName && <span className="field-error">{errors.shortName}</span>}
              </div>

              <div className="form-group">
                <label>Category *</label>
                <select
                  value={formData.category || ""}
                  onChange={(e) => { set({ category: e.target.value as MachineCategory }); clearErr("category"); }}
                  disabled={isSaving}
                  style={errors.category ? { borderColor: "var(--danger)" } : undefined}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>

              <div className="form-group">
                <label>Rate per Hour (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ratePerHour ?? ""}
                  onChange={(e) => { set({ ratePerHour: parseFloat(e.target.value) }); clearErr("ratePerHour"); }}
                  placeholder="0.00"
                  disabled={isSaving}
                  style={errors.ratePerHour ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.ratePerHour && <span className="field-error">{errors.ratePerHour}</span>}
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "20px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: isSaving ? "default" : "pointer", fontSize: "13px", fontWeight: 500, margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive ?? true}
                    onChange={(e) => set({ isActive: e.target.checked })}
                    style={{ width: "16px", height: "16px" }}
                    disabled={isSaving}
                  />
                  Active
                </label>
              </div>

              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e) => set({ notes: e.target.value })}
                  rows={3}
                  placeholder="Optional notes about this machine…"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn sm" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn primary sm" disabled={isSaving}>
              {isSaving ? "Saving..." : (item ? "Save Changes" : "Create Machine")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
