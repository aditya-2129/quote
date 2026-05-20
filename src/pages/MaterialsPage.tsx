import { useState, useEffect, type FormEvent } from "react";
import { Gem, Plus, Edit2, Trash2, X, AlertTriangle } from "lucide-react";
import { getAllMaterials, createMaterial, updateMaterial, deleteMaterial } from "../db/queries";
import type { Material, NewMaterial } from "../db/schema";
import { EmptyState } from "../components/EmptyState";
import { formatCurrency } from "../utils/helpers";

const FORM_LABELS: Record<string, string> = {
  rect: "Rectangular",
  round: "Round",
  hex: "Hex",
};

export function MaterialsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Material | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setRows(await getAllMaterials(false));
    setLoading(false);
  }

  const handleAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleEdit = (item: Material) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    await deleteMaterial(confirmDeleteId);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleSave = async (data: NewMaterial) => {
    if (editingItem) await updateMaterial(editingItem.id, data);
    else await createMaterial(data);
    setModalOpen(false);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Material Library</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm" onClick={handleAdd}>
            <Plus size={14} /> New Material
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="title">All Materials</div>
        </div>
        {loading ? (
          <EmptyState text="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState text="No materials yet." icon={<Gem size={24} />} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Density (kg/m³)</th>
                <th>Rates per Form</th>
                <th style={{ width: "80px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.category}</td>
                  <td>{r.densityKgPerM3.toLocaleString()}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {(r.availableForms || []).map((f) => (
                        <span
                          key={f}
                          className="status-pill"
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                        >
                          <span style={{ color: "var(--text-3)", marginRight: "4px" }}>
                            {FORM_LABELS[f] || f}:
                          </span>
                          {formatCurrency(r.formRates[f] || r.costPerKg, r.currency)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="icon-btn sm" onClick={() => handleEdit(r)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="icon-btn sm danger" onClick={() => setConfirmDeleteId(r.id)}>
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
        <MaterialModal
          item={editingItem}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this material? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

function MaterialModal({
  item,
  onClose,
  onSave,
}: {
  item: Material | null;
  onClose: () => void;
  onSave: (data: NewMaterial) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<Material>>(
    item || {
      name: "",
      category: "Metal",
      densityKgPerM3: 7850,
      costPerKg: 0,
      currency: "INR",
      notes: "",
      isActive: true,
      availableForms: ["rect"],
      formRates: { rect: 75 },
    }
  );

  const AVAILABLE_FORMS = ["rect", "round", "hex"];

  const toggleForm = (form: string) => {
    const currentForms = formData.availableForms || [];
    const currentRates = formData.formRates ?? {};

    if (currentForms.includes(form)) {
      setFormData({
        ...formData,
        availableForms: currentForms.filter((f) => f !== form),
      });
    } else {
      setFormData({
        ...formData,
        availableForms: [...currentForms, form],
        formRates: { ...currentRates, [form]: currentRates[form] || formData.costPerKg || 0 },
      });
    }
  };

  const handleRateChange = (form: string, rate: number) => {
    setFormData({
      ...formData,
      formRates: { ...(formData.formRates ?? {}), [form]: rate },
    });
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = "Name is required";
    if (!formData.category) e.category = "Category is required";
    if (!formData.currency?.trim()) e.currency = "Currency is required";
    const density = Number(formData.densityKgPerM3);
    if (!density || density <= 0) e.densityKgPerM3 = "Must be greater than 0";
    if (!formData.availableForms?.length) e.availableForms = "Select at least one form";
    for (const f of formData.availableForms ?? []) {
      const r = Number(formData.formRates?.[f]);
      if (isNaN(r) || r <= 0) e[`rate_${f}`] = `${FORM_LABELS[f]} rate must be greater than 0`;
    }
    return e;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const rates = Object.fromEntries(
      Object.entries(formData.formRates ?? {}).map(([k, v]) => [k, Number(v)]),
    );
    const cleanData: NewMaterial = {
      name: formData.name!.trim(),
      category: formData.category || null,
      currency: formData.currency!.trim().toUpperCase(),
      densityKgPerM3: Number(formData.densityKgPerM3),
      costPerKg: Number(formData.costPerKg) || 0,
      markupPercent: Number(formData.markupPercent) || 0,
      availableForms: formData.availableForms ?? [],
      formRates: rates,
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
          <div className="title">{item ? "Edit Material" : "New Material"}</div>
          <button className="close" onClick={onClose} disabled={isSaving}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {saveError && (
              <div className="error-banner">
                <AlertTriangle size={14} />
                <span>{saveError}</span>
                <button onClick={() => setSaveError("")}><X size={12} /></button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group span-2">
                <label>Material Name *</label>
                <input
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors(ev => ({ ...ev, name: "" })); }}
                  placeholder="e.g. Aluminum 6061-T6"
                  disabled={isSaving}
                  style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={formData.category || ""}
                  onChange={(e) => { setFormData({ ...formData, category: e.target.value }); setErrors(ev => ({ ...ev, category: "" })); }}
                  disabled={isSaving}
                  style={errors.category ? { borderColor: "var(--danger)" } : undefined}
                >
                  <option value="">Select Category</option>
                  <option value="Metal">Metal</option>
                  <option value="Plastic">Plastic</option>
                  <option value="Purchased">Purchased</option>
                  <option value="Other">Other</option>
                </select>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>
              <div className="form-group">
                <label>Density (kg/m³) *</label>
                <input
                  type="number"
                  value={formData.densityKgPerM3 ?? ""}
                  onChange={(e) => { setFormData({ ...formData, densityKgPerM3: parseFloat(e.target.value) }); setErrors(ev => ({ ...ev, densityKgPerM3: "" })); }}
                  disabled={isSaving}
                  style={errors.densityKgPerM3 ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.densityKgPerM3 && <span className="field-error">{errors.densityKgPerM3}</span>}
              </div>
              <div className="form-group">
                <label>Default Rate (Fallback)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.costPerKg ?? ""}
                  onChange={(e) => setFormData({ ...formData, costPerKg: parseFloat(e.target.value) })}
                  disabled={isSaving}
                />
              </div>
              <div className="form-group">
                <label>Currency *</label>
                <input
                  type="text"
                  value={formData.currency || ""}
                  onChange={(e) => { setFormData({ ...formData, currency: e.target.value }); setErrors(ev => ({ ...ev, currency: "" })); }}
                  disabled={isSaving}
                  style={errors.currency ? { borderColor: "var(--danger)" } : undefined}
                  placeholder="INR"
                />
                {errors.currency && <span className="field-error">{errors.currency}</span>}
              </div>
              <div className="form-group span-2">
                <label>Available Forms & Rates *</label>
                {errors.availableForms && <span className="field-error">{errors.availableForms}</span>}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                  {AVAILABLE_FORMS.map((f) => (
                    <div key={f} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "32px" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: isSaving ? "default" : "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            minWidth: "120px",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={(formData.availableForms || []).includes(f)}
                            onChange={() => { toggleForm(f); setErrors(ev => ({ ...ev, availableForms: "", [`rate_${f}`]: "" })); }}
                            style={{ width: "16px", height: "16px" }}
                            disabled={isSaving}
                          />
                          {FORM_LABELS[f]}
                        </label>
                        {(formData.availableForms || []).includes(f) && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-3)" }}>Rate:</span>
                            <input
                              type="number"
                              step="0.01"
                              value={formData.formRates?.[f] ?? ""}
                              onChange={(e) => { handleRateChange(f, parseFloat(e.target.value)); setErrors(ev => ({ ...ev, [`rate_${f}`]: "" })); }}
                              style={{ width: "100px", height: "28px", ...(errors[`rate_${f}`] ? { borderColor: "var(--danger)" } : {}) }}
                              placeholder="₹/kg"
                              disabled={isSaving}
                            />
                            <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                              {formData.currency || "INR"}
                            </span>
                          </div>
                        )}
                      </div>
                      {errors[`rate_${f}`] && <span className="field-error" style={{ marginLeft: "132px" }}>{errors[`rate_${f}`]}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn primary sm" disabled={isSaving}>
              {isSaving ? "Saving..." : (item ? "Save Changes" : "Create Material")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
