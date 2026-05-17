import { useState, useEffect } from "react";
import { Package, Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { getAllBopCatalog, createBopCatalog, updateBopCatalog, deleteBopCatalog } from "../db/queries";
import type { BopCatalogItem } from "../db/schema";
import { EmptyState } from "../components/EmptyState";
import { BopModal, type BopModalData } from "../components/BopModal";

function fmtINR(n: number) { return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function BopsPage() {
  const [rows, setRows] = useState<BopCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BopCatalogItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await getAllBopCatalog());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = () => { setEditingItem(null); setModalOpen(true); };
  const handleEdit = (item: BopCatalogItem) => { setEditingItem(item); setModalOpen(true); };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteId) return;
    await deleteBopCatalog(confirmDeleteId);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleSave = async (data: BopModalData) => {
    const { name, supplier, unitCost, currency, notes } = data;
    const payload = {
      name: name!.trim(),
      supplier: supplier?.trim() || null,
      unitCost: Number.isFinite(unitCost) ? Number(unitCost) : 0,
      currency: currency?.trim() || "INR",
      notes: notes?.trim() || null,
    };
    if (editingItem) await updateBopCatalog(editingItem.id, payload);
    else await createBopCatalog(payload);
    setModalOpen(false);
    refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Brought-Out Parts</h1>
        <div className="page-sub">{rows.length} total</div>
        <div className="right" style={{ marginLeft: "auto" }}>
          <button className="btn primary sm" onClick={handleAdd}>
            <Plus size={14} /> New BOP
          </button>
        </div>
      </div>
      <div className="panel bops-list-panel">
        <div className="panel-head"><div className="title">All BOPs</div></div>
        {loading ? (
          <EmptyState text="Loading…" />
        ) : loadError ? (
          <EmptyState text={`Error: ${loadError}`} icon={<AlertTriangle size={24} />} />
        ) : rows.length === 0 ? (
          <EmptyState text="No BOPs yet." icon={<Package size={24} />} />
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Supplier</th>
                <th style={{ textAlign: "right" }}>Unit cost</th>
                <th style={{ width: "80px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.supplier ?? "—"}</td>
                  <td style={{ textAlign: "right" }} className="mono">{fmtINR(r.unitCost)}</td>
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
          </div>
        )}
      </div>

      {modalOpen && (
        <BopModal
          item={editingItem}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this BOP from the catalog? Existing quotes that reference it keep their snapshot."
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
