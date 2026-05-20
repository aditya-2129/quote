import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCad } from "@context/CadContext";
import { useCatalog } from "@context/CatalogContext";
import { useQuoteState } from "@context/QuoteStateContext";
import { cadResultToParts } from "@utils/cadHandoff";
import { colorForMaterial } from "@utils/format";
import type { Part } from "@utils/quoteTypes";
import { PartsTable } from "./QuoteDetail/PartsTable";
import { RfqRail } from "./QuoteDetail/RfqRail";
import { CostPanel } from "./QuoteDetail/CostPanel";
import { BopSection } from "./QuoteDetail/BopSection";
import { ExtraCostsSection } from "./QuoteDetail/ExtraCostsSection";
import { QuotePreview, QuoteCadPreview } from "./QuoteDetail/Previews";
import type { CadImportResult } from "@utils/index";
import type { QuotePreviewViewerHandle } from "@components/QuotePreviewViewer";
import { Box, Boxes, ChevronDown, ChevronRight, ExternalLink, Square, TriangleAlert, X } from "lucide-react";

declare global {
  interface Window {
    __focusGlobalSearch?: () => void;
  }
}

function QuoteWorkspace({ searchQuery, onOpenViewer }: { searchQuery: string; onOpenViewer: () => void }) {
  const { cad, pendingHandoff, consumeHandoff } = useCad();
  const { materials, materialLabel } = useCatalog();
  const { parts, setParts, bops, setBops, extraCosts, setExtraCosts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, saveQuote, persistenceStatus, rfq, projectNameSource, setProjectAuto, savedCadFileName } = useQuoteState();
  const [reattachPrompt, setReattachPrompt] = useState<{ incomingFile: string; existingFile: string } | null>(null);
  const [wasLoading, setWasLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const previewViewerRef = useRef<QuotePreviewViewerHandle | null>(null);
  const getCadSnapshot = useCallback(() => previewViewerRef.current?.screenshot?.() ?? null, []);
  const [previewCollapsed, setPreviewCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("quote.previewCollapsed") === "1"; } catch { return false; }
  });

  if (persistenceStatus === "loading" && !wasLoading) {
    setWasLoading(true);
  }
  const loadSettled = wasLoading && persistenceStatus !== "loading";

  useEffect(() => {
    try { localStorage.setItem("quote.previewCollapsed", previewCollapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [previewCollapsed]);

  const getAutoProjectName = useCallback((fileName: string) => {
    const base = fileName.replace(/\.[^.]+$/, "").trim() || fileName;
    const projectEmpty = !rfq.project.trim();
    return projectEmpty || projectNameSource === "auto" ? base : rfq.project;
  }, [projectNameSource, rfq.project]);

  const applyAutoProjectName = useCallback((fileName: string) => {
    const nextProject = getAutoProjectName(fileName);
    if (nextProject !== rfq.project) setProjectAuto(nextProject);
  }, [getAutoProjectName, rfq.project, setProjectAuto]);

  const completeHandoff = useCallback((replaceExisting: boolean) => {
    if (!cad) return;
    const imported = cadResultToParts(consumeHandoff()!);
    const keep = replaceExisting ? parts.filter(p => !p.meshIds || p.meshIds.length === 0) : parts;
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
    }).catch(() => {});
  }, [applyAutoProjectName, cad, consumeHandoff, getAutoProjectName, parts, projectNameSource, rfq, saveQuote, setParts, setSelectedId]);

  useEffect(() => {
    if (!pendingHandoff || !cad) return;
    if (!loadSettled) return;
    if (savedCadFileName && savedCadFileName !== cad.fileName) {
      setTimeout(() => {
        setReattachPrompt(prev => prev ?? { incomingFile: cad.fileName, existingFile: savedCadFileName });
      }, 0);
      return;
    }
    completeHandoff(false);
  }, [pendingHandoff, loadSettled, savedCadFileName, cad, completeHandoff]);

  const addManualPart = useCallback(() => {
    const defaultMaterial = Object.entries(materials).find(([, m]) => m.isActive && !m.isPurchased)?.[0] ?? Object.keys(materials)[0] ?? "";
    const id = `part-${crypto.randomUUID()}`;
    const nextIndex = parts.length + 1;
    const newPart: Part = { id, name: `Part ${nextIndex}`, color: colorForMaterial(defaultMaterial || id), material: defaultMaterial, materialLabelSnapshot: materialLabel(defaultMaterial), perAssembly: 1, mass: 0, finishing: 0, included: true, stocked: false, stock: null, operations: [] };
    setParts([...parts, newPart]);
    setSelectedId(id);
  }, [materials, materialLabel, parts, setParts, setSelectedId]);

  return (
    <>
      <div className="quote-grid">
        <div className="right-col">
          <div className={`panel preview-panel ${previewCollapsed ? "collapsed" : ""}`}>
            <div className={`panel-head ${previewCollapsed ? "preview-head-collapsed" : ""}`} onClick={previewCollapsed ? () => setPreviewCollapsed(false) : undefined} style={previewCollapsed ? { cursor: "pointer" } : undefined} title={previewCollapsed ? "Click to expand preview" : undefined}>
              <button className="preview-collapse-toggle" onClick={e => { e.stopPropagation(); setPreviewCollapsed(v => !v); }} title={previewCollapsed ? "Expand preview" : "Collapse preview"} aria-expanded={!previewCollapsed}>{previewCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
              <Box size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="title">Preview</span>
              {previewCollapsed && (() => { const sel = parts.find(p => p.id === selectedId); return sel ? <span className="preview-sel-chip"><span className="swatch" style={{ background: sel.color }} />{sel.name}</span> : <span className="muted" style={{ fontSize: 11, color: "var(--text-3)" }}>click to view</span>; })()}
              <div className="right" style={{ gap: 6 }}>
                {cad && !previewCollapsed && (
                  <button onClick={() => setShowAll(v => !v)} title={showAll ? "Show only the selected part" : "Show the full assembly"} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", fontSize: 11, fontWeight: 500, borderRadius: 5, border: "1px solid var(--accent)", background: showAll ? "var(--accent)" : "var(--panel)", color: showAll ? "#fff" : "var(--accent)" }}>
                    {showAll ? <><Square size={11} /> Isolate</> : <><Boxes size={11} /> Full assembly</>}
                  </button>
                )}
                <button className="btn sm ghost" onClick={onOpenViewer} title="Open in full viewer"><ExternalLink size={12} /></button>
              </div>
            </div>
            {!previewCollapsed && (cad ? <QuoteCadPreview model={cad as CadImportResult} selectedId={selectedId} selectedMeshIds={(() => { const p = parts.find(p => p.id === selectedId); return p?.meshIds && p.meshIds.length > 0 ? p.meshIds : []; })()} showAll={showAll} viewerRef={previewViewerRef} /> : <QuotePreview onOpenViewer={onOpenViewer} />)}
          </div>
          <RfqRail parts={parts} asmQty={asmQty} setAsmQty={setAsmQty} commercial={commercial} setCommercial={setCommercial} bops={bops} extraCosts={extraCosts} getCadSnapshot={getCadSnapshot} />
        </div>
        <div className="quote-main-col">
          <PartsTable parts={parts} setParts={setParts} asmQty={asmQty} selectedId={selectedId} onSelect={setSelectedId} onAddPart={addManualPart} searchQuery={searchQuery} />
          <BopSection bops={bops} setBops={setBops} asmQty={asmQty} />
          <ExtraCostsSection extraCosts={extraCosts} setExtraCosts={setExtraCosts} />
          <CostPanel parts={parts} asmQty={asmQty} commercial={commercial} bops={bops} extraCosts={extraCosts} />
        </div>
      </div>
      {reattachPrompt && (
        <div className="modal-overlay" onClick={() => { consumeHandoff(); setReattachPrompt(null); }}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon"><TriangleAlert size={20} /></div>
            <p className="confirm-msg">This quote already has a CAD file (<strong>{reattachPrompt.existingFile}</strong>). Replace it with <strong>{reattachPrompt.incomingFile}</strong>? Bodies imported from the previous file will be removed; manual parts will stay.</p>
            <div className="confirm-actions">
              <button className="btn sm" onClick={() => { consumeHandoff(); setReattachPrompt(null); }}>Cancel</button>
              <button className="btn sm danger" onClick={() => { setReattachPrompt(null); completeHandoff(true); }}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function QuoteDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { rfq, quoteId, quoteNumber, quoteStatus, persistenceStatus, persistenceError, loadQuote, clearPersistenceError, changeStatus } = useQuoteState();
  const searchQuery = "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !inField) { e.preventDefault(); window.__focusGlobalSearch?.(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!id || id === quoteId) return;
    if (quoteId && persistenceStatus === "saved") return;
    if (persistenceStatus === "loading") return;
    loadQuote(id);
  }, [id, loadQuote, persistenceStatus, quoteId]);

  useEffect(() => {
    if (!id || !quoteId || id === quoteId || persistenceStatus !== "saved") return;
    navigate(`/quotes/${quoteId}`, { replace: true });
  }, [id, navigate, persistenceStatus, quoteId]);

  const title = rfq.project || "Untitled quote";
  const statusLabel = quoteStatus === "draft" ? "draft" : quoteStatus;
  const subText = persistenceStatus === "loading" ? "Loading saved quote" : persistenceStatus === "saving" ? "Saving quote" : quoteId ? (quoteNumber ? `${statusLabel} · ${quoteNumber}` : `Saved ${statusLabel}`) : `Unsaved draft${searchQuery ? ` · filter: "${searchQuery}"` : ""}`;
  const quoteRef = rfq.rfqRef || quoteNumber || "";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Quote · {title}</h1>
          <div className={`page-sub ${persistenceStatus === "loading" || persistenceStatus === "saving" ? "busy" : ""}`}><span className="status-dot" /><span>{subText}</span>{quoteRef && <><span style={{ color: "var(--text-4)" }}>•</span><span className="quote-num">{quoteRef}</span></>}</div>
        </div>
        {quoteId && <div style={{ marginLeft: "auto" }}><select value={quoteStatus} onChange={e => void changeStatus(e.target.value as typeof quoteStatus)} className="status-select" aria-label="Quote status"><option value="draft">Draft</option><option value="review">Review</option><option value="sent">Sent</option><option value="won">Won</option><option value="lost">Lost</option><option value="expired">Expired</option></select></div>}
      </div>
      {persistenceError && <div className="quote-page-error"><TriangleAlert size={14} /><span>{persistenceError}</span><button type="button" onClick={clearPersistenceError} title="Dismiss error"><X size={14} /></button></div>}
      <QuoteWorkspace searchQuery={searchQuery} onOpenViewer={() => { const source = quoteId || id; navigate(source ? `/viewer?from=${encodeURIComponent(source)}` : "/viewer"); }} />
    </div>
  );
}
