import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import {
  Box,
  BoxesIcon,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Cog,
  Command,
  Copy,
  ExternalLink,
  FileCheck2,
  FileDown,
  FolderOpen,
  GridIcon,
  ImageDown,
  Info,
  Layers,
  Lightbulb,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Move3D,
  OctagonX,
  Package,
  Percent,
  Plus,
  Ruler,
  Save,
  Scale,
  ScanLine,
  Scissors,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Sliders,
  Square,
  SquareStack,
  Truck,
  TriangleAlert,
  X,
} from "lucide-react";
import { CadViewer, type CadViewerHandle } from "@components/CadViewer";

import {
  importStepFile,
  importStepUrl,
} from "@utils/index";
import type { CadImportResult, CadMesh } from "@utils/index";

/* ===========================================================
   Reference data — materials, machines, parts
   =========================================================== */

const MATERIALS: Record<string, { label: string; rate: number; density: number; machinability: number; hex: string; grade: string; forms: string[] }> = {
  "al-6061":    { label: "Aluminum 6061-T6", rate: 5.50, density: 2700, machinability: 4, hex: "#bfc7d1", grade: "T6 temper · UNS A96061",   forms: ["plate", "bar", "extrusion"] },
  "steel-1018": { label: "Steel 1018",       rate: 2.10, density: 7870, machinability: 3, hex: "#8d959c", grade: "Low-carbon · cold-rolled",   forms: ["plate", "bar"] },
  "brass":      { label: "Brass CW614N",     rate: 8.40, density: 8500, machinability: 5, hex: "#c69f5a", grade: "Free-machining · leaded",     forms: ["bar", "tube"] },
  "ss-304":     { label: "Stainless 304",    rate: 6.80, density: 8000, machinability: 2, hex: "#a8b0b8", grade: "Austenitic · corrosion-grade", forms: ["plate", "bar", "tube"] },
  "stock":      { label: "Stock / purchased", rate: 0,   density: 1000, machinability: 0, hex: "#dcd9d2", grade: "Purchased · not machined",   forms: ["—"] },
};

const MACHINES: Record<string, { label: string; rate: number; short: string }> = {
  "mill-3ax": { label: "Mill · 3-axis",    rate: 68,  short: "Mill 3-ax" },
  "mill-5ax": { label: "Mill · 5-axis",    rate: 110, short: "Mill 5-ax" },
  "lathe":    { label: "Lathe",            rate: 58,  short: "Lathe" },
  "drill":    { label: "Drill press",      rate: 38,  short: "Drill" },
  "tap":      { label: "Tap / thread",     rate: 38,  short: "Tap" },
  "wire-edm": { label: "Wire EDM",         rate: 95,  short: "Wire EDM" },
  "grind":    { label: "Surface grind",    rate: 72,  short: "Grind" },
  "deburr":   { label: "Deburr / hand",    rate: 28,  short: "Deburr" },
  "inspect":  { label: "CMM inspect",      rate: 64,  short: "CMM" },
};

const SHAPES: Record<string, { label: string; dims: string[] }> = {
  "plate":      { label: "Plate",      dims: ["L", "W", "H"] },
  "block":      { label: "Block",      dims: ["L", "W", "H"] },
  "round-bar":  { label: "Round bar",  dims: ["D", "L"] },
  "square-bar": { label: "Square bar", dims: ["side", "L"] },
  "tube":       { label: "Tube",       dims: ["OD", "ID", "L"] },
};

type Op = { id: string; machine: string; setupMin: number; cycleMin: number };
type Stock = { shape: string; dims: Record<string, number> };
type Part = {
  id: string; name: string; color: string;
  material: string; perAssembly: number; mass: number; finishing: number; included: boolean; stocked?: boolean;
  stock: Stock | null;
  operations: Op[];
};

let __opSeq = 100;
const opId = () => `op-${++__opSeq}`;

const INITIAL_PARTS: Part[] = [
  {
    id: "body-base", name: "Body · base plate",  color: "#7b8a9f",
    material: "al-6061", perAssembly: 1, mass: 0.221, finishing: 1.20, included: true,
    stock: { shape: "plate", dims: { L: 240, W: 130, H: 28 } },
    operations: [
      { id: opId(), machine: "mill-3ax", setupMin: 18, cycleMin: 6.0 },
      { id: opId(), machine: "drill",    setupMin: 4,  cycleMin: 2.0 },
      { id: opId(), machine: "deburr",   setupMin: 0,  cycleMin: 0.8 },
    ],
  },
  {
    id: "body-mid",  name: "Body · mid block",   color: "#9ca5b3",
    material: "al-6061", perAssembly: 1, mass: 0.158, finishing: 1.20, included: true,
    stock: { shape: "block", dims: { L: 160, W: 90, H: 45 } },
    operations: [
      { id: opId(), machine: "mill-3ax", setupMin: 14, cycleMin: 5.0 },
      { id: opId(), machine: "drill",    setupMin: 3,  cycleMin: 1.5 },
    ],
  },
  {
    id: "body-cap",  name: "Body · cap",         color: "#2f4f7d",
    material: "steel-1018", perAssembly: 1, mass: 0.124, finishing: 1.60, included: true,
    stock: { shape: "block", dims: { L: 85, W: 50, H: 28 } },
    operations: [
      { id: opId(), machine: "mill-3ax", setupMin: 12, cycleMin: 4.0 },
      { id: opId(), machine: "drill",    setupMin: 3,  cycleMin: 1.0 },
      { id: opId(), machine: "tap",      setupMin: 4,  cycleMin: 1.0 },
      { id: opId(), machine: "deburr",   setupMin: 0,  cycleMin: 0.5 },
    ],
  },
  {
    id: "fastener",  name: "M6×12 hex socket",   color: "#c0c0c0",
    material: "stock", perAssembly: 4, mass: 0.008, finishing: 0, included: true, stocked: true,
    stock: null,
    operations: [],
  },
  {
    id: "oring",     name: "O-ring 18×2 NBR",    color: "#1f1f1f",
    material: "stock", perAssembly: 1, mass: 0.002, finishing: 0, included: false, stocked: true,
    stock: null,
    operations: [],
  },
];

const TOOLING_BATCH = 244;
const INSPECTION_BATCH = 326;

const DFM_ISSUES = [
  { id: "dfm-1", partId: "body-cap", severity: "error", title: "Wall thickness 0.8 mm", desc: "Below 1.0 mm minimum for steel machining. Risk of deflection during finishing.", impact: 90, suggest: "Increase wall to ≥ 1.0 mm or accept reduced batch yield", actionable: true },
  { id: "dfm-2", partId: "body-cap", severity: "warn",  title: "Internal corner radius 0.5 mm", desc: "Below tool minimum for 3-axis mill. Adds tool-change time or forces 5-axis path.", impact: 120, suggest: "Relax to R1.0 mm or switch to 5-axis", actionable: true },
  { id: "dfm-3", partId: "body-mid", severity: "warn",  title: "Deep pocket · 18 × 12 × 32 mm", desc: "Aspect ratio > 2.5 requires long-reach tooling. Adds cycle time.", impact: 60, suggest: "Confirm pocket depth — drawing rev C tolerance", actionable: false },
  { id: "dfm-4", partId: "body-cap", severity: "info",  title: "Tap depth 3.2 × diameter", desc: "Above standard 2.5× for M6 — adds tap breakage risk and inspection time.", impact: 40, suggest: "Verify thread engagement with customer", actionable: false },
];

/* ===========================================================
   Costing utilities
   =========================================================== */

function stockVolumeMm3(stock: Stock): number {
  const { shape, dims } = stock;
  switch (shape) {
    case "plate": case "block": return (dims.L || 0) * (dims.W || 0) * (dims.H || 0);
    case "round-bar": return Math.PI * Math.pow((dims.D || 0) / 2, 2) * (dims.L || 0);
    case "square-bar": return Math.pow(dims.side || 0, 2) * (dims.L || 0);
    case "tube": { const ro = (dims.OD||0)/2, ri = (dims.ID||0)/2; return Math.PI*(ro*ro-ri*ri)*(dims.L||0); }
    default: return 0;
  }
}

function stockMassKg(stock: Stock | null, materialId: string): number {
  if (!stock) return 0;
  return stockVolumeMm3(stock) * 1e-9 * (MATERIALS[materialId]?.density ?? 0);
}

function stockUtilization(p: Part): number | null {
  if (!p.stock || p.stocked) return null;
  const sm = stockMassKg(p.stock, p.material);
  return sm > 0 ? p.mass / sm : null;
}

const partQty = (p: Part, asmQty: number) => p.perAssembly * asmQty;

function opCost(op: Op, qty: number): number {
  const rate = MACHINES[op.machine]?.rate ?? 0;
  return (op.setupMin / 60) * rate + (op.cycleMin / 60) * rate * qty;
}
function opMinutes(op: Op, qty: number): number { return op.setupMin + op.cycleMin * qty; }

function partMachineCost(p: Part, asmQty: number): number {
  const qty = partQty(p, asmQty);
  return (p.operations || []).reduce((a, op) => a + opCost(op, qty), 0);
}
function partMaterialCost(p: Part, asmQty: number): number {
  const matRate = MATERIALS[p.material]?.rate ?? 0;
  const mass = (p.stocked || !p.stock) ? p.mass : stockMassKg(p.stock, p.material);
  return mass * matRate * partQty(p, asmQty);
}
function partFinishCost(p: Part, asmQty: number): number { return p.finishing * partQty(p, asmQty); }
function partSubtotal(p: Part, asmQty: number): number {
  if (!p.included) return 0;
  return partMaterialCost(p, asmQty) + partMachineCost(p, asmQty) + partFinishCost(p, asmQty);
}

function rollup(parts: Part[], asmQty: number, commercial: { marginPct: number; taxPct: number }) {
  const partsCost = parts.reduce((a, p) => a + partSubtotal(p, asmQty), 0);
  const subtotal = partsCost + TOOLING_BATCH + INSPECTION_BATCH;
  const margin = subtotal * (commercial.marginPct / 100);
  const tax = (subtotal + margin) * (commercial.taxPct / 100);
  const total = subtotal + margin + tax;
  return { partsCost, tooling: TOOLING_BATCH, inspection: INSPECTION_BATCH, subtotal, margin, tax, total };
}

function fmtEUR(n: number) { return "€ " + n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtEUR0(n: number) { return "€ " + n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtMin(n: number) { return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
function fmtPct(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }

function addBusinessDays(start: Date, n: number): Date {
  const d = new Date(start); let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); const dow = d.getDay(); if (dow !== 0 && dow !== 6) added++; }
  return d;
}
function fmtShipDate(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }); }

function computeLeadTime(parts: Part[], asmQty: number) {
  let totalMachineMin = 0;
  parts.forEach(p => { if (!p.included) return; (p.operations || []).forEach(op => { totalMachineMin += opMinutes(op, partQty(p, asmQty)); }); });
  const queue = 3, machine = Math.max(2, Math.ceil(totalMachineMin / 60 / 6)), finish = parts.some(p => p.included && p.finishing > 0) ? 3 : 0, ship = 2;
  const total = queue + machine + finish + ship;
  return { queue, machine, finish, ship, total, shipDate: addBusinessDays(new Date(), total) };
}

/* ===========================================================
   Icon helper
   =========================================================== */

/* ===========================================================
   Shape icon
   =========================================================== */

function ShapeIcon({ shape, size = 14 }: { shape: string; size?: number }) {
  const s = size, sw = 1.25, stroke = "currentColor";
  switch (shape) {
    case "plate": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="6.5" width="12" height="3" rx="0.5" stroke={stroke} strokeWidth={sw}/></svg>;
    case "block": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="10" height="8" rx="0.5" stroke={stroke} strokeWidth={sw}/><line x1="3" y1="6" x2="13" y2="6" stroke={stroke} strokeWidth={sw} opacity="0.5"/></svg>;
    case "round-bar": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="6" width="12" height="4" rx="2" stroke={stroke} strokeWidth={sw}/></svg>;
    case "square-bar": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="6" width="12" height="4" stroke={stroke} strokeWidth={sw}/></svg>;
    case "tube": return <svg width={s} height={s} viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="6" rx="3" stroke={stroke} strokeWidth={sw}/><rect x="4" y="6.5" width="8" height="3" rx="1.5" stroke={stroke} strokeWidth={sw} opacity="0.55"/></svg>;
    default: return null;
  }
}

/* ===========================================================
   Quote state chip
   =========================================================== */

/* ===========================================================
   Keyboard shortcuts overlay
   =========================================================== */

function KbdOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = [
    { name: "Navigation", items: [{ keys: ["V"], label: "Switch to Viewer" }, { keys: ["Q"], label: "Switch to Quote" }, { keys: ["/"], label: "Focus search" }, { keys: ["?"], label: "Toggle cheatsheet" }, { keys: ["Esc"], label: "Close overlays" }] },
    { name: "Quote actions", items: [{ keys: ["S"], label: "Save quote" }, { keys: ["E"], label: "Export PDF" }, { keys: ["A"], label: "Add operation" }, { keys: ["D"], label: "Duplicate part" }] },
    { name: "Viewer", items: [{ keys: ["F"], label: "Fit to view" }, { keys: ["1"], label: "Isometric" }, { keys: ["2"], label: "Front" }, { keys: ["W"], label: "Toggle wireframe" }] },
    { name: "Parts", items: [{ keys: ["↑"], label: "Select previous part" }, { keys: ["↓"], label: "Select next part" }, { keys: ["Space"], label: "Toggle include" }] },
  ];

  return (
    <div className="kbd-overlay" onClick={onClose}>
      <div className="kbd-card" onClick={e => e.stopPropagation()}>
        <div className="head">
          <span className="title">Keyboard shortcuts</span>
          <button className="close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="kbd-body">
          {groups.map(g => (
            <div className="kbd-group" key={g.name}>
              <h5>{g.name}</h5>
              {g.items.map((it, i) => (
                <div className="kbd-row" key={i}>
                  <span>{it.label}</span>
                  <span className="kbd-keys">{it.keys.map((k, j) => <span className="kbd-key" key={j}>{k}</span>)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Viewer workspace
   =========================================================== */

const testFiles = ["FIXTURE PS_1250 ROUND BLOCKS.stp", "LOCUS SYSTEMS MACHINE FIXTURE.stp", "PS_1250_FIXTURE BLOCKS.stp", "Pump Manifold v3.step", "TEST BUTTON_9 CAVITY_29X12 (1).stp"];

function ViewerWorkspace({ cad, isImporting, onFile, onLoadTestFile }: {
  cad: CadImportResult | null;
  isImporting: boolean;
  onFile: (file?: File) => Promise<void>;
  onLoadTestFile: (fileName: string) => Promise<void>;
}) {
  const viewerRef = useRef<CadViewerHandle | null>(null);
  const [leftTab, setLeftTab] = useState<"files"|"meshes"|"materials">("meshes");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [displayMode, setDisplayMode] = useState<"solid"|"wireframe">("solid");
  const [showEdges, setShowEdges] = useState(true);
  const [orientation, setOrientation] = useState("iso");

  const selectedMesh = useMemo(() => cad?.meshes.find(m => m.id === selectedId), [cad, selectedId]);

  const toggleHide = (id: string) => {
    setHiddenIds(cur => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const uniqueColors = useMemo(() => {
    if (!cad) return [] as CadMesh[];
    const seen = new Set<string>();
    return cad.meshes.filter(m => { if (seen.has(m.color)) return false; seen.add(m.color); return true; });
  }, [cad]);

  const geo = cad?.geometry;

  return (
    <div className="viewer-grid">
      {/* Left panel */}
      <div className="panel">
        <div className="tabstrip">
          <button className={leftTab==="files"?"on":""} onClick={() => setLeftTab("files")}><Layers size={13} /> Files</button>
          <button className={leftTab==="meshes"?"on":""} onClick={() => setLeftTab("meshes")}><BoxesIcon size={13} /> Meshes</button>
          <button className={leftTab==="materials"?"on":""} onClick={() => setLeftTab("materials")}><GridIcon size={13} /> Mats</button>
        </div>

        <div className="tree-section">
          {leftTab === "files" && (
            <div style={{ padding: 6 }}>
              {cad ? (
                <div className="tree-row sel" style={{ paddingLeft: 10 }}>
                  <FileCheck2 size={13} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
                  <span className="name" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{cad.fileName}</span>
                </div>
              ) : null}
              {testFiles.map(f => (
                <button key={f} type="button" disabled={isImporting} onClick={() => void onLoadTestFile(f)}
                  className="tree-row" style={{ paddingLeft: 10, width: "100%", textAlign: "left", cursor: "pointer" }}>
                  <FileCheck2 size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  <span className="name" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{f}</span>
                </button>
              ))}
            </div>
          )}

          {leftTab === "meshes" && (
            cad ? (
              <div className="tree-group">
                <div className="tree-group-head">
                  <span className="chev"><ChevronDown size={12} /></span>
                  <span>{cad.fileName}</span>
                  <span className="count">{cad.meshes.length}</span>
                </div>
                {cad.meshes.map(m => {
                  const hidden = hiddenIds.has(m.id);
                  return (
                    <div key={m.id} className={`tree-row ${selectedId===m.id?"sel":""} ${hidden?"hidden":""}`}
                      onClick={() => { setSelectedId(m.id); viewerRef.current?.fit(m.id); }}>
                      <span className="swatch" style={{ background: m.color }} />
                      <span className="name">{m.name}</span>
                      <button className="eye" onClick={e => { e.stopPropagation(); toggleHide(m.id); }}>
                        {hidden ? <X size={11} /> : <ScanLine size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ padding: "16px 12px", color: "var(--text-3)", fontSize: 12 }}>No meshes loaded</div>
          )}

          {leftTab === "materials" && (
            <div style={{ padding: "6px 10px" }}>
              {uniqueColors.map(m => (
                <div className="kv" key={m.id} style={{ borderBottom: "1px dashed var(--divider)", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, background: m.color, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 3, flexShrink: 0 }} />
                    <span style={{ fontSize: 12 }}>{m.name}</span>
                  </div>
                  <span className="v" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{m.color.replace("#","").toUpperCase()}</span>
                </div>
              ))}
              {uniqueColors.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12 }}>No materials loaded</div>}
            </div>
          )}
        </div>

        <div className="left-foot">
          {cad ? (
            <div className="file">
              <span className="ic"><FileCheck2 size={14} /></span>
              <span className="name">{cad.fileName}</span>
              <span className="units">mm</span>
            </div>
          ) : (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--panel)", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
              <FolderOpen size={13} style={{ color: "var(--accent-text)" }} />
              <span>{isImporting ? "Importing…" : "Open STEP / STP file"}</span>
              <input type="file" accept=".step,.stp" style={{ display: "none" }} onChange={e => void onFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="panel canvas-col">
        <div className="toolbar">
          <div className="tool-group">
            <label className="tool-btn" title="Open file" style={{ cursor: "pointer" }}>
              <FolderOpen size={15} />
              <input type="file" accept=".step,.stp" style={{ display: "none" }} onChange={e => void onFile(e.target.files?.[0])} />
            </label>
            <button className="tool-btn" title="Screenshot" onClick={() => {
              const url = viewerRef.current?.screenshot(); if (url) { const a = document.createElement("a"); a.href = url; a.download = "viewport.png"; a.click(); }
            }}><ImageDown size={15} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-btn" title="Fit" onClick={() => viewerRef.current?.fit()}><Maximize size={15} /></button>
            <button className={`tool-btn ${orientation==="iso"?"on":""}`} onClick={() => { setOrientation("iso"); viewerRef.current?.setOrientation("iso"); }}><Box size={15} /></button>
            <button className={`tool-btn ${orientation==="front"?"on":""}`} onClick={() => { setOrientation("front"); viewerRef.current?.setOrientation("front"); }}><Square size={15} /></button>
            <button className={`tool-btn ${orientation==="top"?"on":""}`} onClick={() => { setOrientation("top"); viewerRef.current?.setOrientation("top"); }}><Layers size={15} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className={`tool-btn ${displayMode==="solid"?"on":""}`} onClick={() => setDisplayMode("solid")} title="Solid"><SquareStack size={15} /></button>
            <button className={`tool-btn ${displayMode==="wireframe"?"on":""}`} onClick={() => setDisplayMode("wireframe")} title="Wireframe"><GridIcon size={15} /></button>
            <button className={`tool-btn ${showEdges?"on":""}`} onClick={() => setShowEdges(!showEdges)} title="Edges"><ScanLine size={15} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-btn" title="Section"><Scissors size={15} /></button>
            <button className="tool-btn" title="Measure"><Ruler size={15} /></button>
            <button className="tool-btn" title="Explode"><Move3D size={15} /></button>
          </div>
          <div className="right">
            <span className="tool-label">mm · ISO</span>
          </div>
        </div>

        {cad ? (
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <CadViewer
              ref={viewerRef}
              model={cad}
              selectedMeshId={selectedId}
              hiddenMeshIds={hiddenIds}
              displayMode={displayMode}
              viewportTheme="light"
              explode={{ x: 0, y: 0, z: 0 }}
              showEdges={showEdges}
              onSelectMesh={setSelectedId}
            />
            <div className="canvas-hud-top">
              <span className="pill"><Box size={11} /> {cad.fileName}</span>
              <span className="pill">{cad.meshes.length} bodies</span>
            </div>
            <div className="canvas-hud-bot">
              <button className="zoom-btn" onClick={() => viewerRef.current?.fit()}><Maximize size={12} /></button>
            </div>
          </div>
        ) : (
          <div className="viewer-drop">
            <label className="drop-card" style={{ cursor: "pointer" }}>
              <div className="drop-ic"><FolderOpen size={20} /></div>
              <div className="drop-title">{isImporting ? "Importing…" : "Drop a STEP file or click to browse"}</div>
              <div className="drop-sub">.step · .stp</div>
              <div className="drop-formats"><span>STEP</span><span>STP</span></div>
              <input type="file" accept=".step,.stp" style={{ display: "none" }} onChange={e => void onFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
      </div>

      {/* Right inspector */}
      <div className="panel">
        <div className="panel-head">
          <span className="title">Inspector</span>
          <div className="right">
            <button className="tool-btn on" title="Details"><ScanLine size={14} /></button>
            <button className="tool-btn" title="Settings"><Settings2 size={14} /></button>
          </div>
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {geo ? (
            <>
              <div className="insp-section">
                <h4>Geometry</h4>
                <div className="insp-tile-row">
                  <div className="insp-tile">
                    <div className="label">Volume</div>
                    <div className="value">{((geo.volumeMm3??0)/1000).toFixed(2)} <span className="muted">cm³</span></div>
                  </div>
                  <div className="insp-tile">
                    <div className="label">Surface</div>
                    <div className="value">{((geo.surfaceAreaMm2??0)/100).toFixed(2)} <span className="muted">cm²</span></div>
                  </div>
                </div>
                <div className="kv"><span className="k">Bounding · X</span><span className="v">{(geo.boundingBoxMm?.x??0).toFixed(2)} mm</span></div>
                <div className="kv"><span className="k">Bounding · Y</span><span className="v">{(geo.boundingBoxMm?.y??0).toFixed(2)} mm</span></div>
                <div className="kv"><span className="k">Bounding · Z</span><span className="v">{(geo.boundingBoxMm?.z??0).toFixed(2)} mm</span></div>
              </div>
              <div className="insp-section">
                <h4>Mesh</h4>
                <div className="kv"><span className="k">Bodies</span><span className="v">{cad?.meshes.length ?? 0}</span></div>
                <div className="kv"><span className="k">Vertices</span><span className="v">{(geo.vertexCount??0).toLocaleString()}</span></div>
                <div className="kv"><span className="k">Triangles</span><span className="v">{(geo.faceCount??0).toLocaleString()}</span></div>
              </div>
            </>
          ) : (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
              Load a STEP file to view geometry details
            </div>
          )}

          {selectedMesh && (
            <>
              <div className="insp-section" style={{ paddingBottom: 14 }}>
                <h4>Selection</h4>
              </div>
              <div className="insp-selection">
                <div className="row1">
                  <span className="swatch" style={{ background: selectedMesh.color }} />
                  <span className="name">{selectedMesh.name}</span>
                  <span className="id">#sel</span>
                </div>
                <div className="grid">
                  <span className="k">Vertices</span><span className="v">{selectedMesh.vertexCount.toLocaleString()}</span>
                  <span className="k">Triangles</span><span className="v">{selectedMesh.triangleCount.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Quote preview (clickable SVG)
   =========================================================== */

function QuotePreview({ parts, selectedId, onSelect }: { parts: Part[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const c30 = Math.cos(Math.PI/6), s30 = Math.sin(Math.PI/6);

  function cuboid(id: string, cx: number, cy: number, w: number, h: number, d: number, topC: string, leftC: string, rightC: string) {
    const half = { x: (w/2)*c30, y: (w/2)*s30 }, dep = { x: (d/2)*c30, y: -(d/2)*s30 };
    const A = [cx-half.x-dep.x, cy-h/2-half.y-dep.y], B = [cx+half.x-dep.x, cy-h/2+half.y-dep.y];
    const C = [cx+half.x+dep.x, cy-h/2+half.y+dep.y], D = [cx-half.x+dep.x, cy-h/2-half.y+dep.y];
    const A2 = [A[0], A[1]+h], B2 = [B[0], B[1]+h], C2 = [C[0], C[1]+h];
    const part = parts.find(p => p.id === id);
    const isSel = selectedId === id;
    const excluded = part && !part.included;
    const opacity = excluded ? 0.35 : 1;
    const edge = isSel ? "#2f4f7d" : "#1e2734";
    const sw = isSel ? 1.4 : 0.5;
    const poly = (pts: number[][], fill: string) => <polygon points={pts.map(p=>p.join(",")).join(" ")} fill={fill} stroke={edge} strokeWidth={sw} strokeLinejoin="round" />;
    const issues = DFM_ISSUES.filter(i => i.partId === id);
    const worstSev = issues.reduce((acc: string, i) => i.severity==="error"?"error":(acc==="error"?"error":(i.severity==="warn"?"warn":acc)), "info");
    return (
      <g key={id} data-part={id} onClick={e => { e.stopPropagation(); onSelect(id); }} style={{ opacity, cursor: "pointer" }}>
        {poly([A,B,C,D], topC)}{poly([A,B,B2,A2], leftC)}{poly([B,C,C2,B2], rightC)}
        {isSel && <rect x={Math.min(A[0],A2[0])-6} y={A[1]-6} width={Math.abs(C[0]-A[0])+12} height={h+Math.abs(C[1]-A[1])+12} fill="none" stroke="#2f4f7d" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" rx="2" pointerEvents="none" />}
        {issues.length > 0 && <g pointerEvents="none"><circle cx={C[0]+6} cy={C[1]-2} r="7" fill={worstSev==="error"?"#b54a3b":worstSev==="warn"?"#b48241":"#5d80c9"} /><text x={C[0]+6} y={C[1]+1} textAnchor="middle" fontFamily="IBM Plex Mono" fontSize="9" fontWeight="600" fill="#fff">{issues.length}</text></g>}
      </g>
    );
  }

  return (
    <div className="canvas" style={{ flex: 1, minHeight: 0 }} onClick={() => onSelect(null)}>
      <div className="canvas-grid" />
      <div className="canvas-hud-top">
        <span className="pill"><Box size={11} /> Pump Manifold v3</span>
        <span className="pill">Click a body to edit</span>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <svg viewBox="0 0 480 320" width="100%" height="100%" style={{ maxWidth: 460, maxHeight: 300 }}>
          <defs><filter id="ds2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.10"/></filter></defs>
          <g filter="url(#ds2)" transform="translate(0,30)">
            {cuboid("body-base", 240,215,230,24,120,"#c8d0db","#a8b1be","#8e98a6")}
            {cuboid("body-mid",  240,170,150,38,80, "#d4dbe5","#b3bcc9","#97a1af")}
            {cuboid("body-cap",  240,120,80,26,44,  "#3b5a86","#2f4f7d","#24416b")}
          </g>
        </svg>
      </div>
      <div className="canvas-hud-bot">
        <button className="zoom-btn"><Minus size={12} /></button>
        <span className="zoom-val">100%</span>
        <button className="zoom-btn"><Plus size={12} /></button>
      </div>
    </div>
  );
}

/* ===========================================================
   Operations editor
   =========================================================== */

function OperationsEditor({ part, qty, onChange }: { part: Part; qty: number; onChange: (patch: Partial<Part>) => void }) {
  function update(id: string, patch: Partial<Op>) { onChange({ operations: part.operations.map(op => op.id===id?{...op,...patch}:op) }); }
  function remove(id: string) { onChange({ operations: part.operations.filter(op => op.id!==id) }); }
  function move(i: number, dir: number) { const list = part.operations.slice(); const j = i+dir; if (j<0||j>=list.length) return; [list[i],list[j]]=[list[j],list[i]]; onChange({ operations: list }); }
  function add() { onChange({ operations: [...part.operations, { id: opId(), machine: "mill-3ax", setupMin: 5, cycleMin: 1 }] }); }

  const totalMin = part.operations.reduce((a, op) => a+opMinutes(op,qty), 0);
  const totalCost = partMachineCost(part, qty/(part.perAssembly||1));

  return (
    <div className="ops-table" style={{ marginTop: 6 }}>
      <div className="row head"><span /><span>Operation · machine</span><span className="num">Setup</span><span className="num">Cycle</span><span className="num">Cost</span><span /></div>
      {part.operations.length === 0 && <div className="row" style={{ color: "var(--text-3)", padding: "10px 12px" }}><span /><span style={{ gridColumn: "2/-1" }}>No operations — add one to start estimating.</span></div>}
      {part.operations.map((op, i) => (
        <div className="row" key={op.id}>
          <span className="idx-wrap">
            <span className="reorder">
              <button onClick={() => move(i,-1)} disabled={i===0}><ChevronUp size={9}/></button>
              <button onClick={() => move(i,+1)} disabled={i===part.operations.length-1}><ChevronDown size={9}/></button>
            </span>
            <span className="idx">{(i+1)*10}</span>
          </span>
          <div className="machine-cell">
            <select value={op.machine} onChange={e => update(op.id,{machine:e.target.value})}>
              {Object.entries(MACHINES).map(([k,v]) => <option key={k} value={k}>{v.label} · €{v.rate}/h</option>)}
            </select>
          </div>
          <input type="number" className="mono" value={op.setupMin} min="0" step="0.5" onChange={e => update(op.id,{setupMin:+e.target.value||0})} />
          <input type="number" className="mono" value={op.cycleMin} min="0" step="0.1" onChange={e => update(op.id,{cycleMin:+e.target.value||0})} />
          <span className="num" style={{ paddingRight: 4 }}>{fmtEUR(opCost(op,qty))}</span>
          <button className="remove-op" onClick={() => remove(op.id)}><X size={12}/></button>
        </div>
      ))}
      <div className="ops-foot">
        <button className="add-op-btn" onClick={add}><Plus size={12}/> Add operation</button>
        <div className="summary"><strong>{fmtMin(totalMin)} min</strong> · {fmtEUR(totalCost)} machining</div>
      </div>
    </div>
  );
}

/* ===========================================================
   Stock editor
   =========================================================== */

function StockEditor({ part, onChange }: { part: Part; onChange: (patch: Partial<Part>) => void }) {
  if (!part || part.stocked) return null;
  const stock = part.stock || { shape: "block", dims: { L: 50, W: 50, H: 20 } };
  const cfg = SHAPES[stock.shape] || SHAPES.block;

  function updateShape(newShape: string) {
    const newCfg = SHAPES[newShape];
    const defaults: Record<string,number> = { L:80, W:50, H:25, D:30, side:30, OD:30, ID:20 };
    const newDims: Record<string,number> = {};
    newCfg.dims.forEach(k => { newDims[k] = stock.dims?.[k] ?? defaults[k]; });
    onChange({ stock: { shape: newShape, dims: newDims } });
  }
  function updateDim(key: string, val: number) { onChange({ stock: { ...stock, dims: { ...stock.dims, [key]: val } } }); }

  const sm = stockMassKg(stock, part.material);
  const util = sm > 0 ? (part.mass/sm)*100 : 0;
  const waste = Math.max(0, sm-part.mass);
  const utilClass = util>=50?"good":util>=25?"warn":"poor";

  return (
    <div className="stock-block">
      <div className="stock-head">
        <span className="eyebrow">Stock shape</span>
        <span className={`util-pill ${utilClass}`}><Percent size={10}/> {util.toFixed(0)}% utilization</span>
      </div>
      <div className="shape-picker">
        {Object.entries(SHAPES).map(([id, s]) => (
          <button key={id} className={stock.shape===id?"on":""} onClick={() => updateShape(id)} title={s.label}>
            <span className="shape-ic"><ShapeIcon shape={id} size={14}/></span>
            {s.label}
          </button>
        ))}
      </div>
      <div className={`dim-grid ${cfg.dims.length===3?"three":"two"}`}>
        {cfg.dims.map(k => (
          <div className="field" key={k}>
            <label>{k}</label>
            <div className="suffix">
              <input type="number" min="0" value={stock.dims?.[k]??0} onChange={e => updateDim(k, +e.target.value||0)} />
              <span className="unit">mm</span>
            </div>
          </div>
        ))}
      </div>
      <div className="stock-summary">
        <div className="cell"><span className="lbl">Stock mass</span><span className="val">{sm.toFixed(3)} kg</span></div>
        <div className="cell center"><span className="lbl">Net part</span><span className="val">{part.mass.toFixed(3)} kg</span></div>
        <div className="cell right"><span className="lbl">Waste (chip)</span><span className="val">{waste.toFixed(3)} kg</span></div>
      </div>
    </div>
  );
}

/* ===========================================================
   Material card
   =========================================================== */

function MaterialCard({ materialId }: { materialId: string }) {
  const m = MATERIALS[materialId];
  if (!m) return null;
  return (
    <div className="material-card">
      <span className="swatch" style={{ background: m.hex }} />
      <div className="body">
        <div className="name">{m.label}</div>
        <div className="grade">{m.grade}</div>
        <div className="specs">
          <div><span className="k">Density</span><span className="v">{m.density.toLocaleString()} kg/m³</span></div>
          <div><span className="k">Rate</span><span className="v">€ {m.rate.toFixed(2)}/kg</span></div>
          <div><span className="k">Stock forms</span><span className="v" style={{ fontSize: 10.5 }}>{m.forms.join(", ")}</span></div>
        </div>
        <span className="machinability">Machinability
          <span className="bars">{[1,2,3,4,5].map(i => <span key={i} className={i<=m.machinability?"fill":""} />)}</span>
        </span>
      </div>
    </div>
  );
}

/* ===========================================================
   Parts table
   =========================================================== */

function PartsTable({ parts, setParts, asmQty, selectedId, onSelect, searchQuery }: {
  parts: Part[]; setParts: (p: Part[]) => void;
  asmQty: number; selectedId: string|null;
  onSelect: (id: string|null) => void;
  searchQuery: string;
}) {
  const [filter, setFilter] = useState<"all"|"machined"|"purchased"|"excluded">("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (bulkOpen && bulkRef.current && !bulkRef.current.contains(e.target as Node)) setBulkOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bulkOpen]);

  const counts = { included: parts.filter(p=>p.included).length, machined: parts.filter(p=>!p.stocked).length, purchased: parts.filter(p=>p.stocked).length, excluded: parts.filter(p=>!p.included).length };
  const q = searchQuery.trim().toLowerCase();
  const filtered = parts.filter(p => {
    if (filter==="machined"&&p.stocked) return false;
    if (filter==="purchased"&&!p.stocked) return false;
    if (filter==="excluded"&&p.included) return false;
    if (q) {
      const hay = `${p.name} ${p.id} ${MATERIALS[p.material]?.label||""}`.toLowerCase();
      const opsMatch = (p.operations||[]).some(op => (MACHINES[op.machine]?.label||"").toLowerCase().includes(q));
      if (!hay.includes(q) && !opsMatch) return false;
    }
    return true;
  });

  const totalAmount = filtered.reduce((a, p) => a+partSubtotal(p,asmQty), 0);
  function update(id: string, patch: Partial<Part>) { setParts(parts.map(p => p.id===id?{...p,...patch}:p)); }
  function bulkApply(patch: Partial<Part>) { const ids = new Set(filtered.map(p=>p.id)); setParts(parts.map(p => ids.has(p.id)?{...p,...patch}:p)); setBulkOpen(false); }

  return (
    <div className="panel parts-panel">
      <div className="panel-head">
        <span className="title">Parts in quote</span>
        <span className="sub">{counts.included} of {parts.length} included · {asmQty} assemblies</span>
        <div className="right"><button className="btn sm ghost"><Plus size={12}/> Add part</button></div>
      </div>
      <div className="filter-bar">
        {(["all","machined","purchased"] as const).map(f => (
          <button key={f} className={`filter-chip ${filter===f?"on":""}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)} <span className="count">{f==="all"?parts.length:f==="machined"?counts.machined:counts.purchased}</span>
          </button>
        ))}
        {counts.excluded > 0 && <button className={`filter-chip ${filter==="excluded"?"on":""}`} onClick={() => setFilter("excluded")}>Excluded <span className="count">{counts.excluded}</span></button>}
        <div className="bulk-wrap" ref={bulkRef}>
          <button className="btn sm" onClick={() => setBulkOpen(!bulkOpen)}><Layers size={12}/> Bulk apply <ChevronDown size={11} style={{ marginLeft: 2, color: "var(--text-3)" }}/></button>
          {bulkOpen && (
            <div className="bulk-menu">
              <div className="section">Apply to {filtered.length} visible parts</div>
              <div className="section" style={{ paddingTop: 0 }}>Material</div>
              {Object.entries(MATERIALS).filter(([k])=>k!=="stock").map(([k,v]) => <div className="opt" key={k} onClick={() => bulkApply({material:k})}><span className="swatch" style={{ background: v.hex }}/><span>{v.label}</span></div>)}
              <div className="div"/>
              <div className="opt" onClick={() => bulkApply({included:true})}><Check size={13}/> Include all visible</div>
              <div className="opt danger" onClick={() => bulkApply({included:false})}><X size={13}/> Exclude all visible</div>
            </div>
          )}
        </div>
      </div>
      <table className="parts-table">
        <thead>
          <tr>
            <th className="include-cell"/>
            <th>Body</th><th>Material</th>
            <th className="num">Per asm</th><th className="num">Qty</th>
            <th>Machining</th><th className="num">Subtotal</th>
            <th style={{ width: 32 }}/>
          </tr>
        </thead>
        <tbody>
          {filtered.length===0 && <tr><td colSpan={8}><div className="empty-state" style={{ padding: "30px 18px" }}><div className="es-ic"><Search size={18}/></div><div className="es-title">No parts match the filter</div><div className="es-hint">Clear the search or pick a different filter.</div></div></td></tr>}
          {filtered.map(p => {
            const qty = partQty(p,asmQty), sub = partSubtotal(p,asmQty), isSel = selectedId===p.id;
            const totalMin = (p.operations||[]).reduce((a,op)=>a+opMinutes(op,qty),0);
            const ops = p.operations||[];
            const machineTags = ops.slice(0,3).map(o=>MACHINES[o.machine]?.short||o.machine);
            return (
              <tr key={p.id} className={`${isSel?"sel":""} ${!p.included?"excluded":""}`} onClick={() => onSelect(p.id)}>
                <td className="include-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={p.included} onChange={() => update(p.id,{included:!p.included})}/></td>
                <td><div className="body-cell"><span className="swatch" style={{ background: p.color }}/><div style={{ minWidth: 0 }}>
                  <div className="pname">{p.name}</div>
                  <div className="pmeta">#{p.id}{p.stocked?" · purchased":" · machined"}
                    {!p.stocked&&p.stock&&<span className="stock-badge" style={{ marginLeft: 8 }}><span className="shape-ic"><ShapeIcon shape={p.stock.shape} size={11}/></span>{SHAPES[p.stock.shape]?.dims.map(k=>p.stock?.dims[k]).join("×")} mm</span>}
                  </div>
                </div></div></td>
                <td onClick={e=>e.stopPropagation()}><select value={p.material} onChange={e=>update(p.id,{material:e.target.value})}>{Object.entries(MATERIALS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></td>
                <td className="num" onClick={e=>e.stopPropagation()}><input type="number" className="qty-input" value={p.perAssembly} onChange={e=>update(p.id,{perAssembly:+e.target.value||0})}/></td>
                <td className="num muted">{qty}</td>
                <td>{ops.length===0?<span className="muted" style={{ fontSize:11 }}>—</span>:<div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}><span className="ops-pill"><Cog size={10}/> {fmtMin(totalMin)} min · {ops.length} ops</span><span className="muted" style={{ fontSize:10.5,fontFamily:"var(--font-mono)" }}>{machineTags.join(" · ")}{ops.length>3?` +${ops.length-3}`:""}</span></div>}</td>
                <td className="num">{p.included?fmtEUR(sub):"—"}</td>
                <td onClick={e=>e.stopPropagation()}><button className="more-btn"><MoreHorizontal size={14}/></button></td>
              </tr>
            );
          })}
          <tr className="totals"><td colSpan={6} style={{ color:"var(--text-3)" }}>Filtered subtotal · {filtered.length} of {parts.length} parts</td><td className="num">{fmtEUR(totalAmount)}</td><td/></tr>
        </tbody>
      </table>
    </div>
  );
}

/* ===========================================================
   DFM panel
   =========================================================== */

function DfmPanel({ parts, onSelectPart, asmQty }: { parts: Part[]; onSelectPart: (id: string) => void; asmQty: number }) {
  const dynamicIssues: typeof DFM_ISSUES = [];
  parts.forEach(p => {
    if (!p.included || p.stocked || !p.stock) return;
    const util = stockUtilization(p);
    if (util != null && util < 0.25) {
      const sm = stockMassKg(p.stock, p.material), waste = Math.max(0, sm-p.mass), rate = MATERIALS[p.material]?.rate??0, impact = Math.round(waste*rate*partQty(p,asmQty));
      dynamicIssues.push({ id: `dfm-util-${p.id}`, partId: p.id, severity: util<0.15?"error":"warn", title: `Low stock utilization · ${(util*100).toFixed(0)}%`, desc: `Chip waste ${waste.toFixed(3)} kg per part. Consider smaller stock or near-net shape.`, impact, suggest: "Resize stock to net + 4 mm finishing allowance", actionable: true });
    }
  });
  const allIssues = [...dynamicIssues, ...DFM_ISSUES];
  const totalImpact = allIssues.reduce((a,i)=>a+(i.impact||0),0);
  const counts = allIssues.reduce((a,i)=>({...a,[i.severity]:(a[i.severity as keyof typeof a]||0)+1}),{error:0,warn:0,info:0});
  const partName = (id: string) => parts.find(p=>p.id===id)?.name||id;

  return (
    <div className="panel dfm-panel">
      <div className="panel-head">
        <span className="title">DFM review</span>
        <span className="sub">{allIssues.length} flagged · est. cost impact {fmtEUR0(totalImpact)}</span>
        <div className="right">
          <span className="dfm-summary">
            {counts.error>0&&<span className="chip danger" style={{ height:22 }}><span className="dot"/>{counts.error} blocker</span>}
            {counts.warn>0&&<span className="chip warning" style={{ height:22 }}><span className="dot"/>{counts.warn} caution</span>}
            {counts.info>0&&<span className="chip accent" style={{ height:22 }}><span className="dot"/>{counts.info} info</span>}
          </span>
          <button className="btn sm ghost"><Settings2 size={12}/> Rules</button>
        </div>
      </div>
      {allIssues.length===0?(
        <div className="dfm-empty"><div className="ic-wrap"><ShieldCheck size={18}/></div><div>No design issues flagged. Geometry is within manufacturing limits.</div></div>
      ):(
        <div className="dfm-list">
          {allIssues.map(i => {
            const SevIcon = i.severity==="error"?OctagonX:i.severity==="warn"?TriangleAlert:Info;
            return (
              <div className="dfm-row" key={i.id}>
                <div className={`dfm-sev ${i.severity}`}><SevIcon size={14} strokeWidth={2}/></div>
                <div className="dfm-body">
                  <div className="dfm-title"><span>{i.title}</span><button className="partref" onClick={() => onSelectPart(i.partId)}>{partName(i.partId)}</button></div>
                  <div className="dfm-desc">{i.desc}</div>
                  <div className="dfm-suggest"><Lightbulb size={11}/> {i.suggest}</div>
                </div>
                <div className="dfm-impact"><span className="label">Cost impact</span>+{fmtEUR0(i.impact)}</div>
                <div className="dfm-actions">{i.actionable&&<button className="btn sm">Apply fix</button>}<button className="btn sm ghost">Accept</button></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===========================================================
   Lead time bar
   =========================================================== */

function LeadTimeBar({ lead }: { lead: ReturnType<typeof computeLeadTime> }) {
  const segs = [
    { k: "Queue", v: lead.queue, c: "#b9c1c9" }, { k: "Machining", v: lead.machine, c: "#5d80c9" },
    { k: "Finishing", v: lead.finish, c: "#c9b48f" }, { k: "Ship", v: lead.ship, c: "#9fb6a4" },
  ];
  return (
    <div className="leadtime">
      <div className="lt-head">
        <div className="ship-by"><Truck size={13}/> Ship by {fmtShipDate(lead.shipDate)}</div>
        <div className="days">{lead.total} working days</div>
      </div>
      <div className="lt-bar">{segs.map(s=><span key={s.k} style={{ width:`${(s.v/lead.total)*100}%`,background:s.c }}/>)}</div>
      <div className="lt-stages">{segs.map(s=><div className="lt-stage" key={s.k}><span className="swatch" style={{ background:s.c }}/><span className="label">{s.k}</span><span className="val">{s.v}d</span></div>)}</div>
    </div>
  );
}

/* ===========================================================
   Quantity breaks
   =========================================================== */

const QTY_BREAKS = [1, 10, 25, 100, 250];

function QuantityBreaks({ parts, asmQty, setAsmQty, commercial }: { parts: Part[]; asmQty: number; setAsmQty: (v: number) => void; commercial: { marginPct: number; taxPct: number } }) {
  const breaks = QTY_BREAKS.map(q => { const r = rollup(parts,q,commercial); return { q, total: r.total, unit: q>0?r.total/q:0 }; });
  const baseUnit = breaks[0].unit;
  const currentUnit = asmQty>0?rollup(parts,asmQty,commercial).total/asmQty:0;
  const bestSavings = currentUnit>0?((baseUnit-currentUnit)/baseUnit)*100:0;
  return (
    <div className="qty-breaks">
      <div className="head"><span className="eyebrow">Quantity breaks</span>{bestSavings>0&&<span className="savings">{fmtPct(-bestSavings)} vs qty 1</span>}</div>
      <div className="qty-breaks-grid">
        {breaks.map(b => {
          const delta = baseUnit>0?((b.unit-baseUnit)/baseUnit)*100:0;
          return (
            <div key={b.q} className={`qty-break ${b.q===asmQty?"active":""}`} onClick={() => setAsmQty(b.q)}>
              <div className="qty-val">{b.q}×</div>
              <div className="qty-unit">{fmtEUR0(b.unit)}</div>
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

function Field({ label, value, unit, type="text", onChange, grid }: { label: string; value: string|number; unit?: string; type?: string; onChange?: (v: string|number) => void; grid?: string }) {
  return (
    <div className="field" style={grid?{gridColumn:grid}:undefined}>
      <label>{label}</label>
      <div className={unit?"suffix":undefined}>
        <input type={type} value={value} onChange={e => onChange?.(type==="number"?+e.target.value||0:e.target.value)} className={type==="number"?"num":undefined} style={unit?{paddingRight:38}:undefined}/>
        {unit&&<span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

function RfqRail({ parts, setParts, asmQty, setAsmQty, selectedId, commercial, setCommercial }: {
  parts: Part[]; setParts: (p: Part[]) => void;
  asmQty: number; setAsmQty: (v: number) => void;
  selectedId: string|null;
  commercial: { marginPct: number; taxPct: number }; setCommercial: (v: { marginPct: number; taxPct: number }) => void;
}) {
  const [tab, setTab] = useState<"inputs"|"history"|"notes">("inputs");
  const selected = parts.find(p=>p.id===selectedId)||null;
  function updateSelected(patch: Partial<Part>) { if (!selected) return; setParts(parts.map(p => p.id===selected.id?{...p,...patch}:p)); }

  const r = rollup(parts, asmQty, commercial);
  const totalQty = parts.filter(p=>p.included).reduce((a,p)=>a+partQty(p,asmQty),0);
  const lead = computeLeadTime(parts, asmQty);
  const unit = asmQty>0?r.total/asmQty:0;

  return (
    <div className="panel rfq-panel">
      <div className="panel-head">
        <span className="title">RFQ-2026-014</span>
        <div className="right"><span className="chip"><BoxesIcon size={11}/> Acme Mfg.</span></div>
      </div>
      <div className="tabstrip">
        <button className={tab==="inputs"?"on":""} onClick={()=>setTab("inputs")}><Sliders size={13}/> Inputs</button>
        <button className={tab==="history"?"on":""} onClick={()=>setTab("history")}><Clock size={13}/> History</button>
        <button className={tab==="notes"?"on":""} onClick={()=>setTab("notes")}><ScanLine size={13}/> Notes</button>
      </div>

      <div style={{ flex:1, minHeight:0, overflow:"auto", display:"flex", flexDirection:"column" }}>
        {tab==="inputs"&&(
          <>
            {selected?(
              <div className="selected-bar" style={{ marginTop:10 }}>
                <span className="swatch" style={{ background:selected.color }}/>
                <span className="lbl">Editing</span>
                <span className="pname">{selected.name}</span>
                <span className="meta">#{selected.id}</span>
              </div>
            ):(
              <div className="selected-bar" style={{ marginTop:10, background:"var(--panel-2)", borderColor:"var(--border)", color:"var(--text-3)" }}>
                <MousePointer2 size={12}/>
                <span>Click a body in the preview or table to edit its inputs</span>
              </div>
            )}
            <div className="rfq-fields">
              <Field label="Customer" value="Acme Manufacturing" grid="1/-1"/>
              <Field label="Project" value="Pump Manifold v3"/>
              <Field label="RFQ ref" value="RFQ-2026-014"/>
              {selected&&(
                <>
                  <div className="full" style={{ marginTop:4 }}><div className="eyebrow">Material · {selected.name}</div></div>
                  <div className="field" style={{ gridColumn:"1/-1" }}>
                    <label>Stock</label>
                    <select value={selected.material} onChange={e => updateSelected({material:e.target.value})}>
                      {Object.entries(MATERIALS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <Field label="Rate / kg" value={(MATERIALS[selected.material]?.rate??0).toFixed(2)} type="number" unit="€"/>
                  <Field label="Per assembly" value={selected.perAssembly} type="number" onChange={v=>updateSelected({perAssembly:v as number})}/>
                </>
              )}
            </div>
            {selected&&!selected.stocked&&<MaterialCard materialId={selected.material}/>}
            {selected&&!selected.stocked&&<StockEditor part={selected} onChange={updateSelected}/>}
            {selected&&!selected.stocked&&(
              <>
                <div className="sub-head"><span className="eyebrow">Machining operations</span><span className="muted" style={{ marginLeft:"auto",fontSize:10.5,fontFamily:"var(--font-mono)" }}>qty × {partQty(selected,asmQty)}</span></div>
                <OperationsEditor part={selected} qty={partQty(selected,asmQty)} onChange={updateSelected}/>
              </>
            )}
            {selected&&selected.stocked&&(
              <div style={{ margin:"8px 14px",padding:10,background:"var(--panel-2)",border:"1px dashed var(--border)",borderRadius:6,fontSize:12,color:"var(--text-3)" }}>
                <Package size={12} style={{ verticalAlign:-2,marginRight:6 }}/>
                Purchased part — no in-house machining.
              </div>
            )}
            {selected&&!selected.stocked&&(
              <div className="rfq-fields" style={{ paddingTop:8 }}>
                <div className="full"><div className="eyebrow">Finishing</div></div>
                <Field label="Finishing / unit" value={selected.finishing.toFixed(2)} type="number" unit="€" onChange={v=>updateSelected({finishing:v as number})}/>
              </div>
            )}
            <div className="rfq-fields" style={{ paddingTop:8 }}>
              <div className="full"><div className="eyebrow">Commercial · whole quote</div></div>
              <Field label="Margin" value={commercial.marginPct} type="number" unit="%" onChange={v=>setCommercial({...commercial,marginPct:v as number})}/>
              <Field label="Tax" value={commercial.taxPct} type="number" unit="%" onChange={v=>setCommercial({...commercial,taxPct:v as number})}/>
            </div>
            <div className="asm-qty-row" style={{ marginTop:10 }}>
              <span className="lbl">Assembly qty</span>
              <span className="muted" style={{ fontSize:10.5,fontFamily:"var(--font-mono)" }}>{totalQty} parts total</span>
              <input type="number" min="1" value={asmQty} onChange={e=>setAsmQty(Math.max(1,+e.target.value||1))}/>
            </div>
            <QuantityBreaks parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial}/>
            <LeadTimeBar lead={lead}/>
            <div style={{ height:10 }}/>
          </>
        )}
        {tab==="history"&&(
          <div className="recents">
            {[
              { name:"Pump Manifold v3 · current draft", num:"Q-026-014 · rev C", amt:fmtEUR(r.total), date:"Now" },
              { name:"Pump Manifold v3 · rev B", num:"Q-026-014 · rev B", amt:"€ 4,640.00", date:"May 12" },
              { name:"Pump Manifold v2", num:"Q-025-204", amt:"€ 4,210.00", date:"Apr 28" },
            ].map((r2,i) => (
              <div key={r2.num} className="recent" style={i===0?{background:"var(--accent-soft)"}:undefined}>
                <div className="name">{r2.name}</div><div className="amt">{r2.amt}</div>
                <div className="meta">{r2.num}</div><div className="date">{r2.date}</div>
              </div>
            ))}
          </div>
        )}
        {tab==="notes"&&(
          <div style={{ padding:14 }}>
            <textarea rows={10} defaultValue={"• Confirm finish: bead-blast or anodized clear.\n• 6 mm thread depth in cap — verify drawing rev C.\n• Lead-time 12 working days from PO."} style={{ width:"100%",padding:10,resize:"none",background:"var(--panel-2)",border:"1px solid var(--border)",borderRadius:6,fontFamily:"var(--font-sans)",fontSize:12.5,color:"var(--text-1)",outline:0 }}/>
          </div>
        )}
      </div>

      <div className="asm-qty-row">
        <span className="lbl">Assembly qty</span>
        <span className="muted" style={{ fontSize:10.5,fontFamily:"var(--font-mono)" }}>{totalQty} parts total</span>
        <input type="number" min="1" value={asmQty} onChange={e=>setAsmQty(Math.max(1,+e.target.value||1))}/>
      </div>
      <QuantityBreaks parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial}/>
      <LeadTimeBar lead={lead}/>

      <div className="total-panel big" style={{ marginTop:12 }}>
        <div className="total-row">
          <span className="label">Quotation total</span>
          <span className="chip success"><span className="dot"/>Within target</span>
        </div>
        <div className="duo">
          <div className="cell"><div className="label">Total</div><div className="value">{fmtEUR(r.total)}</div><div className="sub">{asmQty} assemblies</div></div>
          <div className="cell right"><div className="label">Per unit</div><div className="value">{fmtEUR(unit)}</div><div className="sub">incl. {commercial.marginPct}% margin</div></div>
        </div>
        <div className="total-actions">
          <button className="btn block primary"><FileDown size={14}/> Export PDF</button>
          <button className="btn block"><Save size={14}/> Save</button>
          <button className="btn" title="Send"><Send size={14}/></button>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   Quote workspace
   =========================================================== */

function QuoteWorkspace({ searchQuery }: { searchQuery: string }) {
  const [parts, setParts] = useState<Part[]>(INITIAL_PARTS);
  const [selectedId, setSelectedId] = useState<string|null>("body-cap");
  const [asmQty, setAsmQty] = useState(25);
  const [commercial, setCommercial] = useState({ marginPct: 18, taxPct: 0 });

  const r = rollup(parts, asmQty, commercial);
  const lead = computeLeadTime(parts, asmQty);

  const cat = { material: 0, machine: 0, setup: 0, finish: 0 };
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p,asmQty);
    cat.material += partMaterialCost(p,asmQty);
    cat.finish   += partFinishCost(p,asmQty);
    (p.operations||[]).forEach(op => {
      const rate = MACHINES[op.machine]?.rate??0;
      cat.setup   += (op.setupMin/60)*rate;
      cat.machine += (op.cycleMin/60)*rate*qty;
    });
  });

  const machineBreakdown: Record<string,{cost:number;mins:number}> = {};
  parts.forEach(p => {
    if (!p.included) return;
    const qty = partQty(p,asmQty);
    (p.operations||[]).forEach(op => {
      const rate = MACHINES[op.machine]?.rate??0, cost=(op.setupMin/60)*rate+(op.cycleMin/60)*rate*qty, mins=op.setupMin+op.cycleMin*qty;
      machineBreakdown[op.machine] = machineBreakdown[op.machine]||{cost:0,mins:0};
      machineBreakdown[op.machine].cost += cost;
      machineBreakdown[op.machine].mins += mins;
    });
  });
  const machineRows = Object.entries(machineBreakdown).sort((a,b)=>b[1].cost-a[1].cost);

  const segs = [
    { k:"Material", v:cat.material, c:"#5d80c9" }, { k:"Machining", v:cat.machine, c:"#7b95c0" },
    { k:"Setup", v:cat.setup, c:"#9aabc7" }, { k:"Finishing", v:cat.finish, c:"#c9b48f" },
    { k:"Tooling", v:r.tooling, c:"#c7c2b4" }, { k:"Inspection", v:r.inspection, c:"#9fb6a4" },
    { k:"Margin", v:r.margin, c:"#5fa05f" },
  ];
  const segsTotal = segs.reduce((a,s)=>a+s.v,0)||1;
  const totalMachineMin = parts.filter(p=>p.included).reduce((a,p)=>a+(p.operations||[]).reduce((b,op)=>b+opMinutes(op,partQty(p,asmQty)),0),0);

  return (
    <div className="quote-grid">
      <div className="panel preview-panel">
        <div className="panel-head">
          <span className="title">Part preview</span>
          <span className="sub">Pump Manifold v3.step · 128.4 × 86.2 × 42.6 mm</span>
          <div className="right">
            <span className="chip warning"><span className="dot"/>{DFM_ISSUES.length} DFM issues</span>
            <button className="btn sm ghost"><ExternalLink size={12}/> Open in viewer</button>
          </div>
        </div>
        <QuotePreview parts={parts} selectedId={selectedId} onSelect={setSelectedId}/>
        <div className="metric-strip">
          <div><div className="label"><BoxesIcon size={12}/> Bodies</div><div className="value">{parts.filter(p=>p.included).length}<span className="muted" style={{ fontSize:11 }}> / {parts.length}</span></div></div>
          <div><div className="label"><Scale size={12}/> Total mass</div><div className="value">{parts.filter(p=>p.included).reduce((a,p)=>a+p.mass*partQty(p,asmQty),0).toFixed(2)} <span className="muted" style={{ fontSize:11 }}>kg</span></div></div>
          <div><div className="label"><Clock size={12}/> Machine time</div><div className="value">{fmtMin(totalMachineMin)} <span className="muted" style={{ fontSize:11 }}>min</span></div></div>
          <div><div className="label"><Truck size={12}/> Ship</div><div className="value" style={{ fontSize:13 }}>{fmtShipDate(lead.shipDate)}</div></div>
        </div>
      </div>

      <RfqRail parts={parts} setParts={setParts} asmQty={asmQty} setAsmQty={setAsmQty} selectedId={selectedId} commercial={commercial} setCommercial={setCommercial}/>

      <PartsTable parts={parts} setParts={setParts} asmQty={asmQty} selectedId={selectedId} onSelect={setSelectedId} searchQuery={searchQuery}/>

      <DfmPanel parts={parts} onSelectPart={setSelectedId} asmQty={asmQty}/>

      <div className="panel cost-panel">
        <div className="panel-head">
          <span className="title">Cost breakdown</span>
          <span className="sub">Subtotal {fmtEUR(r.subtotal)} · Margin {fmtEUR(r.margin)}</span>
          <div className="right">
            <button className="btn sm ghost"><Copy size={12}/> Duplicate</button>
            <button className="btn sm ghost"><Settings2 size={12}/> Rate card</button>
          </div>
        </div>
        <div className="margin-bar">{segs.map(s=><span key={s.k} style={{ width:`${(s.v/segsTotal)*100}%`,background:s.c }}/>)}</div>
        <div className="margin-legend">{segs.map(s=><span key={s.k}><span className="dot" style={{ background:s.c }}/>{s.k}<span className="v">{fmtEUR(s.v)}</span></span>)}</div>
        <div className="cost-grid">
          <div className="cost-row left"><span className="k">Parts subtotal</span><span className="v">{fmtEUR(r.partsCost)}</span></div>
          <div className="cost-row right"><span className="k">Tooling · amortized</span><span className="v">{fmtEUR(r.tooling)}</span></div>
          <div className="cost-row left"><span className="k">Inspection · batch</span><span className="v">{fmtEUR(r.inspection)}</span></div>
          <div className="cost-row right"><span className="k">Margin · {commercial.marginPct}%</span><span className="v">{fmtEUR(r.margin)}</span></div>
          <div className="cost-row left total"><span className="k">Subtotal</span><span className="v">{fmtEUR(r.subtotal)}</span></div>
          <div className="cost-row right total"><span className="k">Quotation total</span><span className="v">{fmtEUR(r.total)}</span></div>
        </div>
        {machineRows.length>0&&(
          <>
            <div style={{ padding:"10px 14px 4px",borderTop:"1px solid var(--divider)" }}><div className="eyebrow">Machine utilization</div></div>
            <div style={{ padding:"0 14px 16px" }}>
              {machineRows.map(([m,info]) => {
                const pct = r.partsCost>0?(info.cost/r.partsCost)*100:0;
                return (
                  <div key={m} style={{ display:"grid",gridTemplateColumns:"120px 1fr 80px 80px",alignItems:"center",gap:10,padding:"6px 0",fontSize:12 }}>
                    <span style={{ color:"var(--text-2)" }}>{MACHINES[m]?.label||m}</span>
                    <div style={{ height:6,background:"var(--panel-3)",borderRadius:99,overflow:"hidden" }}><div style={{ width:`${Math.min(pct,100)}%`,height:"100%",background:"var(--accent)" }}/></div>
                    <span className="mono muted" style={{ textAlign:"right",fontSize:11 }}>{fmtMin(info.mins)} min</span>
                    <span className="mono" style={{ textAlign:"right",fontSize:12 }}>{fmtEUR(info.cost)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===========================================================
   Dashboard (root)
   =========================================================== */

declare global {
  interface Window {
    __focusGlobalSearch?: () => void;
  }
}

export function Dashboard() {
  const [workspace, setWorkspace] = useState<"viewer"|"quote">("quote");
  const quoteState = "draft";
  const searchQuery = "";
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cad, setCad] = useState<CadImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setStatus] = useState("Import a STEP file to get started");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag==="input"||tag==="textarea"||tag==="select"||(e.target as HTMLElement)?.isContentEditable;
      if (e.key==="/"&&!inField) { e.preventDefault(); window.__focusGlobalSearch?.(); return; }
      if (e.key==="?"&&!inField) { e.preventDefault(); setShortcutsOpen(o=>!o); return; }
      if (inField) return;
      if (e.key.toLowerCase()==="v") setWorkspace("viewer");
      if (e.key.toLowerCase()==="q") setWorkspace("quote");
      if (e.key==="Escape") setShortcutsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsImporting(true); setStatus(`Importing ${file.name}`);
    try {
      const result = await importStepFile(file);
      setCad(result); setStatus("STEP geometry imported");
    } catch (e) { setStatus(e instanceof Error?e.message:"Import failed"); }
    finally { setIsImporting(false); }
  };

  const handleTestFile = async (fileName: string) => {
    setIsImporting(true); setStatus(`Loading ${fileName}`);
    try {
      const result = await importStepUrl(fileName, `/test_files/${encodeURIComponent(fileName)}`);
      setCad(result); setStatus("Test file imported");
    } catch (e) { setStatus(e instanceof Error?e.message:"Import failed"); }
    finally { setIsImporting(false); }
  };

  const subText = workspace==="viewer"
    ? (cad?`${cad.meshes.length} bodies · ${(cad.geometry.faceCount??0).toLocaleString()} triangles`:importStatus)
    : `${quoteState==="draft"?"Draft":"Quote"} · revision C${searchQuery?` · filter: "${searchQuery}"`:""} `;

  return (
    <>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">{workspace==="viewer"?"Pump Manifold v3":"Quote · Pump Manifold v3"}</h1>
            <div className="page-sub">
              <span className="status-dot"/>
              <span>{subText}</span>
              <span style={{ color:"var(--text-4)" }}>•</span>
              <span className="quote-num">RFQ-2026-014</span>
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <button className="btn ghost sm" onClick={() => setShortcutsOpen(true)}><Command size={13}/> Shortcuts</button>
            <button className="btn sm"><Share2 size={13}/> Share</button>
            <div className="seg">
              <button className={workspace==="viewer"?"on":""} onClick={() => setWorkspace("viewer")}>
                <Box size={13}/> Viewer <span className="kbd-key" style={{ marginLeft:6,fontSize:9,padding:"1px 4px",minWidth:0 }}>V</span>
              </button>
              <button className={workspace==="quote"?"on":""} onClick={() => setWorkspace("quote")}>
                <Calculator size={13}/> Quote <span className="kbd-key" style={{ marginLeft:6,fontSize:9,padding:"1px 4px",minWidth:0 }}>Q</span>
              </button>
            </div>
          </div>
        </div>

        {workspace==="viewer"
          ? <ViewerWorkspace cad={cad} isImporting={isImporting} onFile={handleFile} onLoadTestFile={handleTestFile}/>
          : <QuoteWorkspace searchQuery={searchQuery}/>
        }
      </div>
      {shortcutsOpen && <KbdOverlay onClose={() => setShortcutsOpen(false)}/>}
    </>
  );
}
