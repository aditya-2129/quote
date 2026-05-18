import {
  memo,
  useCallback,
  useState,
  useEffect,
  useId,
  useMemo,
  useRef,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { useCad } from "@context/CadContext";
import { useQuoteState } from "@context/QuoteStateContext";
import { cadResultToParts } from "@utils/cadHandoff";
import type { Bop, ExtraCost, Part, Op, Stock } from "@utils/quoteTypes";
import { exportQuotationPdf, type QuotationData, type QuotationLineItem } from "@utils/export";
import pacificIndiaLogoUrl from "../assets/pacific-india-logo.jpg";
import { BopModal, type BopModalData } from "@components/BopModal";
import { QuotePreviewViewer, type QuotePreviewViewerHandle } from "@components/QuotePreviewViewer";
import type { CadImportResult } from "@utils/index";
import {
  Box,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cog,
  ExternalLink,
  FileText,
  Layers,
  Package,
  Percent,
  Plus,
  Save,
  ScanLine,
  Search,
  Send,
  Sliders,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { createBopCatalog, createCustomer, getAllBopCatalog, getAllCustomers, getAllMaterials, getAllMachines, getCustomerById } from "../db/queries";
import type { BopCatalogItem, Customer } from "../db/schema";
import {
  buildMachineCatalog,
  buildMaterialCatalog,
  calculateQuoteRollup,
  effectivePartRate,
  operationCost as calculateOperationCost,
  operationMinutes as calculateOperationMinutes,
  operationRate as calculateOperationRate,
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

type MaterialMeta = { label: string; density: number; hex: string; grade: string; forms: string[]; rates: Record<string, number>; isPurchased: boolean; isActive: boolean };
type MachineMeta  = { label: string; rate: number; short: string };
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
    const [mats, machs] = await Promise.all([getAllMaterials(false), getAllMachines(false)]);
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
        isActive: m.isActive,
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

const opId = () => `op-${crypto.randomUUID()}`;


/* ===========================================================
   Costing utilities
   =========================================================== */

// Effective per-kg rate for a part: per-quote override wins, otherwise falls back to the material library.
function partRate(p: Part): number {
  return effectivePartRate(p, MATERIAL_COSTS);
}
function materialLabel(materialId: string): string {
  return MATERIALS[materialId]?.label || "Unknown material";
}
function partMaterialLabel(part: Part): string {
  return part.materialLabelSnapshot?.trim() || (part.material ? materialLabel(part.material) : "—");
}

function stockMassKg(stock: Stock|null, materialId: string): number {
  return calculateStockMassKg(stock, materialId, MATERIAL_COSTS);
}

// Net (machined) part mass — derived from CAD volume × current material density.
// Falls back to a stored `mass` value if no geometry is available (e.g. manually added parts).
function partNetMassKg(p: Part): number {
  return calculatePartNetMassKg(p, MATERIAL_COSTS);
}

const partQty = (p: Part, asmQty: number) => partQuantity(p, asmQty);

function opRate(op: Op): number {
  return calculateOperationRate(op, MACHINE_COSTS);
}
function opCost(op: Op, qty: number): number {
  return calculateOperationCost(op, qty, MACHINE_COSTS);
}
function opMinutes(op: Op, qty: number): number { return calculateOperationMinutes(op, qty); }
function machineLabel(machineId: string): string {
  return MACHINES[machineId]?.label || "Unknown machine";
}
function machineShortLabel(machineId: string): string {
  return MACHINES[machineId]?.short || MACHINES[machineId]?.label || "Unknown";
}
function opMachineLabel(op: Op): string {
  return op.machineLabelSnapshot?.trim() || (op.machine ? machineLabel(op.machine) : "—");
}
function opMachineShortLabel(op: Op): string {
  return op.machineLabelSnapshot?.trim() || (op.machine ? machineShortLabel(op.machine) : "—");
}

function partMachineCost(p: Part, asmQty: number): number {
  return calculatePartSetupCost(p, MACHINE_COSTS) + calculatePartMachineCost(p, asmQty, MACHINE_COSTS);
}
function partMaterialCost(p: Part, asmQty: number): number {
  return calculatePartMaterialCost(p, asmQty, MATERIAL_COSTS);
}
function partSubtotal(p: Part, asmQty: number): number {
  return calculatePartSubtotal(p, asmQty, MATERIAL_COSTS, MACHINE_COSTS);
}

function rollup(
  parts: Part[],
  asmQty: number,
  commercial: { marginPct:number; taxPct:number },
  bops: Array<{ qtyPerAssembly: number; unitCost: number }> = [],
  extraCosts: Array<{ amount: number }> = [],
) {
  // Apply per-batch tooling/inspection only after a part has real configured
  // cost (material + ops) — or there are BOPs to price. Otherwise an
  // empty/just-added part would show overhead totals like ₹672 even when its
  // own material/machining is ₹0.
  const probe = calculateQuoteRollup(parts, asmQty, commercial, MATERIAL_COSTS, MACHINE_COSTS, {
    toolingCost: 0, inspectionCost: 0, bops, extraCosts,
  });
  if (probe.partsCost <= 0 && probe.bopCost <= 0) return probe;
  return calculateQuoteRollup(parts, asmQty, commercial, MATERIAL_COSTS, MACHINE_COSTS, {
    toolingCost: 0, inspectionCost: 0,
    bops, extraCosts,
  });
}

function fmtINR(n: number) { return "₹"+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtMin(n: number) { return n.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:1}); }

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

function isTauriRuntime(): boolean {
  const g = globalThis as typeof globalThis & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(g.__TAURI__ || g.__TAURI_INTERNALS__);
}

// Returns true if the file was saved (or a fallback download triggered),
// false if the user cancelled the save dialog.
async function downloadBytes(fileName: string, bytes: Uint8Array, mimeType: string): Promise<boolean> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const extLabel = ext === "pdf" ? "PDF Document" : ext.toUpperCase() || "File";

  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({
      title: "Save quotation",
      defaultPath: fileName,
      filters: ext ? [{ name: extLabel, extensions: [ext] }] : undefined,
    });
    if (!filePath) return false;
    await writeFile(filePath, bytes);
    return true;
  }

  // Browser fallback — use the File System Access API when available so the
  // user still gets a save-as dialog instead of a silent Downloads dump.
  const picker = (window as Window & { showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: ext ? [{ description: extLabel, accept: { [mimeType]: [`.${ext}`] } }] : undefined,
      });
      const writable = await (handle as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable();
      await writable.write(new Uint8Array(bytes).buffer as ArrayBuffer);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
  }

  // Last-resort fallback for browsers without showSaveFilePicker: native auto-download.
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Issuing-company info shown on the quotation. Replace with real values when the
// app gains a settings screen; this is the only place to edit branding today.
const COMPANY_INFO = {
  name: "PACIFIC INDIA VENTURE",
  addressLines: ["Tapkir Plaza, Nigdi, PCMC, Pune 411044"],
  phone: "9527352858",
  email: "pacificindia.pcmcpune@gmail.com",
  gstn: "27AAKPF1080D1Z4",
  state: "Maharashtra",
  stateCode: "27",
  tagline: "Manufacturing & Supply of SPM, Precision Tools, Die & Components",
  contactPerson: "N. CHANDRA",
  contactPhone: "9527352858",
  contactEmail: "pacificindia.pcmcpune@gmail.com",
};

const QUOTATION_TERMS = [
  "E. & O.E.",
  "Delivery Period: As mention on PO from the order date and advance.",
  "Payment Terms: As mutually agreed and finalized with the company.",
  "Taxes & Duties: GST @ 18% extra as applicable.",
  "Freight: Charged extra at actuals.",
];

// Cache the logo bytes after the first fetch so subsequent exports are instant.
let _logoBytesCache: Uint8Array | null = null;
async function loadCompanyLogoBytes(): Promise<Uint8Array | null> {
  if (_logoBytesCache) return _logoBytesCache;
  try {
    const response = await fetch(pacificIndiaLogoUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    _logoBytesCache = new Uint8Array(buffer);
    return _logoBytesCache;
  } catch {
    return null;
  }
}

// Convert a "data:image/png;base64,..." dataURL (e.g. from a canvas snapshot)
// to raw bytes for pdf-lib's embedPng. Returns null for falsy/invalid input.
function dataUrlToBytes(dataUrl: string | null): Uint8Array | null {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const b64 = dataUrl.slice(comma + 1);
  try {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function fmtQuotationDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function buildQuotationData(args: {
  rfq: { customer: string; customerId: string | null; project: string; rfqRef: string; notes: string };
  parts: Part[];
  bops: Bop[];
  extraCosts: ExtraCost[];
  asmQty: number;
  commercial: { marginPct: number; taxPct: number };
  quoteNumber: string | null;
  /** Full customer record from DB; when present, fills the "To" block with address, phone, email, and contact name. */
  customerRecord?: Customer | null;
}): QuotationData {
  const included = args.parts.filter(p => p.included);
  const totals = rollup(args.parts, args.asmQty, args.commercial, args.bops, args.extraCosts);
  const grandTotal = Math.round(totals.total);

  // Page 1 is a single rolled-up line — the customer sees one job priced at
  // the grand total. Per-part / BOP / extra-cost detail lives on pages 2-4.
  // Qty maps to the assembly count; unit becomes "Set" when >1, else "Nos".
  const asmQty = Math.max(1, args.asmQty);
  const unitPrice = grandTotal / asmQty;
  const projectName = args.rfq.project?.trim() || args.quoteNumber || "Job Work";
  const items: QuotationLineItem[] = [{
    partNumber: projectName,
    description: "(Complete set as per model provided, Precision finished & work suitable)",
    materialNote: "Job Material – As required",
    qty: asmQty,
    unit: asmQty > 1 ? "Set" : "Nos",
    unitPrice,
    totalPrice: grandTotal,
  }];

  const refLabel = args.quoteNumber || args.rfq.rfqRef || "DRAFT";

  // Build the "To" block address lines from the customer DB record when we
  // have it. Falls back to "—" only when we have absolutely nothing — never
  // use the project name as the address (that's a separate field, not the
  // customer's location).
  const cust = args.customerRecord;
  const customerName = cust?.company?.trim() || args.rfq.customer?.trim() || cust?.name?.trim() || "—";
  const customerLines: string[] = [];
  if (cust?.address?.trim()) {
    // Address often arrives as a single multi-line text blob — split on
    // newlines or commas to render as separate lines in the bill-to block.
    const addr = cust.address.trim();
    const parts = addr.includes("\n") ? addr.split(/\r?\n/) : addr.split(",");
    for (const p of parts) {
      const line = p.trim();
      if (line) customerLines.push(line);
    }
  }
  // Contact person (the `name` field in the customer record) only when it
  // differs from the company name — otherwise it's redundant noise.
  if (cust?.name?.trim() && cust.name.trim() !== customerName) {
    customerLines.push(`Kind Attn: ${cust.name.trim()}`);
  }
  const contactBits: string[] = [];
  if (cust?.phone?.trim()) contactBits.push(`Phone: ${cust.phone.trim()}`);
  if (cust?.email?.trim()) contactBits.push(`Email: ${cust.email.trim()}`);
  customerLines.push(...contactBits);
  if (customerLines.length === 0) customerLines.push("—");

  // Page 2: per-part materials. Only included && non-purchased parts — a
  // purchased part has no stock/material relationship to print. We strip the
  // "· ID X" trailer that fmtStockDims appends for hollow round stock — the
  // inner diameter is a manufacturing detail the customer doesn't need on the
  // quotation, and it surprises users when it shows up unexpectedly (e.g.
  // legacy parts migrated from the old "tube" shape carry an ID value).
  const partMaterials = included
    .filter(p => !MATERIALS[p.material]?.isPurchased)
    .map(p => {
      const matLabel = partMaterialLabel(p);
      const dims = p.stock ? fmtStockDims(p.stock).replace(/\s*·\s*ID\s+\d+(?:\.\d+)?\s*$/i, "") : "—";
      return {
        partName: p.name,
        material: matLabel,
        dimensions: dims,
        ratePerKg: partRate(p),
        cost: partMaterialCost(p, args.asmQty),
      };
    });

  // Page 3: per-part operations. Keep every included part visible, even if it
  // has no operations, by emitting one grouped section per part.
  const partOperationGroups = included.map(p => ({
    partName: p.name,
    operations: p.operations.length === 0
      ? []
      : p.operations.map(op => ({
          operation: opMachineLabel(op),
          ratePerHour: opRate(op),
          cost: opCost(op, partQty(p, args.asmQty)),
        })),
  }));

  // Page 4: BOPs (quote-level). Rendered at unit cost — no margin baked in.
  // Skip rows with zero/invalid amounts (matches the page-1 filter).
  const bopBreakdown = args.bops
    .filter(b => b.qtyPerAssembly > 0 && b.unitCost >= 0)
    .map(b => ({
      name: b.name || "—",
      qtyPerAssembly: b.qtyPerAssembly,
      unitCost: b.unitCost,
      totalCost: b.unitCost * b.qtyPerAssembly * Math.max(0, args.asmQty),
    }));

  return {
    company: {
      name: COMPANY_INFO.name,
      addressLines: COMPANY_INFO.addressLines,
      phone: COMPANY_INFO.phone,
      email: COMPANY_INFO.email,
      gstn: COMPANY_INFO.gstn,
      state: COMPANY_INFO.state,
      stateCode: COMPANY_INFO.stateCode,
      tagline: COMPANY_INFO.tagline,
    },
    customer: {
      name: customerName,
      addressLines: customerLines,
    },
    meta: {
      srNo: refLabel,
      date: fmtQuotationDate(new Date()),
      refNo: args.rfq.rfqRef,
      validFor: "15 DAYS",
    },
    items,
    grandTotal,
    currencyLabel: "INR",
    notes: args.rfq.notes,
    terms: QUOTATION_TERMS,
    contact: {
      name: COMPANY_INFO.contactPerson,
      phone: COMPANY_INFO.contactPhone,
      email: COMPANY_INFO.contactEmail,
    },
    fileName: `${refLabel || "quotation"}.pdf`,
    partMaterials,
    partOperationGroups,
    bopBreakdown,
  };
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

function QuotePreview({ onOpenViewer }: { onOpenViewer?: () => void }) {
  return (
    <div className="canvas" style={{flex:1,minHeight:0,display:"grid",placeItems:"center"}}>
      <div className="canvas-grid"/>
      <div className="empty-state quote-preview-empty">
        <div className="es-ic"><Box size={20}/></div>
        <div className="es-title">No CAD model attached</div>
        <div className="es-hint" style={{maxWidth:280,margin:"4px auto 0"}}>Import a STEP file in the viewer to see the 3D model here. Manual parts can be added below without one.</div>
        {onOpenViewer && (
          <div style={{marginTop:12}}>
            <button className="btn sm" onClick={onOpenViewer}><ExternalLink size={12}/> Open viewer</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================================================
   CAD preview (real Three.js model)
   =========================================================== */

function QuoteCadPreview({ model, selectedId, selectedMeshIds, showAll, viewerRef: externalViewerRef }: {
  model: CadImportResult;
  selectedId: string | null;
  selectedMeshIds: string[];
  showAll: boolean;
  viewerRef?: MutableRefObject<QuotePreviewViewerHandle | null>;
}) {
  const localViewerRef = useRef<QuotePreviewViewerHandle | null>(null);
  // Use the parent-provided ref when available so the export pipeline can
  // grab a snapshot; otherwise fall back to a local ref for the fit() effect.
  const viewerRef = externalViewerRef ?? localViewerRef;
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
    onChange({ material: newMat, materialLabelSnapshot: materialLabel(newMat), materialRateOverride: null });
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
          {Object.entries(MATERIALS).filter(([, m]) => m.isActive && !m.isPurchased).map(([k, m]) => (
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
    onChange({operations:[...part.operations,{id:opId(),machine:defaultMachine,machineLabelSnapshot: machineLabel(defaultMachine),setupMin:5,cycleMin:1}]});
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
              <select aria-label="Machine" value={op.machine} onChange={e => update(op.id, { machine: e.target.value, machineLabelSnapshot: machineLabel(e.target.value), rateOverride: null })}>
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
  onDelete: (id: string) => void;
};

const PartRow = memo(function PartRow({ p, isSel, isExpanded, asmQty, onSelect, onUpdate, onToggleExpanded, onDelete }: RowProps) {
  const qty = partQty(p, asmQty);
  const sub = partSubtotal(p, asmQty);
  const ops = p.operations || [];
  const totalMin = ops.reduce((a, op) => a + opMinutes(op, qty), 0);
  const machineTags = ops.slice(0, 3).map(o => opMachineShortLabel(o));
  return (
    <tr className={`${isSel?"sel":""} ${!p.included?"excluded":""} ${isExpanded?"row-expanded":""}`} onClick={() => onSelect(p.id)}>
      <td className="include-cell"><input type="checkbox" aria-label={`Include ${p.name} in quote`} checked={p.included} onClick={e=>e.stopPropagation()} onChange={()=>onUpdate(p.id,{included:!p.included})}/></td>
      <td><div className="body-cell"><span className="swatch" style={{background:p.color}}/><div style={{minWidth:0}}>
        <input
          className="pname pname-input"
          aria-label="Part name"
          value={p.name}
          onClick={e=>e.stopPropagation()}
          onChange={e=>onUpdate(p.id,{name:e.target.value})}
        />
        {!p.stocked&&p.stock&&(
          <div className="pmeta">
            <span className="stock-badge"><span className="shape-ic"><ShapeIcon shape={p.stock.shape} size={11}/></span>{fmtStockDims(p.stock)}</span>
          </div>
        )}
      </div></div></td>
      <td>{p.material ? <span className="material-chip"><span className="swatch" style={{background:MATERIALS[p.material]?.hex ?? colorForMaterial(p.material)}}/>{partMaterialLabel(p)}</span> : <span className="muted" style={{fontSize:11}}>—</span>}</td>
      <td className="num"><input type="number" className="qty-input" aria-label={`Per-assembly quantity for ${p.name}`} value={p.perAssembly} onClick={e=>e.stopPropagation()} onChange={e=>onUpdate(p.id,{perAssembly:+e.target.value||0})}/></td>
      <td className="num muted">{qty}</td>
      <td>{ops.length===0?<span className="muted" style={{fontSize:11}}>—</span>:<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span className="ops-pill"><Cog size={10}/> {fmtMin(totalMin)} min · {ops.length} ops</span><span className="muted" style={{fontSize:10.5,fontFamily:"var(--font-mono)"}}>{machineTags.join(" · ")}{ops.length>3?` +${ops.length-3}`:""}</span></div>}</td>
      <td className="num">{p.included?fmtINR(sub):"—"}</td>
      <td>
        <div className="row-actions">
          <button
            className="row-delete"
            onClick={e=>{e.stopPropagation();if(window.confirm(`Remove "${p.name}" from the quote?`))onDelete(p.id);}}
            title={`Remove ${p.name}`}
            aria-label={`Remove ${p.name}`}
          >
            <Trash2 size={13}/>
          </button>
          <button
            className="expand-toggle"
            onClick={e=>{e.stopPropagation();onToggleExpanded(p.id);}}
            title={isExpanded?"Hide machining operations":"Show machining operations"}
            aria-expanded={isExpanded}
          >
            {isExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
          </button>
        </div>
      </td>
    </tr>
  );
});

function PartsTable({ parts, setParts, asmQty, selectedId, onSelect, onAddPart, searchQuery }: {
  parts:Part[]; setParts:(p:Part[])=>void;
  asmQty:number; selectedId:string|null;
  onSelect:(id:string|null)=>void;
  onAddPart:()=>void;
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
  const stableDelete = useCallback((id: string) => {
    setPartsRef.current(partsRef.current.filter(p => p.id !== id));
    setExpandedId(prev => prev === id ? null : prev);
    if (onSelectRef.current && partsRef.current.find(p => p.id === id)) {
      const remaining = partsRef.current.filter(p => p.id !== id);
      onSelectRef.current(remaining[0]?.id ?? null);
    }
  }, []);

  const counts={included:parts.filter(p=>p.included).length,machined:parts.filter(p=>!p.stocked).length,purchased:parts.filter(p=>p.stocked).length,excluded:parts.filter(p=>!p.included).length};
  const q=searchQuery.trim().toLowerCase();
  const filtered=parts.filter(p=>{
    if (filter==="machined"&&p.stocked) return false;
    if (filter==="purchased"&&!p.stocked) return false;
    if (filter==="excluded"&&p.included) return false;
    if (q) {
      const hay=`${p.name} ${p.id} ${partMaterialLabel(p)}`.toLowerCase();
      const opsMatch=(p.operations||[]).some(op=>opMachineLabel(op).toLowerCase().includes(q));
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
              {Object.entries(MATERIALS).filter(([,m])=>m.isActive&&!m.isPurchased).map(([k,v])=><div className="opt" key={k} onClick={()=>bulkApply({material:k, materialLabelSnapshot:v.label})}><span className="swatch" style={{background:v.hex}}/><span>{v.label}</span></div>)}
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
                onDelete={stableDelete}
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

function customerOptionLabel(customer: Customer): string {
  const contact = customer.company && customer.company !== customer.name ? customer.name : null;
  return [customer.company || customer.name, contact].filter(Boolean).join(" - ");
}

function customerDisplayName(customer: Customer): string {
  return customer.company || customer.name;
}

function CustomerField({
  value,
  customerId,
  onChange,
}: {
  value: string;
  customerId: string | null;
  onChange: (customer: { customer: string; customerId: string | null }) => void;
}) {
  const selectId = useId();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState<string | null>(null);
  const selectedCustomer = customerId ? customers.find(customer => customer.id === customerId) : null;
  const committedLabel = selectedCustomer ? customerDisplayName(selectedCustomer) : (customerId ? value : "");
  const [draft, setDraft] = useState(committedLabel);
  useEffect(() => { setDraft(committedLabel); }, [committedLabel]);
  const typedName = draft.trim();
  const normalizedValue = typedName.toLocaleLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedValue) return customers;
    return customers.filter(customer =>
      customerOptionLabel(customer).toLocaleLowerCase().includes(normalizedValue) ||
      customer.name.toLocaleLowerCase().includes(normalizedValue) ||
      customer.company?.toLocaleLowerCase().includes(normalizedValue) ||
      customer.email?.toLocaleLowerCase().includes(normalizedValue) ||
      customer.phone?.toLocaleLowerCase().includes(normalizedValue)
    );
  }, [customers, normalizedValue]);
  const hasExactMatch = typedName.length > 0 && customers.some(customer =>
    customerOptionLabel(customer).toLocaleLowerCase() === normalizedValue ||
    customer.name.toLocaleLowerCase() === normalizedValue ||
    customer.company?.toLocaleLowerCase() === normalizedValue
  );
  const canCreateCustomer = typedName.length > 0 && !hasExactMatch;

  const selectCustomer = useCallback((customer: Customer) => {
    onChange({ customer: customerDisplayName(customer), customerId: customer.id });
    setDraft(customerDisplayName(customer));
    setIsOpen(false);
  }, [onChange]);

  const handleCustomerCreated = useCallback((customer: Customer) => {
    setCustomers(rows => [...rows, customer].sort((a, b) => customerOptionLabel(a).localeCompare(customerOptionLabel(b))));
    onChange({ customer: customerDisplayName(customer), customerId: customer.id });
    setDraft(customerDisplayName(customer));
    setNewCustomerName(null);
    setIsOpen(false);
  }, [onChange]);

  const revertDraft = useCallback(() => {
    setDraft(committedLabel);
  }, [committedLabel]);

  useEffect(() => {
    let alive = true;
    getAllCustomers()
      .then(rows => {
        if (!alive) return;
        setCustomers(rows);
        setLoadError(null);
      })
      .catch(error => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load customers.");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (customerId || !value.trim() || customers.length === 0) return;
    const normalized = value.trim().toLocaleLowerCase();
    const match = customers.find(customer =>
      customer.name.toLocaleLowerCase() === normalized ||
      customer.company?.toLocaleLowerCase() === normalized
    );
    if (match) onChange({ customer: customerDisplayName(match), customerId: match.id });
    else onChange({ customer: "", customerId: null });
  }, [customerId, customers, onChange, value]);

  if (loadError) {
    return (
      <Field
        label="Customer"
        value={value}
        grid="1/-1"
        onChange={next => onChange({ customer: String(next), customerId: null })}
      />
    );
  }

  return (
    <div className="field" style={{ gridColumn: "1/-1" }}>
      <label htmlFor={selectId}>Customer</label>
      <div className="customer-combobox">
        <input
          id={selectId}
          name={selectId}
          placeholder="Search customers"
          value={draft}
          autoComplete="off"
          onFocus={() => setIsOpen(true)}
          onChange={event => {
            setDraft(event.target.value);
            setIsOpen(true);
          }}
          onBlur={() => {
            revertDraft();
            window.setTimeout(() => setIsOpen(false), 120);
          }}
        />
        <button
          type="button"
          aria-label="Show customers"
          onMouseDown={event => event.preventDefault()}
          onClick={() => setIsOpen(open => !open)}
        >
          <ChevronDown size={14} />
        </button>
        {isOpen && (
          <div className="customer-menu" role="listbox" aria-label="Customers">
            {filteredCustomers.map(customer => (
            <button
              key={customer.id}
              type="button"
              className={selectedCustomer?.id === customer.id ? "selected" : undefined}
              role="option"
              aria-selected={selectedCustomer?.id === customer.id}
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectCustomer(customer)}
            >
              <span className="customer-name">{customer.company || customer.name}</span>
              {customer.company && customer.company !== customer.name && (
                <span className="customer-contact">{customer.name}</span>
              )}
            </button>
            ))}
            {canCreateCustomer && (
              <button
                type="button"
                className="create-customer"
                role="option"
                aria-selected="false"
                onMouseDown={event => event.preventDefault()}
                onClick={() => {
                  setNewCustomerName(typedName);
                  setIsOpen(false);
                }}
              >
                <Plus size={13} />
                <span className="customer-name">{`Add "${typedName}"`}</span>
              </button>
            )}
          </div>
        )}
      </div>
      {newCustomerName !== null && (
        <QuoteCustomerModal
          initialName={newCustomerName}
          onClose={() => setNewCustomerName(null)}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );
}

function QuoteCustomerModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: initialName,
    company: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const set = (patch: Partial<typeof formData>) => setFormData(prev => ({ ...prev, ...patch }));
  const clearErr = (key: string) => setErrors(prev => ({ ...prev, [key]: "" }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!formData.name.trim()) e.name = "Name is required";
    if (!formData.company.trim()) e.company = "Company is required";
    if (!formData.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = "Invalid email address";
    if (!formData.phone.trim()) e.phone = "Phone is required";
    else if (!/^\d{10}$/.test(formData.phone)) e.phone = "Must be exactly 10 digits";
    return e;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaveError("");
    setIsSaving(true);
    try {
      const customer = await createCustomer({
        name: formData.name.trim(),
        company: formData.company.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim() || null,
        notes: formData.notes.trim() || null,
      });
      onCreated(customer);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to create customer.");
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-head">
          <div className="title">New Customer</div>
          <button className="close" onClick={onClose} disabled={isSaving}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate autoComplete="off" data-lpignore="true" data-1p-ignore="true">
          <div className="modal-body">
            {saveError && (
              <div className="error-banner">
                <TriangleAlert size={14} />
                <span>{saveError}</span>
                <button type="button" onClick={() => setSaveError("")}><X size={12} /></button>
              </div>
            )}
            <div className="form-grid">
              <div className="form-group span-2">
                <label>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  onChange={event => { set({ name: event.target.value }); clearErr("name"); }}
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
                  value={formData.company}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  onChange={event => { set({ company: event.target.value }); clearErr("company"); }}
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
                  value={formData.email}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  onChange={event => { set({ email: event.target.value }); clearErr("email"); }}
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
                  value={formData.phone}
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  onChange={event => { set({ phone: event.target.value.replace(/\D/g, "").slice(0, 10) }); clearErr("phone"); }}
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
                  value={formData.address}
                  onChange={event => set({ address: event.target.value })}
                  rows={2}
                  placeholder="Street, City, State, PIN"
                  disabled={isSaving}
                />
              </div>
              <div className="form-group span-2">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
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
              {isSaving ? "Saving..." : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function RfqRail({ parts, asmQty, setAsmQty, commercial, setCommercial, bops, extraCosts, getCadSnapshot }: {
  parts:Part[];
  asmQty:number; setAsmQty:(v:number)=>void;
  commercial:{marginPct:number;taxPct:number}; setCommercial:(v:{marginPct:number;taxPct:number})=>void;
  bops: Bop[];
  extraCosts: ExtraCost[];
  /** Capture an isometric snapshot of the CAD preview. Returns null when no model is loaded or preview is hidden. */
  getCadSnapshot?: () => string | null;
}) {
  const { id } = useParams<{ id: string }>();
  const {
    rfq,
    setRfq,
    quoteId,
    quoteNumber,
    quoteStatus,
    persistenceStatus,
    persistenceError,
    lastSavedAt,
    saveQuote,
    sendQuote,
    clearPersistenceError,
  } = useQuoteState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"inputs"|"notes">("inputs");
  const r=rollup(parts,asmQty,commercial,bops,extraCosts);
  const totalQty=parts.filter(p=>p.included).reduce((a,p)=>a+partQty(p,asmQty),0);
  const unit=asmQty>0?r.total/asmQty:0;
  const isSaving = persistenceStatus === "saving";
  const savedText = lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved";

  const includedCount = parts.filter(p => p.included).length;
  const isSent = quoteStatus !== "draft";
  const canExport = includedCount > 0;
  const canSend = Boolean(quoteId) && includedCount > 0 && !isSent && !isSaving;

  async function handleSave() {
    try {
      const savedId = await saveQuote();
      if (!id || id !== savedId) navigate(`/quotes/${savedId}`, { replace: true });
    } catch {
      // Error state is owned by QuoteStateContext and rendered below.
    }
  }

  async function handleSend() {
    if (!canSend) return;
    try {
      const quoteNumber = await sendQuote();
      window.alert(`Quote sent as ${quoteNumber}.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to send quote.");
    }
  }

  async function handleExportPdf() {
    if (!canExport) {
      window.alert("Add at least one included part before exporting a PDF.");
      return;
    }
    try {
      await loadCatalog();
      const [logoBytes, cadSnapshotPng, customerRecord] = await Promise.all([
        loadCompanyLogoBytes(),
        Promise.resolve(dataUrlToBytes(getCadSnapshot?.() ?? null)),
        rfq.customerId ? getCustomerById(rfq.customerId).catch(() => null) : Promise.resolve(null),
      ]);
      const data = buildQuotationData({ rfq, parts, bops, extraCosts, asmQty, commercial, quoteNumber, customerRecord });
      const pdf = await exportQuotationPdf({
        ...data,
        logoBytes,
        logoMime: "image/jpeg",
        cadSnapshotPng,
      });
      if (!pdf.ok) throw new Error(pdf.reason);
      await downloadBytes(pdf.fileName, pdf.bytes, pdf.mimeType);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to export PDF.");
    }
  }

  return (
    <div className="panel rfq-panel">
      <div className="panel-head">
        <span className="title">{rfq.rfqRef || quoteNumber || rfq.project || "Inquiry"}</span>
        <div className="right">
          <span className={`chip ${persistenceStatus === "error" ? "" : "success"}`}>
            <span className="dot"/>
            {isSaving ? "Saving..." : persistenceStatus === "saved" ? savedText : "Draft"}
          </span>
        </div>
      </div>
      <div className="tabstrip">
        <button className={tab==="inputs"?"on":""} onClick={()=>setTab("inputs")}><Sliders size={13}/> Inputs</button>
        <button className={tab==="notes"?"on":""} onClick={()=>setTab("notes")}><ScanLine size={13}/> Notes</button>
      </div>
      <div className={`rfq-tab-body ${tab === "inputs" ? "" : "bounded"}`}>
        {tab==="inputs"&&(
          <>
<div className="rfq-fields">
              <CustomerField
                value={rfq.customer}
                customerId={rfq.customerId}
                onChange={customer => setRfq({ ...rfq, ...customer })}
              />
              <Field label="Project" value={rfq.project} onChange={v=>setRfq({...rfq, project:String(v)})}/>
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
            <div style={{height:10}}/>
</>
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
        <div className="duo">
          <div className="cell"><div className="label">Total</div><div className="value">{fmtINR(r.total)}</div><div className="sub">{asmQty} assemblies</div></div>
          <div className="cell right"><div className="label">Per unit</div><div className="value">{fmtINR(unit)}</div><div className="sub">incl. {commercial.marginPct}% margin</div></div>
        </div>
        <div className="total-actions">
          <button
            className="btn block primary"
            onClick={handleExportPdf}
            disabled={!canExport}
            title={canExport ? "Export quotation PDF" : "Add at least one included part to enable PDF export"}
          >
            <FileText size={14}/> Export PDF
          </button>
          <button className="btn block" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Clock size={14}/> : persistenceStatus === "saved" ? <Check size={14}/> : <Save size={14}/>}
            {isSaving ? "Saving" : persistenceStatus === "saved" ? "Saved" : "Save"}
          </button>
          <button
            className="btn"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title={
              isSent ? `Quote already ${quoteStatus}`
                : !quoteId ? "Save the quote first"
                : includedCount === 0 ? "Add at least one included part to send"
                : "Mark as sent and assign quote number"
            }
          >
            <Send size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Cost panel (memoized — doesn't depend on selection)
   =========================================================== */

const CostPanel = memo(function CostPanel({ parts, asmQty, commercial, bops, extraCosts }: {
  parts: Part[]; asmQty: number; commercial: { marginPct: number; taxPct: number }; bops: Bop[]; extraCosts: ExtraCost[];
}) {
  const r = rollup(parts, asmQty, commercial, bops, extraCosts);

  const cat = { material: 0, machine: 0, setup: 0, finish: 0 };
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    cat.material += partMaterialCost(p, asmQty);
    (p.operations || []).forEach(op => {
      const rate = opRate(op);
      cat.setup += (op.setupMin / 60) * rate;
      cat.machine += (op.cycleMin / 60) * rate * qty;
    });
  });

  const machineBreakdown: Record<string, { cost: number; mins: number; label: string }> = {};
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p, asmQty);
    (p.operations || []).forEach(op => {
      const rate = opRate(op);
      const cost = (op.setupMin / 60) * rate + (op.cycleMin / 60) * rate * qty;
      const mins = op.setupMin + op.cycleMin * qty;
      machineBreakdown[op.machine] = machineBreakdown[op.machine] || { cost: 0, mins: 0, label: opMachineLabel(op) };
      machineBreakdown[op.machine].cost += cost;
      machineBreakdown[op.machine].mins += mins;
    });
  });
  const machineRows = Object.entries(machineBreakdown).sort((a, b) => b[1].cost - a[1].cost);

  const segs = [
    { k: "Material",   v: cat.material, c: "#5d80c9" },
    { k: "Machining",  v: cat.machine,  c: "#7b95c0" },
    { k: "Setup",      v: cat.setup,    c: "#9aabc7" },
    { k: "Margin",     v: r.margin,     c: "#5fa05f" },
  ];
  const segsTotal = segs.reduce((a, s) => a + s.v, 0) || 1;

  return (
    <div className="panel cost-panel">
      <div className="panel-head">
        <span className="title">Cost breakdown</span>
        <span className="sub">Subtotal {fmtINR(r.subtotal)} · Margin {fmtINR(r.margin)}</span>
      </div>
      <div className="margin-bar">{segs.map(s => <span key={s.k} style={{width:`${(s.v/segsTotal)*100}%`,background:s.c}}/>)}</div>
      <div className="margin-legend">{segs.map(s => <span key={s.k}><span className="dot" style={{background:s.c}}/>{s.k}<span className="v">{fmtINR(s.v)}</span></span>)}</div>
      <div className="cost-grid">
        <div className="cost-row left"><span className="k">Parts subtotal</span><span className="v">{fmtINR(r.partsCost)}</span></div>
        <div className="cost-row right"><span className="k">BOP subtotal</span><span className="v">{fmtINR(r.bopCost)}</span></div>
        <div className="cost-row left"><span className="k">Margin · {commercial.marginPct}%</span><span className="v">{fmtINR(r.margin)}</span></div>
        <div className="cost-row right"><span className="k">Tax</span><span className="v">{fmtINR(r.tax)}</span></div>
        <div className="cost-row left"><span className="k">Extra costs</span><span className="v">{fmtINR(r.extraCost)}</span></div>
        <div className="cost-row right"><span className="k">Total</span><span className="v">{fmtINR(r.total)}</span></div>
      </div>
      {machineRows.length > 0 && (
        <>
          <div style={{padding:"10px 14px 4px",borderTop:"1px solid var(--divider)"}}><div className="eyebrow">Machine utilization</div></div>
          <div style={{padding:"0 14px 16px"}}>
            {machineRows.map(([m, info]) => {
              const pct = r.partsCost > 0 ? (info.cost / r.partsCost) * 100 : 0;
              return (
                <div key={m} style={{display:"grid",gridTemplateColumns:"120px 1fr 80px 80px",alignItems:"center",gap:10,padding:"6px 0",fontSize:12}}>
                  <span style={{color:"var(--text-2)"}}>{info.label}</span>
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
   BOP section — Brought-Out Parts (purchased items)
   =========================================================== */

function BopNameCell({
  bop, catalog, onApply, onRequestCreate,
}: {
  bop: Bop;
  catalog: BopCatalogItem[];
  /** Replace the row with a catalog snapshot (name + supplier + part# + unit cost). */
  onApply: (item: BopCatalogItem) => void;
  /** Open the "create catalog item" modal with the typed name pre-filled. */
  onRequestCreate: (initialName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(bop.name);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const committedLabel = bop.catalogId ? bop.name : "";
  useEffect(() => { setDraft(committedLabel); }, [committedLabel]);

  // Compute the menu's screen position when open so the portal lays it under
  // the input regardless of the panel's overflow:hidden clipping.
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
    if (!q) return catalog;
    return catalog.filter(item => {
      const hay = `${item.name} ${item.supplier ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, typedName]);
  const hasExactMatch = typedName.length > 0 && catalog.some(
    item => item.name.toLowerCase() === typedName.toLowerCase(),
  );
  const canCreate = typedName.length > 0 && !hasExactMatch;

  return (
    <div className="customer-combobox bop-name-cell" ref={wrapRef}>
      <input
        className="pname-input"
        placeholder="Select BOP…"
        value={draft}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => { setDraft(event.target.value); setOpen(true); }}
        onBlur={() => {
          setDraft(committedLabel);
          window.setTimeout(() => setOpen(false), 120);
        }}
      />
      <button
        type="button"
        aria-label="Browse BOP catalog"
        onMouseDown={event => event.preventDefault()}
        onClick={() => setOpen(o => !o)}
      >
        <ChevronDown size={12} />
      </button>
      {open && menuRect && createPortal(
        <div
          className="customer-menu bop-portal-menu"
          role="listbox"
          aria-label="BOP catalog"
          style={{
            position: "fixed",
            left: menuRect.left,
            top: menuRect.top,
            width: menuRect.width,
          }}
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
        </div>,
        document.body,
      )}
    </div>
  );
}

const BopSection = memo(function BopSection({ bops, setBops, asmQty }: {
  bops: Bop[]; setBops: Dispatch<SetStateAction<Bop[]>>; asmQty: number;
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
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [catalogRefreshTick]);
  const refreshCatalog = useCallback(() => setCatalogRefreshTick(v => v + 1), []);

  const subtotal = bops.reduce(
    (s, b) => s + Math.max(0, b.unitCost) * Math.max(0, b.qtyPerAssembly) * Math.max(0, asmQty),
    0,
  );

  const update = (id: string, patch: Partial<Bop>) =>
    setBops(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const remove = (id: string) => setBops(prev => prev.filter(b => b.id !== id));

  const addBlank = () => {
    setBops(prev => [...prev, {
      id: `qbop-${crypto.randomUUID()}`,
      catalogId: null,
      name: "",
      supplier: "",
      qtyPerAssembly: 1,
      unitCost: 0,
    }]);
  };
  /** Snapshot a catalog row into an existing BOP row. */
  const applyCatalog = (id: string, item: BopCatalogItem) => {
    update(id, {
      catalogId: item.id,
      name: item.name,
      supplier: item.supplier ?? "",
      unitCost: item.unitCost,
    });
  };
  const createCatalogItem = async (data: BopModalData) => createBopCatalog({
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
          <span className="title"><Package size={13}/> Brought-Out Parts</span>
          <span className="sub">{bops.length} item{bops.length === 1 ? "" : "s"} · Subtotal {fmtINR(subtotal)}</span>
        </div>
        <div className="right">
          <button className="btn sm" onClick={addBlank}>
            <Plus size={12}/> Add BOP
          </button>
        </div>
      </div>
      {bops.length === 0 ? (
        <div className="empty-state" style={{padding:"30px 18px"}}>
          <div className="es-ic"><Package size={18}/></div>
          <div className="es-title">No brought-out parts</div>
          <div className="es-hint">Search the catalog above, or pick &ldquo;New BOP (ad-hoc)&rdquo; to add a one-off item.</div>
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
              <th/>
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
                      type="number" min={0} step={1}
                      value={bop.qtyPerAssembly}
                      onChange={e => update(bop.id, { qtyPerAssembly: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="qty-input"
                      type="number" min={0} step={0.01}
                      value={bop.unitCost}
                      onChange={e => update(bop.id, { unitCost: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td className="num">{fmtINR(line)}</td>
                  <td>
                    <button
                      className="more-btn"
                      title="Remove"
                      onClick={() => remove(bop.id)}
                    >
                      <Trash2 size={13}/>
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="totals">
              <td colSpan={3}>BOP subtotal</td>
              <td className="num">{fmtINR(subtotal)}</td>
              <td/>
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

/* ===========================================================
   Extra costs section — fixed post-tax line items
   =========================================================== */

const ExtraCostsSection = memo(function ExtraCostsSection({ extraCosts, setExtraCosts }: {
  extraCosts: ExtraCost[];
  setExtraCosts: Dispatch<SetStateAction<ExtraCost[]>>;
}) {
  const subtotal = extraCosts.reduce((s, r) => s + Math.max(0, r.amount), 0);
  const updateAmount = (code: ExtraCost["code"], amount: number) => {
    setExtraCosts(prev => prev.map(r => r.code === code ? { ...r, amount } : r));
  };

  return (
    <div className="panel extra-costs-section">
      <div className="panel-head bop-head">
        <div className="bop-head-main">
          <span className="title"><Layers size={13}/> Extra Costs</span>
          <span className="sub">Added after tax · Subtotal {fmtINR(subtotal)}</span>
        </div>
      </div>
      <table className="parts-table extra-costs-table">
        <colgroup>
          <col />
          <col style={{ width: "22%", minWidth: 140 }} />
        </colgroup>
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {extraCosts.map(row => (
            <tr key={row.code}>
              <td>{row.label}</td>
              <td className="num">
                <input
                  className="qty-input"
                  type="number" min={0} step={0.01}
                  value={row.amount}
                  onChange={e => updateAmount(row.code, Math.max(0, Number(e.target.value) || 0))}
                />
              </td>
            </tr>
          ))}
          <tr className="totals">
            <td>Extra costs subtotal</td>
            <td className="num">{fmtINR(subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});

/* ===========================================================
   Quote workspace
   =========================================================== */

function QuoteWorkspace({ searchQuery, onOpenViewer }: { searchQuery:string; onOpenViewer:()=>void }) {
  const { cad, pendingHandoff, consumeHandoff } = useCad();
  const { parts, setParts, bops, setBops, extraCosts, setExtraCosts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, saveQuote, persistenceStatus, rfq, projectNameSource, setProjectAuto, savedCadFileName } = useQuoteState();
  const [reattachPrompt, setReattachPrompt] = useState<{
    incomingFile: string;
    existingFile: string;
  } | null>(null);
  // Track whether the initial loadQuote pass has finished. Without this gate,
  // a viewer→quote handoff can fire its merge effect on the very first render
  // (parts still []) and silently replace the saved row before loadQuote
  // populates state. See the merge effect below for the full guard.
  const [wasLoading, setWasLoading] = useState(false);
  useEffect(() => {
    if (persistenceStatus === "loading") setWasLoading(true);
  }, [persistenceStatus]);
  const loadSettled = wasLoading && persistenceStatus !== "loading";
  const [showAll, setShowAll] = useState(false);
  // Hoisted here so RfqRail's PDF export can snapshot the live preview viewer
  // (mounted inside <QuoteCadPreview> on another branch of the tree).
  const previewViewerRef = useRef<QuotePreviewViewerHandle | null>(null);
  const getCadSnapshot = useCallback(() => previewViewerRef.current?.screenshot() ?? null, []);
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

  // Applies the naming rule from the plan: overwrite project name with the
  // file's stripped basename only when it's safe (empty or auto-sourced).
  const getAutoProjectName = useCallback((fileName: string) => {
    const base = fileName.replace(/\.[^.]+$/, "").trim() || fileName;
    const projectEmpty = !rfq.project.trim();
    return projectEmpty || projectNameSource === "auto" ? base : rfq.project;
  }, [projectNameSource, rfq.project]);

  const applyAutoProjectName = useCallback((fileName: string) => {
    const nextProject = getAutoProjectName(fileName);
    if (nextProject !== rfq.project) setProjectAuto(nextProject);
  }, [getAutoProjectName, rfq.project, setProjectAuto]);

  // Performs the actual merge after we know the user has opted in (or no
  // pre-existing CAD blocks it). `replaceExisting=true` means the user just
  // confirmed the re-attach modal — wipe CAD-backed parts first.
  const completeHandoff = useCallback((replaceExisting: boolean) => {
    if (!cad) return;
    const imported = cadResultToParts(consumeHandoff()!);
    // Drop parts whose meshIds came from the previous CAD when replacing. Keep
    // manual parts (no meshIds) untouched.
    const keep = replaceExisting
      ? parts.filter(p => !p.meshIds || p.meshIds.length === 0)
      : parts;
    const existingIds = new Set(keep.map(p => p.id));
    const additions = imported.filter(p => !existingIds.has(p.id));
    if (additions.length === 0) return;
    const merged = [...keep, ...additions];
    setParts(merged);
    setSelectedId(additions[0]?.id ?? null);
    const nextProject = getAutoProjectName(cad.fileName);
    applyAutoProjectName(cad.fileName);
    void saveQuote({
      parts: merged,
      rfq: { ...rfq, project: nextProject },
      projectNameSource: nextProject === rfq.project ? projectNameSource : "auto",
    }).catch(() => {
      // Persistence errors are rendered by the quote state owner.
    });
  }, [applyAutoProjectName, cad, consumeHandoff, getAutoProjectName, parts, projectNameSource, rfq, saveQuote, setParts, setSelectedId]);

  useEffect(() => {
    if (!pendingHandoff || !cad) return;
    // Wait for loadQuote to settle so we merge against the authoritative parts
    // list instead of the empty initial state. Without this, navigating back
    // from the viewer remounts QuoteStateProvider, parts is [] for one render,
    // and the autosave below would replace the saved row with just-CAD parts.
    if (!loadSettled) return;
    // Re-attach: the quote already has a different CAD file persisted. Prompt
    // before discarding the previous file's bodies. Keep the handoff pending
    // so consumeHandoff() inside completeHandoff still returns the new cad.
    if (savedCadFileName && savedCadFileName !== cad.fileName) {
      setReattachPrompt(prev => prev ?? { incomingFile: cad.fileName, existingFile: savedCadFileName });
      return;
    }
    completeHandoff(false);
  }, [pendingHandoff, loadSettled, savedCadFileName, cad, completeHandoff]);

  const addManualPart = useCallback(() => {
    const defaultMaterial = Object.entries(MATERIALS).find(([, m]) => m.isActive && !m.isPurchased)?.[0]
      ?? Object.keys(MATERIALS)[0]
      ?? "";
    const id = `part-${crypto.randomUUID()}`;
    const nextIndex = parts.length + 1;
    const newPart: Part = {
      id,
      name: `Part ${nextIndex}`,
      color: colorForMaterial(defaultMaterial || id),
      material: defaultMaterial,
      materialLabelSnapshot: materialLabel(defaultMaterial),
      perAssembly: 1,
      mass: 0,
      finishing: 0,
      included: true,
      stocked: false,
      stock: null,
      operations: [],
    };
    setParts([...parts, newPart]);
    setSelectedId(id);
  }, [parts, setParts, setSelectedId]);

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
                  // Only treat the selection as a CAD selection when the part
                  // is actually backed by CAD bodies. Manual parts have no
                  // meshIds, so falling back to [selectedId] (a UUID) would
                  // put a non-existent id into isolate mode and hide every
                  // mesh in the scene, leaving the preview blank.
                  return p?.meshIds && p.meshIds.length > 0 ? p.meshIds : [];
                })()}
                showAll={showAll}
                viewerRef={previewViewerRef}/>
            : <QuotePreview onOpenViewer={onOpenViewer}/>)}
        </div>
        <RfqRail parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial} setCommercial={setCommercial} bops={bops} extraCosts={extraCosts} getCadSnapshot={getCadSnapshot}/>
      </div>
      <div className="quote-main-col">
        <PartsTable parts={parts} setParts={setParts} asmQty={asmQty} selectedId={selectedId} onSelect={setSelectedId} onAddPart={addManualPart} searchQuery={searchQuery}/>

        <BopSection bops={bops} setBops={setBops} asmQty={asmQty}/>

        <ExtraCostsSection extraCosts={extraCosts} setExtraCosts={setExtraCosts}/>

        <CostPanel parts={parts} asmQty={asmQty} commercial={commercial} bops={bops} extraCosts={extraCosts}/>
      </div>
    </div>
    {reattachPrompt && (
      <div className="modal-overlay" onClick={() => {
        consumeHandoff();
        setReattachPrompt(null);
      }}>
        <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
          <div className="confirm-icon"><TriangleAlert size={20}/></div>
          <p className="confirm-msg">
            This quote already has a CAD file (<strong>{reattachPrompt.existingFile}</strong>).
            Replace it with <strong>{reattachPrompt.incomingFile}</strong>?
            Bodies imported from the previous file will be removed; manual parts will stay.
          </p>
          <div className="confirm-actions">
            <button className="btn sm" onClick={() => {
              consumeHandoff();
              setReattachPrompt(null);
            }}>Cancel</button>
            <button className="btn sm danger" onClick={() => {
              setReattachPrompt(null);
              completeHandoff(true);
            }}>Replace</button>
          </div>
        </div>
      </div>
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
  const { rfq, quoteId, quoteNumber, quoteStatus, persistenceStatus, persistenceError, loadQuote, clearPersistenceError, changeStatus } = useQuoteState();
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
    // Don't fire a second load while one is in flight — when this effect
    // re-runs after setPersistenceStatus("loading") it would otherwise start
    // a parallel load whose later applySnapshot races with (and reverts) any
    // state mutations made between the two loads (e.g., a viewer→quote merge).
    if (persistenceStatus === "loading") return;
    loadQuote(id);
  }, [id, loadQuote, persistenceStatus, quoteId]);

  useEffect(() => {
    if (!id || !quoteId || id === quoteId || persistenceStatus !== "saved") return;
    navigate(`/quotes/${quoteId}`, { replace: true });
  }, [id, navigate, persistenceStatus, quoteId]);

  // rfq.project is authoritative — set by the auto-naming rule on attach,
  // by the New Quote button as "Untitled quote N", or by the user typing.
  // The bare "Untitled quote" fallback only fires for legacy rows whose
  // project was empty (back-filled but never re-saved).
  const title = rfq.project || "Untitled quote";
  const statusLabel = quoteStatus === "draft" ? "draft" : quoteStatus;
  const subText = persistenceStatus === "loading"
    ? "Loading saved quote"
    : persistenceStatus === "saving"
      ? "Saving quote"
      : quoteId
        ? quoteNumber
          ? `${statusLabel} · ${quoteNumber}`
          : `Saved ${statusLabel}`
        : `Unsaved draft${searchQuery?` · filter: "${searchQuery}"`:""}`;
  // Surface only user-meaningful refs (RFQ ref, assigned quote number). The
  // URL id is an internal UUID and should never reach the user.
  const quoteRef = rfq.rfqRef || quoteNumber || "";

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
        {quoteId && (
          <div style={{ marginLeft: "auto" }}>
            <select
              value={quoteStatus}
              onChange={e => void changeStatus(e.target.value as typeof quoteStatus)}
              className="status-select"
              aria-label="Quote status"
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="sent">Sent</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        )}
      </div>
      {persistenceError && (
        <div className="quote-page-error">
          <TriangleAlert size={14}/>
          <span>{persistenceError}</span>
          <button type="button" onClick={clearPersistenceError} title="Dismiss error"><X size={14}/></button>
        </div>
      )}
      <QuoteWorkspace
        searchQuery={searchQuery}
        onOpenViewer={() => {
          const source = quoteId || id;
          navigate(source ? `/viewer?from=${encodeURIComponent(source)}` : "/viewer");
        }}
      />
    </div>
  );
}
