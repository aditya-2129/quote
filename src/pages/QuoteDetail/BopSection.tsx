import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fmtINR } from "@utils/format";
import type { Bop } from "@utils/quoteTypes";
import type { BopCatalogItem } from "../../db/schema";
import { BopModal, type BopModalData } from "@components/BopModal";
import { ChevronDown, Package, Plus, Trash2 } from "lucide-react";
import { createBopCatalog, getAllBopCatalog } from "../../db/queries";

/* ===========================================================
   BopNameCell — combobox for picking / creating catalog BOPs
   =========================================================== */

function BopNameCell({
  bop,
  catalog,
  onApply,
  onRequestCreate,
}: {
  bop: Bop;
  catalog: BopCatalogItem[];
  onApply: (item: BopCatalogItem) => void;
  onRequestCreate: (initialName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(bop.name);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const committedLabel = bop.catalogId ? bop.name : "";
  const [prevCommittedLabel, setPrevCommittedLabel] = useState(committedLabel);
  if (committedLabel !== prevCommittedLabel) {
    setPrevCommittedLabel(committedLabel);
    setDraft(committedLabel);
  }

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const update = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 240) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const typedName = draft.trim();
  const filtered = useMemo(() => {
    const q = typedName.toLowerCase();
    return !q ? catalog : catalog.filter(item =>
      `${item.name} ${item.supplier ?? ""}`.toLowerCase().includes(q));
  }, [catalog, typedName]);

  const canCreate = typedName.length > 0
    && !catalog.some(item => item.name.toLowerCase() === typedName.toLowerCase());

  return (
    <div className="customer-combobox bop-name-cell" ref={wrapRef}>
      <input
        className="pname-input"
        placeholder="Select BOP…"
        value={draft}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => { setDraft(event.target.value); setOpen(true); }}
        onBlur={() => { setDraft(committedLabel); window.setTimeout(() => setOpen(false), 120); }}
      />
      <button
        type="button"
        aria-label="Browse BOP catalog"
        onMouseDown={event => event.preventDefault()}
        onClick={() => setOpen(o => !o)}
      >
        <ChevronDown size={12} />
      </button>
      {open && menuRect && (
        <div
          className="customer-menu bop-portal-menu"
          role="listbox"
          aria-label="BOP catalog"
          style={{ position: "fixed", left: menuRect.left, top: menuRect.top, width: menuRect.width }}
          onMouseDown={event => event.preventDefault()}
        >
          {filtered.length === 0 && !canCreate && (
            <div className="customer-empty">No matching catalog items. Type a name to add one.</div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={bop.catalogId === item.id}
              className={bop.catalogId === item.id ? "selected" : undefined}
              onClick={() => { onApply(item); setOpen(false); }}
            >
              <span className="customer-name">
                {item.name}
                {item.supplier && (
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--text-3)", fontWeight: 400 }}>
                    {item.supplier}
                  </span>
                )}
              </span>
              <span className="customer-contact mono">{fmtINR(item.unitCost)}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="create-customer"
              role="option"
              aria-selected="false"
              onMouseDown={event => event.preventDefault()}
              onClick={() => { onRequestCreate(typedName); setOpen(false); }}
            >
              <Plus size={13} />
              <span className="customer-name">{`Add "${typedName}"`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   BopSection — brought-out-parts table
   =========================================================== */

export const BopSection = memo(function BopSection({ bops, setBops, asmQty }: {
  bops: Bop[];
  setBops: Dispatch<SetStateAction<Bop[]>>;
  asmQty: number;
}) {
  const [catalog, setCatalog] = useState<BopCatalogItem[]>([]);
  const [catalogRefreshTick, setCatalogRefreshTick] = useState(0);
  const [creatingFor, setCreatingFor] = useState<{ rowId: string; initialName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getAllBopCatalog();
        if (!cancelled) setCatalog(rows);
      } catch { /* catalog load failure is non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [catalogRefreshTick]);

  const refreshCatalog = useCallback(() => setCatalogRefreshTick(v => v + 1), []);

  const subtotal = bops.reduce(
    (s, b) => s + Math.max(0, b.unitCost) * Math.max(0, b.qtyPerAssembly) * Math.max(0, asmQty), 0,
  );

  const update = (id: string, patch: Partial<Bop>) =>
    setBops(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const remove = (id: string) =>
    setBops(prev => prev.filter(b => b.id !== id));
  const addBlank = () =>
    setBops(prev => [...prev, {
      id: `qbop-${crypto.randomUUID()}`,
      catalogId: null,
      name: "",
      supplier: "",
      qtyPerAssembly: 1,
      unitCost: 0,
    }]);
  const applyCatalog = (id: string, item: BopCatalogItem) =>
    update(id, { catalogId: item.id, name: item.name, supplier: item.supplier ?? "", unitCost: item.unitCost });

  const createCatalogItem = async (data: BopModalData) =>
    createBopCatalog({
      name: (data.name ?? "").trim(),
      supplier: data.supplier?.trim() || null,
      unitCost: Number.isFinite(Number(data.unitCost)) ? Number(data.unitCost) : 0,
      currency: data.currency?.trim() || "INR",
      notes: data.notes?.trim() || null,
    });

  return (
    <div className="panel bop-section">
      <div className="panel-head bop-head">
        <div className="bop-head-main">
          <span className="title"><Package size={13} /> Brought-Out Parts</span>
          <span className="sub">{bops.length} item{bops.length === 1 ? "" : "s"} · Subtotal {fmtINR(subtotal)}</span>
        </div>
        <div className="right">
          <button className="btn sm" onClick={addBlank}><Plus size={12} /> Add BOP</button>
        </div>
      </div>

      {bops.length === 0 ? (
        <div className="empty-state" style={{ padding: "30px 18px" }}>
          <div className="es-ic"><Package size={18} /></div>
          <div className="es-title">No brought-out parts</div>
          <div className="es-hint">
            Search the catalog above, or pick &ldquo;New BOP (ad-hoc)&rdquo; to add a one-off item.
          </div>
        </div>
      ) : (
        <table className="parts-table bop-table">
          <colgroup>
            <col />
            <col style={{ width: "10%", minWidth: 70 }} />
            <col style={{ width: "13%", minWidth: 96 }} />
            <col style={{ width: "16%", minWidth: 100 }} />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Qty/asm</th>
              <th className="num">Unit cost</th>
              <th className="num">Total Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bops.map(bop => {
              const line = Math.max(0, bop.unitCost) * Math.max(0, bop.qtyPerAssembly) * Math.max(0, asmQty);
              return (
                <tr key={bop.id}>
                  <td>
                    <div className="body-cell">
                      <div>
                        <BopNameCell
                          bop={bop}
                          catalog={catalog}
                          onApply={item => applyCatalog(bop.id, item)}
                          onRequestCreate={name => setCreatingFor({ rowId: bop.id, initialName: name })}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="num">
                    <input
                      className="qty-input"
                      type="number"
                      min={0}
                      step={1}
                      value={bop.qtyPerAssembly}
                      onChange={e => update(bop.id, { qtyPerAssembly: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="qty-input"
                      type="number"
                      min={0}
                      step={0.01}
                      value={bop.unitCost}
                      onChange={e => update(bop.id, { unitCost: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td className="num">{fmtINR(line)}</td>
                  <td>
                    <button className="more-btn" title="Remove" onClick={() => remove(bop.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="totals">
              <td colSpan={3}>BOP subtotal</td>
              <td className="num">{fmtINR(subtotal)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {creatingFor && (
        <BopModal
          item={null}
          initialName={creatingFor.initialName}
          onClose={() => setCreatingFor(null)}
          onSave={async (data: BopModalData) => {
            const created = await createCatalogItem(data);
            applyCatalog(creatingFor.rowId, created);
            setCreatingFor(null);
            refreshCatalog();
          }}
        />
      )}
    </div>
  );
});
