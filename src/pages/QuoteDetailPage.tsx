import {
  memo,
  useCallback,
  useState,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import { useCad } from "@context/CadContext";
import { useQuoteState } from "@context/QuoteStateContext";
import { cadResultToParts } from "@utils/cadHandoff";
import type { Part, Op, Stock } from "@utils/quoteTypes";
import type { QuoteCalculation } from "../types";
import { exportQuotationPdf } from "@utils/export";
import { QuotePreviewViewer, type QuotePreviewViewerHandle } from "@components/QuotePreviewViewer";
import type { CadImportResult } from "@utils/index";
import {
  Box,
  Boxes,
  BoxesIcon,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cog,
  Copy,
  ExternalLink,
  FileDown,
  Info,
  Layers,
  Lightbulb,
  Minus,
  OctagonX,
  Package,
  Percent,
  Plus,
  Save,
  ScanLine,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sliders,
  Square,
  Truck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { dismissDfmIssue, getAllMaterials, getAllMachines, logQuoteEvent } from "../db/queries";
import {
  buildMachineCatalog,
  buildMaterialCatalog,
  buildQuantityBreaks,
  calculateQuoteRollup,
  effectivePartRate,
  materialRate,
  operationCost as calculateOperationCost,
  operationMinutes as calculateOperationMinutes,
  operationRate as calculateOperationRate,
  partFinishingCost as calculatePartFinishingCost,
  partMachineCost as calculatePartMachineCost,
  partMaterialCost as calculatePartMaterialCost,
  partNetMassKg as calculatePartNetMassKg,
  partQuantity,
  partSetupCost as calculatePartSetupCost,
  partSubtotal as calculatePartSubtotal,
  stockMassKg as calculateStockMassKg,
  type MachineCatalog,
  type MaterialCatalog,
} from "../utils/quoteCosting";

/* ===========================================================
   Reference data — loaded from DB (Material library / Machines & rates)
   =========================================================== */

type MaterialMeta = { label: string; density: number; hex: string; grade: string; forms: string[]; rates: Record<string, number>; isPurchased: boolean };
type MachineMeta  = { label: string; rate: number; short: string };
type DfmUiIssue = {
  id: string;
  partId: string;
  severity: "error" | "warn" | "info";
  title: string;
  desc: string;
  impact: number;
  suggest: string;
  actionable: boolean;
  isDismissed?: boolean;
};
type PartWithDfm = Part & {
  dfmIssues?: Array<{
    id?: string;
    partId: string;
    severity: "error" | "warn" | "info";
    title: string;
    description?: string | null;
    impactCost?: number;
    suggestion?: string | null;
    isActionable?: boolean;
    isDismissed?: boolean;
  }>;
};

// Mutable maps populated from the DB at app start. Cost utilities read from these.
const MATERIALS: Record<string, MaterialMeta> = {};
const MACHINES:  Record<string, MachineMeta>  = {};
const MATERIAL_COSTS: MaterialCatalog = {};
const MACHINE_COSTS: MachineCatalog = {};

const MATERIAL_PALETTE = ["#8d959c", "#bfc7d1", "#c69f5a", "#a8b0b8", "#dcd9d2", "#7d92aa", "#a89b7a", "#a3b5a8"];
function colorForMaterial(id: string): string {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return MATERIAL_PALETTE[Math.abs(h) % MATERIAL_PALETTE.length];
}

// Pub-sub so React components can re-render when the catalog finishes loading.
const catalogListeners = new Set<() => void>();
let catalogVersion = 0;
function notifyCatalog() { catalogVersion++; catalogListeners.forEach(l => l()); }

function useCatalogVersion() {
  const [, setV] = useState(0);
  useEffect(() => {
    const l = () => setV(v => v + 1);
    catalogListeners.add(l);
    return () => { catalogListeners.delete(l); };
  }, []);
  return catalogVersion;
}

let catalogInflight: Promise<void> | null = null;
async function loadCatalog(): Promise<void> {
  if (catalogInflight) return catalogInflight;
  catalogInflight = (async () => {
    const [mats, machs] = await Promise.all([getAllMaterials(true), getAllMachines(true)]);
    for (const k of Object.keys(MATERIALS)) delete MATERIALS[k];
    for (const k of Object.keys(MACHINES))  delete MACHINES[k];
    for (const k of Object.keys(MATERIAL_COSTS)) delete MATERIAL_COSTS[k];
    for (const k of Object.keys(MACHINE_COSTS)) delete MACHINE_COSTS[k];
    Object.assign(MATERIAL_COSTS, buildMaterialCatalog(mats));
    Object.assign(MACHINE_COSTS, buildMachineCatalog(machs));
    for (const m of mats) {
      MATERIALS[m.id] = {
        label: m.name,
        density: m.densityKgPerM3,
        hex: colorForMaterial(m.id),
        grade: m.category || "",
        forms: m.availableForms || [],
        rates: m.formRates || {},
        isPurchased: (m.category || "").toLowerCase() === "purchased",
      };
    }
    for (const m of machs) {
      MACHINES[m.id] = { label: m.name, rate: m.ratePerHour, short: m.shortName };
    }
    notifyCatalog();
  })().finally(() => { catalogInflight = null; });
  return catalogInflight;
}

const SHAPES: Record<string, { label: string; dims: string[] }> = {
  "rect":  { label: "Rect",  dims: ["L","W","H"] },
  "round": { label: "Round", dims: ["D","L","ID"] },
  "hex":   { label: "Hex",   dims: ["AF","L"] },
};

// Migrate legacy shape keys (block/plate/round-bar/square-bar/tube) to the new 3-shape model.
function normalizeStock(stock: Stock | null): Stock | null {
  if (!stock) return null;
  const s = stock.shape;
  if (s === "rect" || s === "round" || s === "hex") return stock;
  const d = stock.dims || {};
  if (s === "plate" || s === "block") return { shape: "rect",  dims: { L: d.L ?? 80, W: d.W ?? 50, H: d.H ?? 25 } };
  if (s === "round-bar")               return { shape: "round", dims: { D: d.D ?? 30, L: d.L ?? 80, ID: 0 } };
  if (s === "tube")                    return { shape: "round", dims: { D: d.OD ?? 30, L: d.L ?? 80, ID: d.ID ?? 0 } };
  if (s === "square-bar")              return { shape: "hex",   dims: { AF: d.side ?? 24, L: d.L ?? 80 } };
  return { shape: "rect", dims: { L: 80, W: 50, H: 25 } };
}

let __opSeq = 100;
const opId = () => `op-${++__opSeq}`;

const TOOLING_BATCH = 244;
const INSPECTION_BATCH = 326;

const DFM_ISSUES: DfmUiIssue[] = [
  { id:"dfm-1", partId:"body-cap", severity:"error", title:"Wall thickness 0.8 mm",         desc:"Below 1.0 mm minimum for steel machining. Risk of deflection during finishing.",               impact:90,  suggest:"Increase wall to ≥ 1.0 mm or accept reduced batch yield", actionable:true },
  { id:"dfm-2", partId:"body-cap", severity:"warn",  title:"Internal corner radius 0.5 mm",  desc:"Below tool minimum for 3-axis mill. Adds tool-change time or forces 5-axis path.",            impact:120, suggest:"Relax to R1.0 mm or switch to 5-axis", actionable:true },
  { id:"dfm-3", partId:"body-mid", severity:"warn",  title:"Deep pocket · 18 × 12 × 32 mm", desc:"Aspect ratio > 2.5 requires long-reach tooling. Adds cycle time.",                            impact:60,  suggest:"Confirm pocket depth — drawing rev C tolerance", actionable:false },
  { id:"dfm-4", partId:"body-cap", severity:"info",  title:"Tap depth 3.2 × diameter",       desc:"Above standard 2.5× for M6 — adds tap breakage risk and inspection time.",                   impact:40,  suggest:"Verify thread engagement with customer", actionable:false },
];

/* ===========================================================
   Costing utilities
   =========================================================== */

function getMaterialRate(materialId: string, stockShape?: string): number {
  return materialRate(MATERIAL_COSTS, materialId, stockShape);
}

// Effective per-kg rate for a part: per-quote override wins, otherwise falls back to the material library.
function partRate(p: Part): number {
  return effectivePartRate(p, MATERIAL_COSTS);
}

function stockMassKg(stock: Stock|null, materialId: string): number {
  return calculateStockMassKg(stock, materialId, MATERIAL_COSTS);
}

// Net (machined) part mass — derived from CAD volume × current material density.
// Falls back to a stored `mass` value if no geometry is available (e.g. manually added parts).
function partNetMassKg(p: Part): number {
  return calculatePartNetMassKg(p, MATERIAL_COSTS);
}

function stockUtilization(p: Part): number|null {
  if (!p.stock||p.stocked) return null;
  const sm = stockMassKg(p.stock, p.material);
  const nm = partNetMassKg(p);
  return sm>0 ? nm/sm : null;
}

const partQty = (p: Part, asmQty: number) => partQuantity(p, asmQty);

function opRate(op: Op): number {
  return calculateOperationRate(op, MACHINE_COSTS);
}
function opCost(op: Op, qty: number): number {
  return calculateOperationCost(op, qty, MACHINE_COSTS);
}
function opMinutes(op: Op, qty: number): number { return calculateOperationMinutes(op, qty); }

function partMachineCost(p: Part, asmQty: number): number {
  return calculatePartSetupCost(p, MACHINE_COSTS) + calculatePartMachineCost(p, asmQty, MACHINE_COSTS);
}
function partMaterialCost(p: Part, asmQty: number): number {
  return calculatePartMaterialCost(p, asmQty, MATERIAL_COSTS);
}
function partFinishCost(p: Part, asmQty: number): number { return calculatePartFinishingCost(p, asmQty); }
function partSubtotal(p: Part, asmQty: number): number {
  return calculatePartSubtotal(p, asmQty, MATERIAL_COSTS, MACHINE_COSTS);
}

function rollup(parts: Part[], asmQty: number, commercial: { marginPct:number; taxPct:number }) {
  return calculateQuoteRollup(parts, asmQty, commercial, MATERIAL_COSTS, MACHINE_COSTS, {
    toolingCost: TOOLING_BATCH,
    inspectionCost: INSPECTION_BATCH,
  });
}

function fmtINR(n: number) { return "₹"+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtINR0(n: number) { return "₹"+n.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0}); }
function fmtMin(n: number) { return n.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:1}); }
function fmtPct(n: number) { return (n>=0?"+":"")+n.toFixed(1)+"%"; }

function fmtStockDims(stock: Stock): string {
  const d = stock.dims || {};
  const r = (n: number) => Math.round(n).toString();
  switch (stock.shape) {
    case "rect":  return `${r(d.L||0)}×${r(d.W||0)}×${r(d.H||0)} mm`;
    case "round": return d.ID ? `⌀${r(d.D||0)}×${r(d.L||0)} mm · ID ${r(d.ID)}` : `⌀${r(d.D||0)}×${r(d.L||0)} mm`;
    case "hex":   return `AF ${r(d.AF||0)}×${r(d.L||0)} mm`;
    default: return "";
  }
}

function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start); let added = 0;
  while (added<n) { d.setDate(d.getDate()+1); const dow=d.getDay(); if (dow!==0&&dow!==6) added++; }
  return d;
}
function fmtShipDate(d: Date) { return d.toLocaleDateString("en-US",{month:"short",day:"numeric",weekday:"short"}); }

function downloadBytes(fileName: string, bytes: Uint8Array, mimeType: string) {
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportCalculationFromQuote(args: {
  rfq: { customer: string; project: string; rfqRef: string; notes: string };
  parts: Part[];
  asmQty: number;
  commercial: { marginPct: number; taxPct: number };
}): QuoteCalculation {
  const included = args.parts.filter(p => p.included);
  const firstPart = included[0] ?? args.parts[0];
  const totals = rollup(args.parts, args.asmQty, args.commercial);
  const partRows = included.map(p => `${p.name} x ${partQty(p, args.asmQty)}`).join(", ");
  const partName = included.length > 1 ? `${included.length} quoted parts` : firstPart?.name ?? "Quoted parts";
  const materialId = firstPart?.material || "material";
  const material = MATERIALS[materialId];
  const geometry = (firstPart as Part & { geometry?: { bboxXMm?: number; bboxYMm?: number; bboxZMm?: number; volumeMm3?: number; surfaceAreaMm2?: number; faceCount?: number; edgeCount?: number; vertexCount?: number } }).geometry;
  const volumeMm3 = geometry?.volumeMm3 ?? firstPart?.netVolumeMm3 ?? 0;
  const surfaceAreaMm2 = geometry?.surfaceAreaMm2 ?? 0;

  return {
    id: args.rfq.rfqRef || crypto.randomUUID(),
    quoteNumber: args.rfq.rfqRef || "DRAFT-QUOTE",
    customerName: args.rfq.customer,
    projectName: args.rfq.project || "Untitled quote",
    partName,
    quantity: args.asmQty,
    currency: "INR",
    material: {
      id: materialId,
      name: material?.label ?? materialId,
      densityKgPerM3: material?.density ?? 0,
      costPerKg: getMaterialRate(materialId, firstPart?.stock?.shape),
      currency: "INR",
    },
    geometry: {
      fileName: args.rfq.project || partName,
      unitSystem: "metric",
      boundingBoxMm: {
        x: geometry?.bboxXMm ?? 0,
        y: geometry?.bboxYMm ?? 0,
        z: geometry?.bboxZMm ?? 0,
      },
      volumeMm3,
      surfaceAreaMm2,
      volumeCm3: volumeMm3 / 1000,
      surfaceAreaCm2: surfaceAreaMm2 / 100,
      boundingBoxVolumeMm3: (geometry?.bboxXMm ?? 0) * (geometry?.bboxYMm ?? 0) * (geometry?.bboxZMm ?? 0),
      materialUtilizationPercent: firstPart ? (stockUtilization(firstPart) ?? 0) * 100 : 0,
      longestDimensionMm: Math.max(geometry?.bboxXMm ?? 0, geometry?.bboxYMm ?? 0, geometry?.bboxZMm ?? 0),
      shortestDimensionMm: Math.min(geometry?.bboxXMm ?? 0, geometry?.bboxYMm ?? 0, geometry?.bboxZMm ?? 0),
      faceCount: geometry?.faceCount ?? 0,
      edgeCount: geometry?.edgeCount ?? 0,
      vertexCount: geometry?.vertexCount ?? 0,
    },
    massKg: firstPart ? partNetMassKg(firstPart) : 0,
    process: {
      setupCost: totals.partsCost,
      machineRatePerHour: 0,
      machineTimeMinutes: 0,
      laborRatePerHour: 0,
      laborTimeMinutes: 0,
      finishingCost: 0,
      inspectionCost: totals.inspection,
      toolingCost: totals.tooling,
    },
    taxPercent: args.commercial.taxPct,
    marginPercent: args.commercial.marginPct,
    discountPercent: 0,
    costs: {
      materialCost: included.reduce((sum, part) => sum + partMaterialCost(part, args.asmQty), 0),
      setupCost: 0,
      machineCost: included.reduce((sum, part) => sum + partMachineCost(part, args.asmQty), 0),
      laborCost: 0,
      finishingCost: included.reduce((sum, part) => sum + partFinishCost(part, args.asmQty), 0),
      inspectionCost: totals.inspection,
      toolingCost: totals.tooling,
      subtotal: totals.subtotal,
      discount: 0,
      margin: totals.margin,
      tax: totals.tax,
      total: totals.total,
      unitPrice: totals.unitPrice,
    },
    createdAt: new Date().toISOString(),
    notes: [args.rfq.notes, partRows ? `Parts: ${partRows}` : ""].filter(Boolean).join("\n\n"),
  };
}

function computeLeadTime(parts: Part[], asmQty: number) {
  let totalMachineMin = 0;
  parts.forEach(p=>{ if (!p.included) return; (p.operations||[]).forEach(op=>{ totalMachineMin+=opMinutes(op,partQty(p,asmQty)); }); });
  const queue=3, machine=Math.max(2,Math.ceil(totalMachineMin/60/6)), finish=parts.some(p=>p.included&&p.finishing>0)?3:0, ship=2;
  const total = queue+machine+finish+ship;
  return { queue, machine, finish, ship, total, shipDate:addBusinessDays(new Date(),total) };
}

/* ===========================================================
   Shape icon
   =========================================================== */

function ShapeIcon({ shape, size=14 }: { shape:string; size?:number }) {
  const s=size, sw=1.25, stroke="currentColor";
  switch (shape) {
    case "rect":  return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="10" height="8" rx="0.5" stroke={stroke} strokeWidth={sw}/><line x1="3" y1="6" x2="13" y2="6" stroke={stroke} strokeWidth={sw} opacity="0.5"/></svg>;
    case "round": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="6" rx="3" stroke={stroke} strokeWidth={sw}/></svg>;
    case "hex":   return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><polygon points="4,4 12,4 14.5,8 12,12 4,12 1.5,8" stroke={stroke} strokeWidth={sw} strokeLinejoin="round"/></svg>;
    default: return null;
  }
}

/* ===========================================================
   Quote preview (SVG)
   =========================================================== */

function QuotePreview({ parts, selectedId, onSelect, title }: { parts:Part[]; selectedId:string|null; onSelect:(id:string|null)=>void; title?:string }) {
  const c30=Math.cos(Math.PI/6), s30=Math.sin(Math.PI/6);

  function cuboid(id:string, cx:number, cy:number, w:number, h:number, d:number, topC:string, leftC:string, rightC:string) {
    const half={x:(w/2)*c30,y:(w/2)*s30}, dep={x:(d/2)*c30,y:-(d/2)*s30};
    const A=[cx-half.x-dep.x, cy-h/2-half.y-dep.y], B=[cx+half.x-dep.x, cy-h/2+half.y-dep.y];
    const C=[cx+half.x+dep.x, cy-h/2+half.y+dep.y], D=[cx-half.x+dep.x, cy-h/2-half.y+dep.y];
    const A2=[A[0],A[1]+h], B2=[B[0],B[1]+h], C2=[C[0],C[1]+h];
    const part=parts.find(p=>p.id===id);
    const isSel=selectedId===id, excluded=part&&!part.included, opacity=excluded?0.35:1;
    const edge=isSel?"#2f4f7d":"#1e2734", sw=isSel?1.4:0.5;
    const poly=(pts:number[][], fill:string)=><polygon points={pts.map(p=>p.join(",")).join(" ")} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round"/>;
    const issues=DFM_ISSUES.filter(i=>i.partId===id);
    const worstSev=issues.reduce((acc:string,i)=>i.severity==="error"?"error":(acc==="error"?"error":(i.severity==="warn"?"warn":acc)),"info");
    return (
      <g key={id} data-part={id} onClick={e=>{e.stopPropagation();onSelect(id);}} style={{opacity,cursor:"pointer"}}>
        {poly([A,B,C,D],topC)}{poly([A,B,B2,A2],leftC)}{poly([B,C,C2,B2],rightC)}
        {isSel&&<rect x={Math.min(A[0],A2[0])-6} y={A[1]-6} width={Math.abs(C[0]-A[0])+12} height={h+Math.abs(C[1]-A[1])+12} fill="none" stroke="#2f4f7d" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" rx="2" pointerEvents="none"/>}
        {issues.length>0&&<g pointerEvents="none"><circle cx={C[0]+6} cy={C[1]-2} r="7" fill={worstSev==="error"?"#b54a3b":worstSev==="warn"?"#b48241":"#5d80c9"}/><text x={C[0]+6} y={C[1]+1} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" fill="#fff">{issues.length}</text></g>}
      </g>
    );
  }

  return (
    <div className="canvas" style={{flex:1,minHeight:0}} onClick={()=>onSelect(null)}>
      <div className="canvas-grid"/>
      <div className="canvas-hud-top">
        {title && <span className="pill"><Box size={11}/> {title}</span>}
        <span className="pill">Click a body to edit</span>
      </div>
      <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}>
        <svg viewBox="0 0 480 320" width="100%" height="100%" style={{maxWidth:460,maxHeight:300}}>
          <defs><filter id="ds2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.10"/></filter></defs>
          <g filter="url(#ds2)" transform="translate(0,30)">
            {cuboid("body-base",240,215,230,24,120,"#c8d0db","#a8b1be","#8e98a6")}
            {cuboid("body-mid", 240,170,150,38,80, "#d4dbe5","#b3bcc9","#97a1af")}
            {cuboid("body-cap", 240,120,80, 26,44,  "#3b5a86","#2f4f7d","#24416b")}
          </g>
        </svg>
      </div>
      <div className="canvas-hud-bot">
        <button className="zoom-btn"><Minus size={12}/></button>
        <span className="zoom-val">100%</span>
        <button className="zoom-btn"><Plus size={12}/></button>
      </div>
    </div>
  );
}

/* ===========================================================
   CAD preview (real Three.js model)
   =========================================================== */

function QuoteCadPreview({ model, selectedId, selectedMeshIds, showAll }: {
  model: CadImportResult;
  selectedId: string | null;
  selectedMeshIds: string[];
  showAll: boolean;
}) {
  const viewerRef = useRef<QuotePreviewViewerHandle | null>(null);
  const isolate = !showAll && selectedId !== null && selectedMeshIds.length > 0;

  const selectedMeshIdSet = useMemo(() => new Set(selectedMeshIds), [selectedMeshIds]);

  const hiddenMeshIds = useMemo(() => {
    if (!isolate) return new Set<string>();
    return new Set(model.meshes.filter(m => !selectedMeshIdSet.has(m.id)).map(m => m.id));
  }, [isolate, selectedMeshIdSet, model]);

  useEffect(() => {
    const id = setTimeout(
      () => viewerRef.current?.fit(isolate ? selectedMeshIds : undefined),
      60,
    );
    return () => clearTimeout(id);
  }, [isolate, selectedMeshIds, model]);

  return (
    <div className="canvas" style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <QuotePreviewViewer
        ref={viewerRef}
        model={model}
        selectedMeshIds={selectedMeshIdSet}
        hiddenMeshIds={hiddenMeshIds}
      />
    </div>
  );
}

/* ===========================================================
   Operations editor
   =========================================================== */

function StockPanel({ part, qty, onChange }: { part:Part; qty:number; onChange:(patch:Partial<Part>)=>void }) {
  const stock = normalizeStock(part.stock) || { shape: "rect", dims: { L: 80, W: 50, H: 25 } };
  const cfg = SHAPES[stock.shape] || SHAPES.rect;
  const rate = partRate(part);
  const sm = stockMassKg(stock, part.material);
  const materialCost = sm * rate * qty;
  const netMass = partNetMassKg(part);
  const util = sm > 0 ? (netMass / sm) * 100 : 0;
  const utilClass = util >= 50 ? "good" : util >= 25 ? "warn" : "poor";
  const isOverride = part.materialRateOverride != null;

  function updateShape(newShape: string) {
    const newCfg = SHAPES[newShape];
    const defaults: Record<string, number> = { L: 80, W: 50, H: 25, D: 30, ID: 0, AF: 24 };
    const newDims: Record<string, number> = {};
    newCfg.dims.forEach(k => { newDims[k] = stock.dims?.[k] ?? defaults[k]; });
    // Shape changed → rates may differ per form, drop the override so the library rate kicks back in.
    onChange({ stock: { shape: newShape, dims: newDims }, materialRateOverride: null });
  }
  function updateDim(k: string, v: number) {
    onChange({ stock: { ...stock, dims: { ...stock.dims, [k]: v } } });
  }
  function updateMaterial(newMat: string) {
    // Material changed → clear the per-part rate override.
    onChange({ material: newMat, materialRateOverride: null });
  }
  function updateRate(v: number) {
    onChange({ materialRateOverride: v });
  }
  function resetRate() {
    onChange({ materialRateOverride: null });
  }

  return (
    <div className="stock-panel">
      <div className="sp-row">
        <span className="sp-eyebrow">Material</span>
        <select
          className="sp-mat-select"
          aria-label="Material"
          value={part.material}
          onChange={e => updateMaterial(e.target.value)}
        >
          {!MATERIALS[part.material] && <option value="">Select material…</option>}
          {Object.entries(MATERIALS).filter(([, m]) => !m.isPurchased).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <div className={`sp-rate-edit ${isOverride ? "override" : ""}`} title={isOverride ? "Custom rate for this quote — click ↺ to reset to library rate" : "Click to override rate for this quote"}>
          <span className="muted">Rate ₹</span>
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label="Material rate per kg"
            value={Number.isFinite(rate) ? rate : 0}
            onChange={e => updateRate(+e.target.value || 0)}
          />
          <span className="muted">/kg</span>
          {isOverride && <button className="sp-rate-reset" onClick={resetRate} title="Reset to library rate">↺</button>}
        </div>
      </div>
      <div className="sp-row">
        <span className="sp-eyebrow">Shape</span>
        <div className="sp-shape-chips">
          {Object.entries(SHAPES).map(([k, s]) => (
            <button key={k} className={`sp-shape-chip ${stock.shape === k ? "on" : ""}`} onClick={() => updateShape(k)}>
              <span className="shape-ic"><ShapeIcon shape={k} size={12} /></span>
              {s.label}
            </button>
          ))}
        </div>
        <span className={`util-pill ${utilClass}`}><Percent size={10} /> {util.toFixed(0)}% util</span>
      </div>
      <div className={`sp-dims dims-${cfg.dims.length}`}>
        {cfg.dims.map(k => (
          <label className="sp-field" key={k}>
            <span>{k}</span>
            <div className="suffix">
              <input type="number" min="0" aria-label={`Stock dimension ${k} (mm)`} value={stock.dims?.[k] ?? 0} onChange={e => updateDim(k, +e.target.value || 0)} />
              <span className="unit">mm</span>
            </div>
          </label>
        ))}
      </div>
      <div className="sp-foot">
        <span className="sp-summary">
          <strong>{sm.toFixed(3)} kg</strong> stock · {netMass.toFixed(3)} kg net · {Math.max(0, sm - netMass).toFixed(3)} kg waste
        </span>
        <span className="sp-total">{fmtINR(materialCost)} material</span>
      </div>
    </div>
  );
}

function OperationsEditor({ part, qty, onChange }: { part:Part; qty:number; onChange:(patch:Partial<Part>)=>void }) {
  function update(id:string, patch:Partial<Op>) { onChange({operations:part.operations.map(op=>op.id===id?{...op,...patch}:op)}); }
  function remove(id:string) { onChange({operations:part.operations.filter(op=>op.id!==id)}); }
  function move(i:number, dir:number) { const list=part.operations.slice(); const j=i+dir; if (j<0||j>=list.length) return; [list[i],list[j]]=[list[j],list[i]]; onChange({operations:list}); }
  function add() {
    const defaultMachine = Object.keys(MACHINES)[0] ?? "";
    onChange({operations:[...part.operations,{id:opId(),machine:defaultMachine,setupMin:5,cycleMin:1}]});
  }
  const totalMin=part.operations.reduce((a,op)=>a+opMinutes(op,qty),0);
  const totalCost=partMachineCost(part,qty/(part.perAssembly||1));
  return (
    <div className="ops-panel">
      <div className="op-head">
        <span className="op-col-idx">#</span>
        <span className="op-col-machine">Operation · machine</span>
        <span className="op-col-spacer" />
        <span className="op-col-rate">Rate</span>
        <span className="op-col-setup">Setup</span>
        <span className="op-col-cycle">Cycle</span>
        <span className="op-col-cost">Cost</span>
        <span className="op-col-x" />
      </div>
      {part.operations.length === 0 && (
        <div className="op-empty">No operations — add one to start estimating.</div>
      )}
      {part.operations.map((op, i) => {
        const rate = opRate(op);
        const isRateOverride = op.rateOverride != null;
        return (
          <div className="op-row" key={op.id}>
            <span className="op-col-idx">
              <span className="op-reorder">
                <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={10} /></button>
                <button onClick={() => move(i, +1)} disabled={i === part.operations.length - 1} title="Move down"><ChevronDown size={10} /></button>
              </span>
              <span className="op-idx">{i + 1}</span>
            </span>
            <div className="op-col-machine">
              <select aria-label="Machine" value={op.machine} onChange={e => update(op.id, { machine: e.target.value, rateOverride: null })}>
                {Object.entries(MACHINES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <span className="op-col-spacer" />
            <div className="op-col-rate">
              <div className={`op-num-input ${isRateOverride ? "override" : ""}`} title={isRateOverride ? "Custom rate for this quote — click ↺ to reset" : "Click to override rate for this quote"}>
                <input type="number" min="0" step="1" aria-label="Machine rate per hour" value={rate} onChange={e => update(op.id, { rateOverride: +e.target.value || 0 })} />
                <span className="unit">/h</span>
                {isRateOverride && <button className="op-rate-reset" onClick={() => update(op.id, { rateOverride: null })} title="Reset to library rate">↺</button>}
              </div>
            </div>
            <div className="op-col-setup">
              <div className="op-num-input">
                <input type="number" min="0" step="0.5" aria-label="Setup minutes" value={op.setupMin} onChange={e => update(op.id, { setupMin: +e.target.value || 0 })} />
                <span className="unit">min</span>
              </div>
            </div>
            <div className="op-col-cycle">
              <div className="op-num-input">
                <input type="number" min="0" step="0.1" aria-label="Cycle minutes" value={op.cycleMin} onChange={e => update(op.id, { cycleMin: +e.target.value || 0 })} />
                <span className="unit">min</span>
              </div>
            </div>
            <span className="op-col-cost">{fmtINR(opCost(op, qty))}</span>
            <button className="op-col-x op-remove" onClick={() => remove(op.id)} title="Remove operation"><X size={12} /></button>
          </div>
        );
      })}
      <div className="op-foot">
        <button className="op-add-btn" onClick={add}><Plus size={12} /> Add operation</button>
        <span className="op-summary"><strong>{fmtMin(totalMin)} min</strong> · {fmtINR(totalCost)} machining</span>
      </div>
    </div>
  );
}

/* ===========================================================
   Stock editor
   =========================================================== */

/* ===========================================================
   Parts table
   =========================================================== */

type RowProps = {
  p: Part;
  isSel: boolean;
  isExpanded: boolean;
  asmQty: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Part>) => void;
  onToggleExpanded: (id: string) => void;
};

const PartRow = memo(function PartRow({ p, isSel, isExpanded, asmQty, onSelect, onUpdate, onToggleExpanded }: RowProps) {
  const qty = partQty(p, asmQty);
  const sub = partSubtotal(p, asmQty);
  const ops = p.operations || [];
  const totalMin = ops.reduce((a, op) => a + opMinutes(op, qty), 0);
  const machineTags = ops.slice(0, 3).map(o => MACHINES[o.machine]?.short || o.machine);
  return (
    <tr className={`${isSel?"sel":""} ${!p.included?"excluded":""} ${isExpanded?"row-expanded":""}`} onClick={() => onSelect(p.id)}>
      <td className="include-cell"><input type="checkbox" aria-label={`Include ${p.name} in quote`} checked={p.included} onClick={e=>e.stopPropagation()} onChange={()=>onUpdate(p.id,{included:!p.included})}/></td>
      <td><div className="body-cell"><span className="swatch" style={{background:p.color}}/><div style={{minWidth:0}}>
        <div className="pname">{p.name}</div>
        <div className="pmeta">#{p.id}{p.stocked?" · purchased":" · machined"}
          {!p.stocked&&p.stock&&<span className="stock-badge" style={{marginLeft:8}}><span className="shape-ic"><ShapeIcon shape={p.stock.shape} size={11}/></span>{fmtStockDims(p.stock)}</span>}
        </div>
      </div></div></td>
      <td>{(() => { const m = MATERIALS[p.material]; return m ? <span className="material-chip"><span className="swatch" style={{background:m.hex}}/>{m.label}</span> : <span className="muted" style={{fontSize:11}}>—</span>; })()}</td>
      <td className="num"><input type="number" className="qty-input" aria-label={`Per-assembly quantity for ${p.name}`} value={p.perAssembly} onClick={e=>e.stopPropagation()} onChange={e=>onUpdate(p.id,{perAssembly:+e.target.value||0})}/></td>
      <td className="num muted">{qty}</td>
      <td>{ops.length===0?<span className="muted" style={{fontSize:11}}>—</span>:<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span className="ops-pill"><Cog size={10}/> {fmtMin(totalMin)} min · {ops.length} ops</span><span className="muted" style={{fontSize:10.5,fontFamily:"var(--font-mono)"}}>{machineTags.join(" · ")}{ops.length>3?` +${ops.length-3}`:""}</span></div>}</td>
      <td className="num">{p.included?fmtINR(sub):"—"}</td>
      <td>
        <button
          className="expand-toggle"
          onClick={e=>{e.stopPropagation();onToggleExpanded(p.id);}}
          title={isExpanded?"Hide machining operations":"Show machining operations"}
          aria-expanded={isExpanded}
        >
          {isExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
        </button>
      </td>
    </tr>
  );
});

function PartsTable({ parts, setParts, asmQty, selectedId, onSelect, searchQuery }: {
  parts:Part[]; setParts:(p:Part[])=>void;
  asmQty:number; selectedId:string|null;
  onSelect:(id:string|null)=>void;
  searchQuery:string;
}) {
  const [filter, setFilter] = useState<"all"|"machined"|"purchased"|"excluded">("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);
  const bulkRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function onDoc(e:MouseEvent) { if (bulkOpen&&bulkRef.current&&!bulkRef.current.contains(e.target as Node)) setBulkOpen(false); }
    document.addEventListener("mousedown",onDoc);
    return ()=>document.removeEventListener("mousedown",onDoc);
  },[bulkOpen]);

  // Keep stable callbacks so memoized rows don't re-render when only selectedId changes.
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const setPartsRef = useRef(setParts);
  setPartsRef.current = setParts;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const stableUpdate = useCallback((id: string, patch: Partial<Part>) => {
    setPartsRef.current(partsRef.current.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);
  const stableSelect = useCallback((id: string) => {
    onSelectRef.current(id);
    setExpandedId(id);
  }, []);

  const counts={included:parts.filter(p=>p.included).length,machined:parts.filter(p=>!p.stocked).length,purchased:parts.filter(p=>p.stocked).length,excluded:parts.filter(p=>!p.included).length};
  const q=searchQuery.trim().toLowerCase();
  const filtered=parts.filter(p=>{
    if (filter==="machined"&&p.stocked) return false;
    if (filter==="purchased"&&!p.stocked) return false;
    if (filter==="excluded"&&p.included) return false;
    if (q) {
      const hay=`${p.name} ${p.id} ${MATERIALS[p.material]?.label||""}`.toLowerCase();
      const opsMatch=(p.operations||[]).some(op=>(MACHINES[op.machine]?.label||"").toLowerCase().includes(q));
      if (!hay.includes(q)&&!opsMatch) return false;
    }
    return true;
  });

  const totalAmount=filtered.reduce((a,p)=>a+partSubtotal(p,asmQty),0);
  function bulkApply(patch:Partial<Part>) { const ids=new Set(filtered.map(p=>p.id)); setParts(parts.map(p=>ids.has(p.id)?{...p,...patch}:p)); setBulkOpen(false); }

  return (
    <div className="panel parts-panel">
      <div className="panel-head">
        <span className="title">Parts in quote</span>
        <span className="sub">{counts.included} of {parts.length} included · {asmQty} assemblies</span>
        <div className="right"><button className="btn sm ghost"><Plus size={12}/> Add part</button></div>
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
              {Object.entries(MATERIALS).filter(([,m])=>!m.isPurchased).map(([k,v])=><div className="opt" key={k} onClick={()=>bulkApply({material:k})}><span className="swatch" style={{background:v.hex}}/><span>{v.label}</span></div>)}
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
          <col style={{ width: 26 }} />
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
          {filtered.length===0&&<tr><td colSpan={8}><div className="empty-state" style={{padding:"30px 18px"}}><div className="es-ic"><Search size={18}/></div><div className="es-title">No parts match the filter</div><div className="es-hint">Clear the search or pick a different filter.</div></div></td></tr>}
          {filtered.flatMap(p => {
            const isExpanded = expandedId === p.id;
            const rows = [
              <PartRow
                key={p.id}
                p={p}
                isSel={selectedId === p.id}
                isExpanded={isExpanded}
                asmQty={asmQty}
                onSelect={stableSelect}
                onUpdate={stableUpdate}
                onToggleExpanded={toggleExpanded}
              />,
            ];
            if (isExpanded) {
              rows.push(
                <tr key={p.id+":ops"} className="ops-expand-row">
                  <td colSpan={8}>
                    <div className="ops-expand-body">
                      {p.stocked
                        ? <div className="ops-purchased-note"><Package size={12}/> Purchased part — no in-house machining.</div>
                        : <>
                            <StockPanel part={p} qty={partQty(p, asmQty)} onChange={(patch)=>stableUpdate(p.id, patch)}/>
                            <OperationsEditor part={p} qty={partQty(p, asmQty)} onChange={(patch)=>stableUpdate(p.id, patch)}/>
                          </>
                      }
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

/* ===========================================================
   DFM panel
   =========================================================== */

const DfmPanel = memo(function DfmPanel({ parts, onSelectPart, asmQty, onAcceptIssue }: {
  parts:Part[];
  onSelectPart:(id:string)=>void;
  asmQty:number;
  onAcceptIssue:(issue:DfmUiIssue)=>void;
}) {
  const dismissedIds = new Set(
    parts.flatMap(p => ((p as PartWithDfm).dfmIssues ?? []).filter(i => i.isDismissed).map(i => i.id)).filter(Boolean) as string[],
  );
  const savedIssues: DfmUiIssue[] = parts.flatMap(p => ((p as PartWithDfm).dfmIssues ?? []).map(i => ({
    id: i.id ?? `${p.id}-${i.title}`,
    partId: i.partId || p.id,
    severity: i.severity,
    title: i.title,
    desc: i.description ?? "",
    impact: i.impactCost ?? 0,
    suggest: i.suggestion ?? "",
    actionable: i.isActionable ?? false,
    isDismissed: i.isDismissed,
  }))).filter(i => !i.isDismissed);
  const dynamicIssues: DfmUiIssue[] = [];
  parts.forEach(p=>{
    if (!p.included||p.stocked||!p.stock) return;
    const util=stockUtilization(p);
    if (util!=null&&util<0.25) {
      const sm=stockMassKg(p.stock,p.material), waste=Math.max(0,sm-p.mass), rate=getMaterialRate(p.material,p.stock?.shape), impact=Math.round(waste*rate*partQty(p,asmQty));
      dynamicIssues.push({id:`dfm-util-${p.id}`,partId:p.id,severity:util<0.15?"error":"warn",title:`Low stock utilization · ${(util*100).toFixed(0)}%`,desc:`Chip waste ${waste.toFixed(3)} kg per part. Consider smaller stock or near-net shape.`,impact,suggest:"Resize stock to net + 4 mm finishing allowance",actionable:true});
    }
  });
  const savedIds = new Set(savedIssues.map(i => i.id));
  const partIds = new Set(parts.map(p => p.id));
  const seededIssues = DFM_ISSUES.filter(i => partIds.has(i.partId));
  const allIssues=[...savedIssues,...dynamicIssues,...seededIssues]
    .filter(i => !dismissedIds.has(i.id))
    .filter((i, index, rows) => savedIds.has(i.id) || rows.findIndex(row => row.id === i.id) === index);
  const totalImpact=allIssues.reduce((a,i)=>a+(i.impact||0),0);
  const counts=allIssues.reduce((a,i)=>({...a,[i.severity]:(a[i.severity as keyof typeof a]||0)+1}),{error:0,warn:0,info:0});
  const partName=(id:string)=>parts.find(p=>p.id===id)?.name||id;
  return (
    <div className="panel dfm-panel">
      <div className="panel-head">
        <span className="title">DFM review</span>
        <span className="sub">{allIssues.length} flagged · est. cost impact {fmtINR0(totalImpact)}</span>
        <div className="right">
          <span className="dfm-summary">
            {counts.error>0&&<span className="chip danger" style={{height:22}}><span className="dot"/>{counts.error} blocker</span>}
            {counts.warn>0&&<span className="chip warning" style={{height:22}}><span className="dot"/>{counts.warn} caution</span>}
            {counts.info>0&&<span className="chip accent" style={{height:22}}><span className="dot"/>{counts.info} info</span>}
          </span>
          <button className="btn sm ghost"><Settings2 size={12}/> Rules</button>
        </div>
      </div>
      {allIssues.length===0?(
        <div className="dfm-empty"><div className="ic-wrap"><ShieldCheck size={18}/></div><div>No design issues flagged. Geometry is within manufacturing limits.</div></div>
      ):(
        <div className="dfm-list">
          {allIssues.map(i=>{
            const SevIcon=i.severity==="error"?OctagonX:i.severity==="warn"?TriangleAlert:Info;
            return (
              <div className="dfm-row" key={i.id}>
                <div className={`dfm-sev ${i.severity}`}><SevIcon size={14} strokeWidth={2}/></div>
                <div className="dfm-body">
                  <div className="dfm-title"><span>{i.title}</span><button className="partref" onClick={()=>onSelectPart(i.partId)}>{partName(i.partId)}</button></div>
                  <div className="dfm-desc">{i.desc}</div>
                  <div className="dfm-suggest"><Lightbulb size={11}/> {i.suggest}</div>
                </div>
                <div className="dfm-impact"><span className="label">Cost impact</span>+{fmtINR0(i.impact)}</div>
                <div className="dfm-actions">{i.actionable&&<button className="btn sm">Apply fix</button>}<button className="btn sm ghost" onClick={()=>onAcceptIssue(i)}>Accept</button></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ===========================================================
   Lead time bar
   =========================================================== */

function LeadTimeBar({ lead }: { lead:ReturnType<typeof computeLeadTime> }) {
  const segs=[
    {k:"Queue",     v:lead.queue,   c:"#b9c1c9"},
    {k:"Machining", v:lead.machine, c:"#5d80c9"},
    {k:"Finishing", v:lead.finish,  c:"#c9b48f"},
    {k:"Ship",      v:lead.ship,    c:"#9fb6a4"},
  ];
  return (
    <div className="leadtime">
      <div className="lt-head">
        <div className="ship-by"><Truck size={13}/> Ship by {fmtShipDate(lead.shipDate)}</div>
        <div className="days">{lead.total} working days</div>
      </div>
      <div className="lt-bar">{segs.map(s=><span key={s.k} style={{width:`${(s.v/lead.total)*100}%`,background:s.c}}/>)}</div>
      <div className="lt-stages">{segs.map(s=><div className="lt-stage" key={s.k}><span className="swatch" style={{background:s.c}}/><span className="label">{s.k}</span><span className="val">{s.v}d</span></div>)}</div>
    </div>
  );
}

/* ===========================================================
   Quantity breaks
   =========================================================== */

const QTY_BREAKS=[1,10,25,100,250];

function QuantityBreaks({ parts, asmQty, setAsmQty, commercial }: { parts:Part[]; asmQty:number; setAsmQty:(v:number)=>void; commercial:{marginPct:number;taxPct:number} }) {
  const breaks=buildQuantityBreaks(parts, commercial, MATERIAL_COSTS, MACHINE_COSTS, QTY_BREAKS);
  const baseUnit=breaks[0].unit;
  const currentUnit=asmQty>0?rollup(parts,asmQty,commercial).total/asmQty:0;
  const bestSavings=currentUnit>0?((baseUnit-currentUnit)/baseUnit)*100:0;
  return (
    <div className="qty-breaks">
      <div className="head"><span className="eyebrow">Quantity breaks</span>{bestSavings>0&&<span className="savings">{fmtPct(-bestSavings)} vs qty 1</span>}</div>
      <div className="qty-breaks-grid">
        {breaks.map(b=>{
          const delta=baseUnit>0?((b.unit-baseUnit)/baseUnit)*100:0;
          return (
            <div key={b.q} className={`qty-break ${b.q===asmQty?"active":""}`} onClick={()=>setAsmQty(b.q)}>
              <div className="qty-val">{b.q}×</div>
              <div className="qty-unit">{fmtINR0(b.unit)}</div>
              {b.q>1&&<div className="qty-delta">{fmtPct(delta)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===========================================================
   RFQ Rail
   =========================================================== */

function Field({ label, value, unit, type="text", onChange, grid }: { label:string; value:string|number; unit?:string; type?:string; onChange?:(v:string|number)=>void; grid?:string }) {
  const inputId = useId();
  return (
    <div className="field" style={grid?{gridColumn:grid}:undefined}>
      <label htmlFor={inputId}>{label}</label>
      <div className={unit?"suffix":undefined}>
        <input id={inputId} name={inputId} type={type} value={value} onChange={e=>onChange?.(type==="number"?+e.target.value||0:e.target.value)} className={type==="number"?"num":undefined} style={unit?{paddingRight:38}:undefined}/>
        {unit&&<span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "created": return "Quote created";
    case "updated": return "Quote updated";
    case "dfm_resolved": return "DFM issue accepted";
    case "note_added": return "Note saved";
    case "revision_created": return "Revision created";
    case "status_changed": return "Status changed";
    case "sent": return "Quote sent";
    case "viewed": return "Quote viewed";
    default: return eventType.replace(/_/g, " ");
  }
}

function formatEventMeta(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  if (typeof payload.title === "string") return payload.title;
  if (typeof payload.partCount === "number") return `${payload.partCount} parts`;
  if (typeof payload.from === "string" && typeof payload.to === "string") return `${payload.from} to ${payload.to}`;
  return "";
}

function RfqRail({ parts, asmQty, setAsmQty, commercial, setCommercial }: {
  parts:Part[];
  asmQty:number; setAsmQty:(v:number)=>void;
  commercial:{marginPct:number;taxPct:number}; setCommercial:(v:{marginPct:number;taxPct:number})=>void;
}) {
  const { id } = useParams<{ id: string }>();
  const {
    rfq,
    setRfq,
    quoteEvents,
    persistenceStatus,
    persistenceError,
    lastSavedAt,
    saveQuote,
    clearPersistenceError,
  } = useQuoteState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"inputs"|"history"|"notes">("inputs");
  const r=rollup(parts,asmQty,commercial);
  const totalQty=parts.filter(p=>p.included).reduce((a,p)=>a+partQty(p,asmQty),0);
  const lead=computeLeadTime(parts,asmQty);
  const unit=asmQty>0?r.total/asmQty:0;
  const isSaving = persistenceStatus === "saving";
  const savedText = lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved";

  async function handleSave() {
    try {
      const savedId = await saveQuote();
      if (!id || id !== savedId) navigate(`/quotes/${savedId}`, { replace: true });
    } catch {
      // Error state is owned by QuoteStateContext and rendered below.
    }
  }

  async function handleExportPdf() {
    try {
      const pdf = await exportQuotationPdf(exportCalculationFromQuote({ rfq, parts, asmQty, commercial }));
      if (!pdf.ok) throw new Error(pdf.reason);
      downloadBytes(pdf.fileName, pdf.bytes, pdf.mimeType);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to export PDF.");
    }
  }

  return (
    <div className="panel rfq-panel">
      <div className="panel-head">
        <span className="title">{rfq.rfqRef || id || "RFQ"}</span>
        {rfq.customer && <div className="right"><span className="chip"><BoxesIcon size={11}/> {rfq.customer}</span></div>}
      </div>
      <div className="tabstrip">
        <button className={tab==="inputs"?"on":""} onClick={()=>setTab("inputs")}><Sliders size={13}/> Inputs</button>
        <button className={tab==="history"?"on":""} onClick={()=>setTab("history")}><Clock size={13}/> History</button>
        <button className={tab==="notes"?"on":""} onClick={()=>setTab("notes")}><ScanLine size={13}/> Notes</button>
      </div>
      <div style={{flex:1,minHeight:0,overflow:"auto",display:"flex",flexDirection:"column"}}>
        {tab==="inputs"&&(
          <>
<div className="rfq-fields">
              <Field label="Customer" value={rfq.customer} grid="1/-1" onChange={v=>setRfq({...rfq, customer:String(v)})}/>
              <Field label="Project" value={rfq.project} onChange={v=>setRfq({...rfq, project:String(v)})}/>
              <Field label="RFQ ref" value={rfq.rfqRef} onChange={v=>setRfq({...rfq, rfqRef:String(v)})}/>
            </div>
            <div className="rfq-fields" style={{paddingTop:8}}>
              <div className="full"><div className="eyebrow">Commercial · whole quote</div></div>
              <Field label="Margin" value={commercial.marginPct} type="number" unit="%" onChange={v=>setCommercial({...commercial,marginPct:v as number})}/>
              <Field label="Tax" value={commercial.taxPct} type="number" unit="%" onChange={v=>setCommercial({...commercial,taxPct:v as number})}/>
            </div>
            <div className="asm-qty-row" style={{marginTop:10}}>
              <span className="lbl">Assembly qty</span>
              <span className="muted" style={{fontSize:10.5,fontFamily:"var(--font-mono)"}}>{totalQty} parts total</span>
              <input type="number" min="1" aria-label="Assembly quantity" value={asmQty} onChange={e=>setAsmQty(Math.max(1,+e.target.value||1))}/>
            </div>
            <QuantityBreaks parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial}/>
            <LeadTimeBar lead={lead}/>
            <div style={{height:10}}/>
</>
        )}
        {tab==="history"&&(
          <div className="recents">
            {quoteEvents.length>0 ? quoteEvents.map((event,i)=>(
              <div key={event.id} className="recent" style={i===0?{background:"var(--accent-soft)"}:undefined}>
                <div className="name">{eventLabel(event.eventType)}</div><div className="amt">{fmtINR(r.total)}</div>
                <div className="meta">{formatEventMeta(event.payload)}</div><div className="date">{new Date(event.createdAt).toLocaleDateString()}</div>
              </div>
            )) : <div className="dfm-empty">No saved history yet.</div>}
          </div>
        )}
        {tab==="notes"&&(
          <div style={{padding:14}}>
            <textarea rows={10} aria-label="Quote notes" value={rfq.notes} onChange={e=>setRfq({...rfq, notes:e.target.value})} style={{width:"100%",padding:10,resize:"none",background:"var(--panel-2)",border:"1px solid var(--border)",borderRadius:6,fontFamily:"var(--font-sans)",fontSize:12.5,color:"var(--text-1)",outline:0}}/>
          </div>
        )}
      </div>
      {persistenceError && (
        <div className="quote-error-banner">
          <TriangleAlert size={14}/>
          <span>{persistenceError}</span>
          <button type="button" onClick={clearPersistenceError} title="Dismiss error"><X size={14}/></button>
        </div>
      )}
      <div className="total-panel big">
        <div className="total-row">
          <span className="label">Quotation total</span>
          <span className={`chip ${persistenceStatus === "error" ? "" : "success"}`}>
            <span className="dot"/>
            {isSaving ? "Saving..." : persistenceStatus === "saved" ? savedText : "Draft"}
          </span>
        </div>
        <div className="duo">
          <div className="cell"><div className="label">Total</div><div className="value">{fmtINR(r.total)}</div><div className="sub">{asmQty} assemblies</div></div>
          <div className="cell right"><div className="label">Per unit</div><div className="value">{fmtINR(unit)}</div><div className="sub">incl. {commercial.marginPct}% margin</div></div>
        </div>
        <div className="total-actions">
          <button className="btn block primary" onClick={handleExportPdf}><FileDown size={14}/> Export PDF</button>
          <button className="btn block" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Clock size={14}/> : persistenceStatus === "saved" ? <Check size={14}/> : <Save size={14}/>}
            {isSaving ? "Saving" : persistenceStatus === "saved" ? "Saved" : "Save"}
          </button>
          <button className="btn" title="Send"><Send size={14}/></button>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Cost panel (memoized — doesn't depend on selection)
   =========================================================== */

const CostPanel = memo(function CostPanel({ parts, asmQty, commercial }: {
  parts: Part[]; asmQty: number; commercial: { marginPct: number; taxPct: number };
}) {
  const r = rollup(parts, asmQty, commercial);

  const cat = { material: 0, machine: 0, setup: 0, finish: 0 };
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    cat.material += partMaterialCost(p, asmQty);
    cat.finish += partFinishCost(p, asmQty);
    (p.operations || []).forEach(op => {
      const rate = opRate(op);
      cat.setup += (op.setupMin / 60) * rate;
      cat.machine += (op.cycleMin / 60) * rate * qty;
    });
  });

  const machineBreakdown: Record<string, { cost: number; mins: number }> = {};
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    (p.operations || []).forEach(op => {
      const rate = opRate(op);
      const cost = (op.setupMin / 60) * rate + (op.cycleMin / 60) * rate * qty;
      const mins = op.setupMin + op.cycleMin * qty;
      machineBreakdown[op.machine] = machineBreakdown[op.machine] || { cost: 0, mins: 0 };
      machineBreakdown[op.machine].cost += cost;
      machineBreakdown[op.machine].mins += mins;
    });
  });
  const machineRows = Object.entries(machineBreakdown).sort((a, b) => b[1].cost - a[1].cost);

  const segs = [
    { k: "Material",   v: cat.material, c: "#5d80c9" },
    { k: "Machining",  v: cat.machine,  c: "#7b95c0" },
    { k: "Setup",      v: cat.setup,    c: "#9aabc7" },
    { k: "Finishing",  v: cat.finish,   c: "#c9b48f" },
    { k: "Tooling",    v: r.tooling,    c: "#c7c2b4" },
    { k: "Inspection", v: r.inspection, c: "#9fb6a4" },
    { k: "Margin",     v: r.margin,     c: "#5fa05f" },
  ];
  const segsTotal = segs.reduce((a, s) => a + s.v, 0) || 1;

  return (
    <div className="panel cost-panel">
      <div className="panel-head">
        <span className="title">Cost breakdown</span>
        <span className="sub">Subtotal {fmtINR(r.subtotal)} · Margin {fmtINR(r.margin)}</span>
        <div className="right">
          <button className="btn sm ghost"><Copy size={12}/> Duplicate</button>
          <button className="btn sm ghost"><Settings2 size={12}/> Rate card</button>
        </div>
      </div>
      <div className="margin-bar">{segs.map(s => <span key={s.k} style={{width:`${(s.v/segsTotal)*100}%`,background:s.c}}/>)}</div>
      <div className="margin-legend">{segs.map(s => <span key={s.k}><span className="dot" style={{background:s.c}}/>{s.k}<span className="v">{fmtINR(s.v)}</span></span>)}</div>
      <div className="cost-grid">
        <div className="cost-row left"><span className="k">Parts subtotal</span><span className="v">{fmtINR(r.partsCost)}</span></div>
        <div className="cost-row right"><span className="k">Tooling · amortized</span><span className="v">{fmtINR(r.tooling)}</span></div>
        <div className="cost-row left"><span className="k">Inspection · batch</span><span className="v">{fmtINR(r.inspection)}</span></div>
        <div className="cost-row right"><span className="k">Margin · {commercial.marginPct}%</span><span className="v">{fmtINR(r.margin)}</span></div>
        <div className="cost-row left total"><span className="k">Subtotal</span><span className="v">{fmtINR(r.subtotal)}</span></div>
        <div className="cost-row right total"><span className="k">Quotation total</span><span className="v">{fmtINR(r.total)}</span></div>
      </div>
      {machineRows.length > 0 && (
        <>
          <div style={{padding:"10px 14px 4px",borderTop:"1px solid var(--divider)"}}><div className="eyebrow">Machine utilization</div></div>
          <div style={{padding:"0 14px 16px"}}>
            {machineRows.map(([m, info]) => {
              const pct = r.partsCost > 0 ? (info.cost / r.partsCost) * 100 : 0;
              return (
                <div key={m} style={{display:"grid",gridTemplateColumns:"120px 1fr 80px 80px",alignItems:"center",gap:10,padding:"6px 0",fontSize:12}}>
                  <span style={{color:"var(--text-2)"}}>{MACHINES[m]?.label || m}</span>
                  <div style={{height:6,background:"var(--panel-3)",borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:"var(--accent)"}}/></div>
                  <span className="mono muted" style={{textAlign:"right",fontSize:11}}>{fmtMin(info.mins)} min</span>
                  <span className="mono" style={{textAlign:"right",fontSize:12}}>{fmtINR(info.cost)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

/* ===========================================================
   Quote workspace
   =========================================================== */

function ConfirmReplaceModal({ existingCount, incomingCount, fileName, onReplace, onCancel }: {
  existingCount: number; incomingCount: number; fileName: string;
  onReplace: () => void; onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon"><TriangleAlert size={20} /></div>
        <p className="confirm-msg">
          Replace {existingCount} configured {existingCount === 1 ? "part" : "parts"} with {incomingCount}{" "}
          {incomingCount === 1 ? "body" : "bodies"} from <strong>{fileName}</strong>?
          This will clear materials, stock and operations you've set.
        </p>
        <div className="confirm-actions">
          <button className="btn sm" onClick={onCancel}>Cancel</button>
          <button className="btn sm danger" onClick={onReplace}>Replace</button>
        </div>
      </div>
    </div>
  );
}

function QuoteWorkspace({ searchQuery, onOpenViewer }: { searchQuery:string; onOpenViewer:()=>void }) {
  const { cad, pendingHandoff, consumeHandoff } = useCad();
  const { parts, setParts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, quoteId, saveQuote } = useQuoteState();
  const [showAll, setShowAll] = useState(false);
  const [confirmHandoff, setConfirmHandoff] = useState<{ incomingCount: number; fileName: string } | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("quote.previewCollapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("quote.previewCollapsed", previewCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [previewCollapsed]);
  useCatalogVersion();
  useEffect(() => {
    loadCatalog();
    const onFocus = () => loadCatalog();
    const onVisible = () => { if (document.visibilityState === "visible") loadCatalog(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!pendingHandoff || !cad) return;
    if (parts.length === 0) {
      const imported = cadResultToParts(consumeHandoff()!);
      setParts(imported);
      setSelectedId(imported[0]?.id ?? null);
      void saveQuote({ parts: imported }).catch(() => {
        // Persistence errors are rendered by the quote state owner.
      });
    } else {
      setConfirmHandoff({ incomingCount: cad.meshes.length, fileName: cad.fileName });
    }
  }, [pendingHandoff]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptDfmIssue = useCallback((issue: DfmUiIssue) => {
    setParts(current => current.map(part => {
      if (part.id !== issue.partId) return part;
      const partWithDfm = part as PartWithDfm;
      const existing = partWithDfm.dfmIssues ?? [];
      const nextIssues = existing.some(row => row.id === issue.id)
        ? existing.map(row => row.id === issue.id ? { ...row, isDismissed: true } : row)
        : [...existing, {
            id: issue.id,
            partId: issue.partId,
            severity: issue.severity,
            title: issue.title,
            description: issue.desc,
            impactCost: issue.impact,
            suggestion: issue.suggest,
            isActionable: issue.actionable,
            isDismissed: true,
          }];
      return { ...part, dfmIssues: nextIssues } as Part;
    }));
    if (quoteId) {
      void dismissDfmIssue(issue.id);
      void logQuoteEvent({
        quoteId,
        eventType: "dfm_resolved",
        payload: { issueId: issue.id, partId: issue.partId, title: issue.title },
      });
    }
  }, [quoteId, setParts]);

  return (
    <>
    <div className="quote-grid">
      <div className="right-col">
        <div className={`panel preview-panel ${previewCollapsed ? "collapsed" : ""}`}>
          <div
            className={`panel-head ${previewCollapsed ? "preview-head-collapsed" : ""}`}
            onClick={previewCollapsed ? () => setPreviewCollapsed(false) : undefined}
            style={previewCollapsed ? { cursor: "pointer" } : undefined}
            title={previewCollapsed ? "Click to expand preview" : undefined}
          >
            <button
              className="preview-collapse-toggle"
              onClick={e => { e.stopPropagation(); setPreviewCollapsed(v => !v); }}
              title={previewCollapsed ? "Expand preview" : "Collapse preview"}
              aria-expanded={!previewCollapsed}
            >
              {previewCollapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
            </button>
            <Box size={13} style={{ color: "var(--accent)", flexShrink: 0 }}/>
            <span className="title">Preview</span>
            {previewCollapsed && (() => {
              const sel = parts.find(p => p.id === selectedId);
              return sel
                ? <span className="preview-sel-chip"><span className="swatch" style={{ background: sel.color }}/>{sel.name}</span>
                : <span className="muted" style={{ fontSize: 11, color: "var(--text-3)" }}>click to view</span>;
            })()}
            <div className="right" style={{ gap: 6 }}>
              {cad && !previewCollapsed && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  title={showAll ? "Show only the selected part" : "Show the full assembly"}
                  style={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 5,
                    border: "1px solid var(--accent)",
                    background: showAll ? "var(--accent)" : "var(--panel)",
                    color: showAll ? "#fff" : "var(--accent)",
                  }}
                >
                  {showAll ? <><Square size={11}/> Isolate</> : <><Boxes size={11}/> Full assembly</>}
                </button>
              )}
              <button className="btn sm ghost" onClick={onOpenViewer} title="Open in full viewer"><ExternalLink size={12}/></button>
            </div>
          </div>
          {!previewCollapsed && (cad
            ? <QuoteCadPreview
                model={cad}
                selectedId={selectedId}
                selectedMeshIds={(() => {
                  const p = parts.find(p => p.id === selectedId);
                  return p?.meshIds ?? (selectedId ? [selectedId] : []);
                })()}
                showAll={showAll}/>
            : <QuotePreview parts={parts} selectedId={selectedId} onSelect={setSelectedId}/>)}
        </div>
        <RfqRail parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial} setCommercial={setCommercial}/>
      </div>
      <PartsTable parts={parts} setParts={setParts} asmQty={asmQty} selectedId={selectedId} onSelect={setSelectedId} searchQuery={searchQuery}/>
      <DfmPanel parts={parts} onSelectPart={setSelectedId} asmQty={asmQty} onAcceptIssue={acceptDfmIssue}/>

      <CostPanel parts={parts} asmQty={asmQty} commercial={commercial}/>
    </div>
    {confirmHandoff && cad && (
      <ConfirmReplaceModal
        existingCount={parts.length}
        incomingCount={confirmHandoff.incomingCount}
        fileName={confirmHandoff.fileName}
        onReplace={() => {
          const imported = cadResultToParts(consumeHandoff()!);
          setParts(imported);
          setSelectedId(imported[0]?.id ?? null);
          void saveQuote({ parts: imported }).catch(() => {
            // Persistence errors are rendered by the quote state owner.
          });
          setConfirmHandoff(null);
        }}
        onCancel={() => {
          consumeHandoff();
          setConfirmHandoff(null);
        }}
      />
    )}
    </>
  );
}

/* ===========================================================
   Quote detail page
   =========================================================== */

declare global {
  interface Window {
    __focusGlobalSearch?: () => void;
  }
}

export function QuoteDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { cad } = useCad();
  const { rfq, quoteId, persistenceStatus, persistenceError, loadQuote, clearPersistenceError } = useQuoteState();
  const searchQuery = "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag==="input"||tag==="textarea"||tag==="select"||(e.target as HTMLElement)?.isContentEditable;
      if (e.key==="/"&&!inField) { e.preventDefault(); window.__focusGlobalSearch?.(); return; }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!id || id === quoteId) return;
    if (quoteId && persistenceStatus === "saved") return;
    loadQuote(id);
  }, [id, loadQuote, persistenceStatus, quoteId]);

  useEffect(() => {
    if (!id || !quoteId || id === quoteId || persistenceStatus !== "saved") return;
    navigate(`/quotes/${quoteId}`, { replace: true });
  }, [id, navigate, persistenceStatus, quoteId]);

  const cadName = cad?.fileName?.replace(/\.[^.]+$/, "") ?? "";
  const title = rfq.project || cadName || "Untitled quote";
  const subText = persistenceStatus === "loading"
    ? "Loading saved quote"
    : persistenceStatus === "saving"
      ? "Saving quote"
      : quoteId
        ? "Saved draft"
        : `Unsaved draft${searchQuery?` · filter: "${searchQuery}"`:""}`;
  const quoteRef = rfq.rfqRef || id || "";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Quote · {title}</h1>
          <div className={`page-sub ${persistenceStatus === "loading" || persistenceStatus === "saving" ? "busy" : ""}`}>
            <span className="status-dot"/>
            <span>{subText}</span>
            {quoteRef && <>
              <span style={{color:"var(--text-4)"}}>•</span>
              <span className="quote-num">{quoteRef}</span>
            </>}
          </div>
        </div>
      </div>
      {persistenceError && (
        <div className="quote-page-error">
          <TriangleAlert size={14}/>
          <span>{persistenceError}</span>
          <button type="button" onClick={clearPersistenceError} title="Dismiss error"><X size={14}/></button>
        </div>
      )}
      <QuoteWorkspace searchQuery={searchQuery} onOpenViewer={() => navigate("/viewer")} />
    </div>
  );
}
