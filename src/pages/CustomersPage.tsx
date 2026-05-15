import { useState, useEffect } from "react";
import { Users, Plus, Edit2, Trash2, X, AlertTriangle } from "lucide-react";
import { getAllCustomers, createCustomer, updateCustomer, deleteCustomer } from "../db/queries";
import type { Customer } from "../db/schema";
import { EmptyState } from "../components/EmptyState";

export function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Customer | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await getAllCustomers());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = () => { setEditingItem(null); setModalOpen(true); };
  const handleEdit = (item: Customer) => { setEditingItem(item); setModalOpen(true); };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    await deleteCustomer(confirmDeleteId);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleSave = async (data: Partial<Customer>) => {
    const { id, createdAt, updatedAt, ...cleanData } = data as any;
    if (editingItem) await updateCustomer(editingItem.id, cleanData);
    else await createCustomer(cleanData);
    setModalOpen(false);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Customers</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm" onClick={handleAdd}>
            <Plus size={14} /> New Customer
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="title">All Customers</div></div>
        {loading ? (
          <EmptyState text="Loading…" />
        ) : loadError ? (
          <EmptyState text={`Error: ${loadError}`} icon={<AlertTriangle size={24} />} />
        ) : rows.length === 0 ? (
          <EmptyState text="No customers yet." icon={<Users size={24} />} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ width: "80px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.company ?? "—"}</td>
                  <td>{r.email ?? "—"}</td>
                  <td>{r.phone ?? "—"}</td>
                  <td>
                    <div className="actions">
                      <button className="icon-btn sm" onClick={() => handleEdit(r)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button className="icon-btn sm danger" onClick={() => setConfirmDeleteId(r.id)} title="Delete">
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
        <CustomerModal
          item={editingItem}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this customer? This cannot be undone."
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

function CustomerModal({
  item, onClose, onSave,
}: { item: Customer | null; onClose: () => void; onSave: (data: Partial<Customer>) => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<Customer>>(
    item || { name: "", company: "", email: "", phone: "", address: "", notes: "" }
  );

  const set = (patch: Partial<Customer>) => setFormData((prev) => ({ ...prev, ...patch }));
  const clearErr = (key: string) => setErrors((prev) => ({ ...prev, [key]: "" }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name?.trim()) e.name = "Name is required";
    if (!formData.company?.trim()) e.company = "Company is required";
    if (!formData.email?.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = "Invalid email address";
    if (!formData.phone?.trim()) e.phone = "Phone is required";
    else if (!/^\d{10}$/.test(formData.phone)) e.phone = "Must be exactly 10 digits";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const cleanData: Partial<Customer> = {
      ...formData,
      name: formData.name!.trim(),
      company: formData.company?.trim() || null,
      email: formData.email?.trim() || null,
      phone: formData.phone?.trim() || null,
      address: formData.address?.trim() || null,
      notes: formData.notes?.trim() || null,
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
          <div className="title">{item ? "Edit Customer" : "New Customer"}</div>
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
                  value={formData.name || ""}
                  onChange={(e) => { set({ name: e.target.value }); clearErr("name"); }}
                  placeholder="e.g. Rahul Sharma"
                  disabled={isSaving}
                  style={errors.name ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>

              <div className="form-group span-2">
                <label>Company *</label>
                <input
                  type="text"
                  value={formData.company || ""}
                  onChange={(e) => { set({ company: e.target.value }); clearErr("company"); }}
                  placeholder="e.g. Acme Industries"
                  disabled={isSaving}
                  style={errors.company ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.company && <span className="field-error">{errors.company}</span>}
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => { set({ email: e.target.value }); clearErr("email"); }}
                  placeholder="e.g. rahul@acme.com"
                  disabled={isSaving}
                  style={errors.email ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label>Phone *</label>
                <input
                  type="tel"
                  value={formData.phone || ""}
                  onChange={(e) => { set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) }); clearErr("phone"); }}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  disabled={isSaving}
                  style={errors.phone ? { borderColor: "var(--danger)" } : undefined}
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </div>

              <div className="form-group span-2">
                <label>Address</label>
                <textarea
                  value={formData.address || ""}
                  onChange={(e) => set({ address: e.target.value })}
                  rows={2}
                  placeholder="Street, City, State, PIN"
                  disabled={isSaving}
                />
              </div>

              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e) => set({ notes: e.target.value })}
                  rows={2}
                  placeholder="Optional notes…"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn sm" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn primary sm" disabled={isSaving}>
              {isSaving ? "Saving..." : (item ? "Save Changes" : "Create Customer")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
