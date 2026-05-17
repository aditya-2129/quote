import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import type { BopCatalogItem } from "../db/schema";

export type BopModalData = Partial<BopCatalogItem>;

export function BopModal({
  item, onClose, onSave, initialName,
}: {
  item: BopCatalogItem | null;
  onClose: () => void;
  onSave: (data: BopModalData) => Promise<void>;
  initialName?: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<BopModalData>(
    item ?? {
      name: initialName ?? "",
      supplier: "",
      unitCost: 0,
      currency: "INR",
      notes: "",
    },
  );

  const set = (patch: BopModalData) => setFormData(prev => ({ ...prev, ...patch }));
  const clearErr = (key: string) => setErrors(prev => ({ ...prev, [key]: "" }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = "Name is required";
    if (
      formData.unitCost === undefined
      || formData.unitCost === null
      || !Number.isFinite(Number(formData.unitCost))
      || Number(formData.unitCost) < 0
    ) {
      e.unitCost = "Unit cost must be >= 0";
    }
    return e;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaveError("");
    setIsSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div className="title">{item ? "Edit BOP" : "New BOP"}</div>
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
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name ?? ""}
                  onChange={event => { set({ name: event.target.value }); clearErr("name"); }}
                  placeholder="e.g. M6 x 20 SHCS"
                  disabled={isSaving}
                  style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label>Supplier</label>
                <input
                  type="text"
                  value={formData.supplier ?? ""}
                  onChange={event => set({ supplier: event.target.value })}
                  placeholder="e.g. Unbrako"
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label>Unit cost *</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.unitCost ?? 0}
                  onChange={event => { set({ unitCost: Number(event.target.value) }); clearErr("unitCost"); }}
                  disabled={isSaving}
                  style={errors.unitCost ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.unitCost && <span className="field-error">{errors.unitCost}</span>}
              </div>

              <div className="form-group">
                <label>Currency</label>
                <input
                  type="text"
                  value={formData.currency ?? "INR"}
                  onChange={event => set({ currency: event.target.value.toUpperCase().slice(0, 4) })}
                  maxLength={4}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes ?? ""}
                  onChange={event => set({ notes: event.target.value })}
                  rows={2}
                  placeholder="Optional notes..."
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn sm" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn primary sm" disabled={isSaving}>
              {isSaving ? "Saving..." : (item ? "Save Changes" : "Create BOP")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
