import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  Box,
  BoxesIcon,
  ChevronDown,
  Eye,
  EyeOff,
  FileCheck2,
  Focus,
  Gem,
  ScanLine,
  Settings2,
  X,
} from "lucide-react";
import { TbRulerMeasure } from "react-icons/tb";
import {
  IsoViewIcon,
  FrontViewIcon,
  TopViewIcon,
  RightViewIcon,
  ShadedIcon,
  WireframeIcon,
  EdgesIcon,
  MeasureIcon,
  SectionIcon,
  ExplodeIcon,
  FitViewIcon,
  OpenFileIcon,
  ScreenshotIcon,
} from "@components/ViewIcons";
import { CadViewer, type CadViewerHandle } from "@components/CadViewer";
import type { CadImportResult, CadMesh } from "@utils/index";
import { analyzeShape, type ShapeAnalysis } from "@utils/shapeAnalysis";

export function ViewerWorkspace({ cad, isImporting, onFile }: {
  cad: CadImportResult | null;
  isImporting: boolean;
  onFile: (file?: File) => Promise<void>;
}) {
  const viewerRef = useRef<CadViewerHandle | null>(null);
  const [leftTab, setLeftTab] = useState<"bodies" | "materials">("bodies");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [displayMode, setDisplayMode] = useState<"solid" | "wireframe">("solid");
  const [showEdges, setShowEdges] = useState(true);
  const [orientation, setOrientation] = useState("iso");
  const [measureActive, setMeasureActive] = useState(false);
  const [measuredMm, setMeasuredMm] = useState<number | null>(null);
  const [measureStep, setMeasureStep] = useState<0 | 1>(0);
  const [selectionFilter, setSelectionFilter] = useState<"body" | "point">("body");
  const [bodyMeasure, setBodyMeasure] = useState<{ analysis: ShapeAnalysis; meshId: string } | null>(null);
  const [preIsolateHidden, setPreIsolateHidden] = useState<Set<string> | null>(null);
  const [explodeActive, setExplodeActive] = useState(false);
  const [explodeMaster, setExplodeMaster] = useState(0);
  const [explodeTrim, setExplodeTrim] = useState({ x: 1, y: 1, z: 1 });
  const explode = useMemo(() => ({
    x: explodeMaster * explodeTrim.x,
    y: explodeMaster * explodeTrim.y,
    z: explodeMaster * explodeTrim.z,
  }), [explodeMaster, explodeTrim]);

  const toggleMeasure = useCallback(() => {
    setMeasureActive(v => {
      if (v) { viewerRef.current?.clearMeasure(); setMeasuredMm(null); setMeasureStep(0); setBodyMeasure(null); }
      return !v;
    });
  }, []);

  const handleMeasured = useCallback((mm: number) => {
    setMeasuredMm(mm);
    setMeasureStep(0);
  }, []);

  const handleBodyMeasure = useCallback((analysis: ShapeAnalysis, meshId: string) => {
    setBodyMeasure({ analysis, meshId });
  }, []);

  const toggleIsolate = useCallback(() => {
    if (!cad || !selectedId) return;
    if (preIsolateHidden !== null) {
      setHiddenIds(preIsolateHidden);
      setPreIsolateHidden(null);
    } else {
      setPreIsolateHidden(hiddenIds);
      setHiddenIds(new Set(cad.meshes.filter(m => m.id !== selectedId).map(m => m.id)));
      setTimeout(() => viewerRef.current?.fit(selectedId), 0);
    }
  }, [cad, selectedId, hiddenIds, preIsolateHidden]);


  // Exit isolate when selection changes
  useEffect(() => {
    setPreIsolateHidden(prev => {
      if (prev !== null) setHiddenIds(prev);
      return null;
    });
  }, [selectedId]);

  // Reset viewer state on new file load
  useEffect(() => {
    setHiddenIds(new Set());
    setSelectedId(undefined);
    setPreIsolateHidden(null);
    setBodyMeasure(null);
    setMeasuredMm(null);
    setMeasureActive(false);
    setMeasureStep(0);
    setExplodeActive(false);
    setExplodeMaster(0);
    setExplodeTrim({ x: 1, y: 1, z: 1 });
  }, [cad]);

  const clippingPlane = null;

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
          <button className={leftTab === "bodies" ? "on" : ""} onClick={() => setLeftTab("bodies")}><BoxesIcon size={13} /> Parts Tree</button>
          <button className={leftTab === "materials" ? "on" : ""} onClick={() => setLeftTab("materials")}><Gem size={13} /> Materials</button>
        </div>

        <div className="tree-section">
          {leftTab === "bodies" && (
            cad ? (
              <div className="tree-group">
                <div className="tree-group-head">
                  <span className="chev"><ChevronDown size={12} /></span>
                  <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cad.fileName.replace(/\.[^.]+$/, "")}</span>
                  <span className="count">{cad.meshes.length}</span>
                  <button
                    className="eye-all"
                    title={cad.meshes.every(m => hiddenIds.has(m.id)) ? "Show all" : "Hide all"}
                    onClick={e => {
                      e.stopPropagation();
                      const allHidden = cad.meshes.every(m => hiddenIds.has(m.id));
                      setHiddenIds(allHidden ? new Set() : new Set(cad.meshes.map(m => m.id)));
                    }}
                  >
                    {cad.meshes.every(m => hiddenIds.has(m.id))
                      ? <EyeOff size={12} />
                      : <Eye size={12} />}
                  </button>
                </div>
                {cad.meshes.map(m => {
                  const hidden = hiddenIds.has(m.id);
                  return (
                    <div key={m.id} className={`tree-row ${selectedId === m.id ? "sel" : ""} ${hidden ? "hidden" : ""}`}
                      onClick={() => { setSelectedId(m.id); viewerRef.current?.fit(m.id); }}>
                      <span className="swatch" style={{ background: m.color }} />
                      <span className="name">{m.name}</span>
                      <button className="eye" title={hidden ? "Show" : "Hide"} onClick={e => { e.stopPropagation(); toggleHide(m.id); }}>
                        {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ padding: "16px 12px", color: "var(--text-3)", fontSize: 12 }}>No bodies loaded</div>
          )}

          {leftTab === "materials" && (
            <div style={{ padding: "6px 10px" }}>
              {uniqueColors.map(m => (
                <div className="kv" key={m.id} style={{ borderBottom: "1px dashed var(--divider)", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, background: m.color, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 3, flexShrink: 0 }} />
                    <span style={{ fontSize: 12 }}>{m.name}</span>
                  </div>
                  <span className="v" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{m.color.replace("#", "").toUpperCase()}</span>
                </div>
              ))}
              {uniqueColors.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 12 }}>No materials loaded</div>}
            </div>
          )}
        </div>

        {cad && (
          <div className="left-foot">
            <div className="file">
              <span className="ic"><FileCheck2 size={14} /></span>
              <span className="name">{cad.fileName}</span>
              <span className="units">mm</span>
            </div>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="panel canvas-col">
        <div className="toolbar">
          <div className="tool-group">
            <label className="tool-btn" title="Open file" style={{ cursor: "pointer" }}>
              <OpenFileIcon size={22} />
              <input type="file" accept=".step,.stp" style={{ display: "none" }} onChange={e => void onFile(e.target.files?.[0])} />
            </label>
            <button className="tool-btn" title="Screenshot" onClick={async () => {
              const url = viewerRef.current?.screenshot();
              if (!url) return;
              const filePath = await save({
                title: "Save screenshot",
                defaultPath: `viewport-${Date.now()}.png`,
                filters: [{ name: "PNG Image", extensions: ["png"] }],
              });
              if (!filePath) return;
              const base64 = url.split(",")[1];
              const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
              await writeFile(filePath, bytes);
            }}><ScreenshotIcon size={22} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-btn" title="Fit to view" onClick={() => viewerRef.current?.fit()}><FitViewIcon size={22} /></button>
            <button className={`tool-btn ${orientation === "iso" ? "on" : ""}`} title="Isometric view" onClick={() => { setOrientation("iso"); viewerRef.current?.setOrientation("iso"); }}><IsoViewIcon size={22} /></button>
            <button className={`tool-btn ${orientation === "front" ? "on" : ""}`} title="Front view" onClick={() => { setOrientation("front"); viewerRef.current?.setOrientation("front"); }}><FrontViewIcon size={22} /></button>
            <button className={`tool-btn ${orientation === "top" ? "on" : ""}`} title="Top view" onClick={() => { setOrientation("top"); viewerRef.current?.setOrientation("top"); }}><TopViewIcon size={22} /></button>
            <button className={`tool-btn ${orientation === "right" ? "on" : ""}`} title="Right view" onClick={() => { setOrientation("right"); viewerRef.current?.setOrientation("right"); }}><RightViewIcon size={22} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className={`tool-btn ${displayMode === "solid" ? "on" : ""}`} onClick={() => setDisplayMode("solid")} title="Shaded"><ShadedIcon size={22} /></button>
            <button className={`tool-btn ${displayMode === "wireframe" ? "on" : ""}`} onClick={() => setDisplayMode("wireframe")} title="Wireframe"><WireframeIcon size={22} /></button>
            <button className={`tool-btn ${showEdges ? "on" : ""}`} onClick={() => setShowEdges(!showEdges)} title="Show edges"><EdgesIcon size={22} /></button>
          </div>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className="tool-btn" title="Coming soon" disabled style={{ cursor: "not-allowed", opacity: 0.4 }}><SectionIcon size={22} /></button>
            <button className={`tool-btn ${preIsolateHidden !== null ? "on" : ""}`} title={preIsolateHidden !== null ? "Exit isolate" : "Isolate selected"} onClick={toggleIsolate} disabled={!cad || !selectedId}><Focus size={18} /></button>
            <button className={`tool-btn ${measureActive ? "on" : ""}`} title="Measure distance" onClick={toggleMeasure} disabled={!cad}><MeasureIcon size={22} /></button>
            <button className={`tool-btn ${explodeActive ? "on" : ""}`} title="Explode view" onClick={() => { setExplodeActive(v => { if (v) { setExplodeMaster(0); setExplodeTrim({ x: 1, y: 1, z: 1 }); } return !v; }); }} disabled={!cad}><ExplodeIcon size={22} /></button>
          </div>
          <div className="right">
            <span className="tool-label">mm · ISO</span>
          </div>
        </div>


        {explodeActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: "var(--panel-2)", borderBottom: "1px solid var(--divider)", fontSize: 12 }}>
            <span style={{ color: "var(--text-3)" }}>Explode</span>
            <input type="range" min={0} max={2} step={0.01} value={explodeMaster}
              onChange={e => setExplodeMaster(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)", minWidth: 38, textAlign: "right" }}>{Math.round(explodeMaster * 100)}%</span>

            <span style={{ color: "var(--text-3)", marginLeft: 8 }}>Trim</span>
            {(["x", "y", "z"] as const).map(axis => (
              <div key={axis} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ color: "var(--text-2)", textTransform: "uppercase", fontFamily: "var(--font-mono)", width: 10 }}>{axis}</span>
                <input type="range" min={0} max={2} step={0.01} value={explodeTrim[axis]}
                  onChange={e => setExplodeTrim(prev => ({ ...prev, [axis]: Number(e.target.value) }))}
                  style={{ width: 64, accentColor: "var(--accent)" }} />
              </div>
            ))}
            <button className="btn sm ghost" style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => setExplodeTrim({ x: 1, y: 1, z: 1 })}>Reset</button>
            <button className="tool-btn" title="Close explode" onClick={() => { setExplodeActive(false); setExplodeMaster(0); setExplodeTrim({ x: 1, y: 1, z: 1 }); }}><X size={13} /></button>
          </div>
        )}

        {measureActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", background: "var(--panel-2)", borderBottom: "1px solid var(--divider)", fontSize: 12 }}>
            <TbRulerMeasure size={14} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
            <div style={{ display: "flex", gap: 2, background: "var(--panel-3)", borderRadius: 5, padding: 2 }}>
              <button className={`btn sm ${selectionFilter === "body" ? "" : "ghost"}`} style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => { setSelectionFilter("body"); setBodyMeasure(null); viewerRef.current?.clearMeasure(); setMeasuredMm(null); setMeasureStep(0); }}>Body</button>
              <button className={`btn sm ${selectionFilter === "point" ? "" : "ghost"}`} style={{ padding: "1px 8px", fontSize: 11 }} onClick={() => { setSelectionFilter("point"); setBodyMeasure(null); }}>Point</button>
            </div>
            {selectionFilter === "body" ? (
              bodyMeasure === null
                ? <span style={{ color: "var(--text-2)" }}>Click a body to inspect</span>
                : (() => {
                    const { analysis } = bodyMeasure;
                    const fmt = (v: number) => `${v.toFixed(2)} mm`;
                    let label = "";
                    if (analysis.kind === "cylinder") label = `Ø ${fmt(analysis.outerDiaMm)}${analysis.innerDiaMm != null ? ` · Inner Ø ${fmt(analysis.innerDiaMm)}` : ""} · Length ${fmt(analysis.lengthMm)}`;
                    else if (analysis.kind === "hex") label = `Hex AF ${fmt(analysis.afMm)} · Length ${fmt(analysis.lengthMm)}`;
                    else label = `${fmt(analysis.xMm)} × ${fmt(analysis.yMm)} × ${fmt(analysis.zMm)}`;
                    return <>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-1)" }}>{label}</span>
                      <button className="btn sm ghost" onClick={() => setBodyMeasure(null)}>Clear</button>
                    </>;
                  })()
            ) : (
              measuredMm === null
                ? <span style={{ color: "var(--text-2)" }}>{measureStep === 0 ? "Click first point on the model" : "Click second point"}</span>
                : <>
                    <span style={{ color: "var(--text-2)" }}>Distance:</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-1)" }}>{measuredMm.toFixed(2)} mm</span>
                    <button className="btn sm ghost" onClick={() => { viewerRef.current?.clearMeasure(); setMeasuredMm(null); setMeasureStep(0); }}>Clear</button>
                  </>
            )}
            <button className="tool-btn" style={{ marginLeft: "auto" }} title="Close measure" onClick={toggleMeasure}><X size={13} /></button>
          </div>
        )}

        {cad ? (
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <CadViewer
              ref={viewerRef}
              model={cad}
              selectedMeshId={selectedId}
              hiddenMeshIds={hiddenIds}
              displayMode={displayMode}
              viewportTheme="light"
              explode={explode}
              showEdges={showEdges}
              clippingPlane={clippingPlane}
              measureMode={measureActive}
              selectionFilter={selectionFilter}
              onMeasured={handleMeasured}
              onBodyMeasure={handleBodyMeasure}
              onSelectMesh={id => { if (!measureActive) { setSelectedId(id); setMeasureStep(0); } else if (selectionFilter === "point") { setMeasureStep(s => s === 0 ? 1 : 0); } }}
            />
            <div className="canvas-hud-top">
              <span className="pill"><Box size={11} /> {cad.fileName}</span>
              <span className="pill">{cad.meshes.length} bodies</span>
            </div>
            <div className="canvas-hud-bot">
              <button className="zoom-btn" onClick={() => viewerRef.current?.fit()}><FitViewIcon size={14} /></button>
            </div>
          </div>
        ) : (
          <div className="viewer-drop">
            <label className="drop-card" style={{ cursor: "pointer" }}>
              <div className="drop-ic"><OpenFileIcon size={20} /></div>
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
                    <div className="value">{((geo.volumeMm3 ?? 0) / 1000).toFixed(2)} <span className="muted">cm³</span></div>
                  </div>
                  <div className="insp-tile">
                    <div className="label">Surface</div>
                    <div className="value">{((geo.surfaceAreaMm2 ?? 0) / 100).toFixed(2)} <span className="muted">cm²</span></div>
                  </div>
                </div>
                <div className="kv"><span className="k">Bounding · X</span><span className="v">{(geo.boundingBoxMm?.x ?? 0).toFixed(2)} mm</span></div>
                <div className="kv"><span className="k">Bounding · Y</span><span className="v">{(geo.boundingBoxMm?.y ?? 0).toFixed(2)} mm</span></div>
                <div className="kv"><span className="k">Bounding · Z</span><span className="v">{(geo.boundingBoxMm?.z ?? 0).toFixed(2)} mm</span></div>
              </div>
              <div className="insp-section">
                <h4>Mesh</h4>
                <div className="kv"><span className="k">Bodies</span><span className="v">{cad?.meshes.length ?? 0}</span></div>
                <div className="kv"><span className="k">Vertices</span><span className="v">{(geo.vertexCount ?? 0).toLocaleString()}</span></div>
                <div className="kv"><span className="k">Triangles</span><span className="v">{(geo.faceCount ?? 0).toLocaleString()}</span></div>
              </div>
            </>
          ) : (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
              Load a STEP file to view geometry details
            </div>
          )}

          {selectedMesh && (() => {
            const shape = analyzeShape(selectedMesh.geometry);
            const mm = (v: number) => <><span style={{ fontFamily: "var(--font-mono)" }}>{v.toFixed(2)}</span><span style={{ color: "var(--text-4)", fontSize: 10, marginLeft: 3 }}>mm</span></>;
            return (
              <>
                <div className="insp-section" style={{ paddingBottom: 14 }}>
                  <h4>Selection</h4>
                </div>
                <div className="insp-selection">
                  <div className="row1">
                    <span className="swatch" style={{ background: selectedMesh.color }} />
                    <span className="name">{selectedMesh.name}</span>
                    <span className="id">
                      {shape.kind === "cylinder" ? "⌀ cyl" : shape.kind === "hex" ? "⬡ hex" : "▭ box"}
                    </span>
                  </div>
                  <div className="grid">
                    {shape.kind === "cylinder" && <>
                      <span className="k">Outer Ø</span><span className="v">{mm(shape.outerDiaMm)}</span>
                      {shape.innerDiaMm != null && <><span className="k">Inner Ø</span><span className="v">{mm(shape.innerDiaMm)}</span></>}
                      <span className="k">Length</span><span className="v">{mm(shape.lengthMm)}</span>
                    </>}
                    {shape.kind === "hex" && <>
                      <span className="k">AF</span><span className="v">{mm(shape.afMm)}</span>
                      <span className="k">Length</span><span className="v">{mm(shape.lengthMm)}</span>
                    </>}
                    {shape.kind === "box" && <>
                      <span className="k">X</span><span className="v">{mm(shape.xMm)}</span>
                      <span className="k">Y</span><span className="v">{mm(shape.yMm)}</span>
                      <span className="k">Z</span><span className="v">{mm(shape.zMm)}</span>
                    </>}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
