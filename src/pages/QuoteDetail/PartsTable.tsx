import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCatalog } from "@context/CatalogContext";
import { fmtINR, colorForMaterial } from "@utils/format";
import { fmtStockDims } from "@utils/stock";
import type { Part } from "@utils/quoteTypes";
import { partSubtotal as calculatePartSubtotal, operationMinutes as calculateOperationMinutes } from "../../utils/quoteCosting";
import { Check, ChevronDown, ChevronRight, Cog, Layers, Package, Plus, Search, Trash2, X } from "lucide-react";
import { ShapeIcon } from "@components/ShapeIcon";
import { OperationsEditor } from "./OperationsEditor";
import { StockPanel } from "./StockPanel";
import type { PartRowProps, PartsTableProps } from "./types";

const partQty = (p: Part, asmQty: number) => p.perAssembly * asmQty;

const PartRow = memo(function PartRow({ p, isSel, isExpanded, asmQty, onSelect, onUpdate, onToggleExpanded, onDelete }: PartRowProps) {
  const { materials, materialCosts, machineCosts, partMaterialLabel, opMachineShortLabel } = useCatalog();
  const qty = partQty(p, asmQty);
  const sub = calculatePartSubtotal(p, asmQty, materialCosts, machineCosts);
  const ops = p.operations || [];
  const totalMin = ops.reduce((a, op) => a + calculateOperationMinutes(op, qty), 0);
  const machineTags = ops.slice(0, 3).map(o => opMachineShortLabel(o));
  return (
    <tr className={`${isSel?"sel":""} ${!p.included?"excluded":""} ${isExpanded?"row-expanded":""}`} onClick={() => onSelect(p.id)}>
      <td className="include-cell"><input type="checkbox" aria-label={`Include ${p.name} in quote`} checked={p.included} onClick={e=>e.stopPropagation()} onChange={()=>onUpdate(p.id,{included:!p.included})}/></td>
      <td><div className="body-cell"><span className="swatch" style={{background:p.color}}/><div style={{minWidth:0}}>
        <input className="pname pname-input" aria-label="Part name" value={p.name} onClick={e=>e.stopPropagation()} onChange={e=>onUpdate(p.id,{name:e.target.value})}/>
        {!p.stocked&&p.stock&&(
          <div className="pmeta">
            <span className="stock-badge"><span className="shape-ic"><ShapeIcon shape={p.stock.shape} size={11}/></span>{fmtStockDims(p.stock)}</span>
          </div>
        )}
      </div></div></td>
      <td>{p.material ? <span className="material-chip"><span className="swatch" style={{background:materials[p.material]?.hex ?? colorForMaterial(p.material)}}/>{partMaterialLabel(p)}</span> : <span className="muted" style={{fontSize:11}}>—</span>}</td>
      <td className="num"><input type="number" className="qty-input" aria-label={`Per-assembly quantity for ${p.name}`} value={p.perAssembly} onClick={e=>e.stopPropagation()} onChange={e=>onUpdate(p.id,{perAssembly:+e.target.value||0})}/></td>
      <td className="num muted">{qty}</td>
      <td>{ops.length===0?<span className="muted" style={{fontSize:11}}>—</span>:<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span className="ops-pill"><Cog size={10}/> {new Intl.NumberFormat().format(totalMin)} min · {ops.length} ops</span><span className="muted" style={{fontSize:10.5,fontFamily:"var(--font-mono)"}}>{machineTags.join(" · ")}{ops.length>3?` +${ops.length-3}`:""}</span></div>}</td>
      <td className="num">{p.included?fmtINR(sub):"—"}</td>
      <td>
        <div className="row-actions">
          <button className="row-delete" onClick={e=>{e.stopPropagation();if(window.confirm(`Remove "${p.name}" from the quote?`))onDelete(p.id);}} title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`}><Trash2 size={13}/></button>
          <button className="expand-toggle" onClick={e=>{e.stopPropagation();onToggleExpanded(p.id);}} title={isExpanded?"Hide machining operations":"Show machining operations"} aria-expanded={isExpanded}>{isExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>
        </div>
      </td>
    </tr>
  );
});

export function PartsTable({ parts, setParts, asmQty, selectedId, onSelect, onAddPart, searchQuery }: PartsTableProps) {
  const { materials, materialCosts, machineCosts, partMaterialLabel, opMachineLabel } = useCatalog();
  const [filter, setFilter] = useState<"all"|"machined"|"purchased"|"excluded">("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback((id: string) => setExpandedId(prev => prev === id ? null : id), []);
  const bulkRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onDoc(e:MouseEvent) { if (bulkOpen&&bulkRef.current&&!bulkRef.current.contains(e.target as Node)) setBulkOpen(false); }
    document.addEventListener("mousedown",onDoc);
    return ()=>document.removeEventListener("mousedown",onDoc);
  },[bulkOpen]);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const setPartsRef = useRef(setParts);
  setPartsRef.current = setParts;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const stableUpdate = useCallback((id: string, patch: Partial<Part>) => { setPartsRef.current(partsRef.current.map(p => p.id === id ? { ...p, ...patch } : p)); }, []);
  const stableSelect = useCallback((id: string) => { onSelectRef.current(id); setExpandedId(id); }, []);
  const stableDelete = useCallback((id: string) => {
    setPartsRef.current(partsRef.current.filter(p => p.id !== id));
    setExpandedId(prev => prev === id ? null : prev);
    if (onSelectRef.current && partsRef.current.find(p => p.id === id)) {
      const remaining = partsRef.current.filter(p => p.id !== id);
      onSelectRef.current(remaining[0]?.id ?? null);
    }
  }, []);
  const counts = { included: parts.filter(p=>p.included).length, machined: parts.filter(p=>!p.stocked).length, purchased: parts.filter(p=>p.stocked).length, excluded: parts.filter(p=>!p.included).length };
  const q = searchQuery.trim().toLowerCase();
  const filtered = parts.filter(p => {
    if (filter==="machined"&&p.stocked) return false;
    if (filter==="purchased"&&!p.stocked) return false;
    if (filter==="excluded"&&p.included) return false;
    if (q) {
      const hay = `${p.name} ${p.id} ${partMaterialLabel(p)}`.toLowerCase();
      const opsMatch = (p.operations||[]).some(op => opMachineLabel(op).toLowerCase().includes(q));
      if (!hay.includes(q) && !opsMatch) return false;
    }
    return true;
  });
  const totalAmount = filtered.reduce((a,p)=>a+calculatePartSubtotal(p,asmQty,materialCosts,machineCosts),0);
  function bulkApply(patch: Partial<Part>) { const ids = new Set(filtered.map(p=>p.id)); setParts(parts.map(p => ids.has(p.id) ? { ...p, ...patch } : p)); setBulkOpen(false); }
  return (
    <div className="panel parts-panel">
      <div className="panel-head">
        <span className="title">Parts in quote</span>
        <span className="sub">{counts.included} of {parts.length} included · {asmQty} assemblies</span>
        <div className="right"><button className="btn sm ghost" onClick={onAddPart}><Plus size={12}/> Add part</button></div>
      </div>
      <div className="filter-bar">
        {(["all","machined","purchased"] as const).map(f=>(
          <button key={f} className={`filter-chip ${filter===f?"on":""}`} onClick={()=>setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)} <span className="count">{f==="all"?parts.length:f==="machined"?counts.machined:counts.purchased}</span>
          </button>
        ))}
        {counts.excluded>0&&<button className={`filter-chip ${filter==="excluded"?"on":""}`} onClick={()=>setFilter("excluded")}>Excluded <span className="count">{counts.excluded}</span></button>}
        <div className="bulk-wrap" ref={bulkRef}>
          <button className="btn sm" onClick={()=>setBulkOpen(!bulkOpen)}><Layers size={12}/> Bulk apply <ChevronDown size={11} style={{marginLeft:2,color:"var(--text-3)"}}/></button>
          {bulkOpen&&(
            <div className="bulk-menu">
              <div className="section">Apply to {filtered.length} visible parts</div>
              <div className="section" style={{paddingTop:0}}>Material</div>
              {Object.entries(materials).filter(([,m])=>m.isActive&&!m.isPurchased).map(([k,v])=><div className="opt" key={k} onClick={()=>bulkApply({material:k, materialLabelSnapshot:v.label})}><span className="swatch" style={{background:v.hex}}/><span>{v.label}</span></div>)}
              <div className="div"/>
              <div className="opt" onClick={()=>bulkApply({included:true})}><Check size={13}/> Include all visible</div>
              <div className="opt danger" onClick={()=>bulkApply({included:false})}><X size={13}/> Exclude all visible</div>
            </div>
          )}
        </div>
      </div>
      <table className="parts-table">
        <colgroup>
          <col style={{ width: 28 }} />
          <col />
          <col style={{ width: "15%", minWidth: 80 }} />
          <col style={{ width: "8%",  minWidth: 50 }} />
          <col style={{ width: "6%",  minWidth: 36 }} />
          <col style={{ width: "20%", minWidth: 90 }} />
          <col style={{ width: "17%", minWidth: 80 }} />
          <col style={{ width: 64 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="include-cell"/>
            <th>Part</th><th>Material</th>
            <th className="num">Per asm</th><th className="num">Qty</th>
            <th>Machining</th><th className="num">Subtotal</th>
            <th/>
          </tr>
        </thead>
        <tbody>
          {filtered.length===0&&parts.length===0&&<tr><td colSpan={8}><div className="empty-state" style={{padding:"30px 18px"}}><div className="es-ic"><Package size={18}/></div><div className="es-title">No parts yet</div><div className="es-hint">Add a manual part below, or import bodies from the CAD viewer.</div><div style={{marginTop:10}}><button className="btn sm primary" onClick={onAddPart}><Plus size={12}/> Add part</button></div></div></td></tr>}
          {filtered.length===0&&parts.length>0&&<tr><td colSpan={8}><div className="empty-state" style={{padding:"30px 18px"}}><div className="es-ic"><Search size={18}/></div><div className="es-title">No parts match the filter</div><div className="es-hint">Clear the search or pick a different filter.</div></div></td></tr>}
          {filtered.flatMap(p => {
            const isExpanded = expandedId === p.id;
            const rows = [<PartRow key={p.id} p={p} isSel={selectedId === p.id} isExpanded={isExpanded} asmQty={asmQty} onSelect={stableSelect} onUpdate={stableUpdate} onToggleExpanded={toggleExpanded} onDelete={stableDelete} />];
            if (isExpanded) {
              rows.push(
                <tr key={p.id+":ops"} className="ops-expand-row">
                  <td colSpan={8}>
                    <div className="ops-expand-body">
                      {p.stocked ? <div className="ops-purchased-note"><Package size={12}/> Purchased part - no in-house machining.</div> : <>
                        <StockPanel part={p} qty={partQty(p, asmQty)} onChange={(patch)=>stableUpdate(p.id, patch)}/>
                        <OperationsEditor part={p} qty={partQty(p, asmQty)} onChange={(patch)=>stableUpdate(p.id, patch)}/>
                      </>}
                    </div>
                  </td>
                </tr>
              );
            }
            return rows;
          })}
          <tr className="totals"><td colSpan={6} style={{color:"var(--text-3)"}}>Filtered subtotal · {filtered.length} of {parts.length} parts</td><td className="num">{fmtINR(totalAmount)}</td><td/></tr>
        </tbody>
      </table>
    </div>
  );
}
