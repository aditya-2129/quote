import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Bop, ExtraCost, ExtraCostCode } from "@utils/quoteTypes";
import type { Part } from "@utils/quoteTypes";
import { QUOTE_EXTRA_COST_ROSTER } from "../db/schema";
import { useCad } from "./CadContext";
import {
  loadQuoteWorkflow,
  saveQuoteWorkflow,
  sendQuoteWorkflow,
  type LoadedQuoteWorkflow,
  type QuoteWorkflowDraft,
} from "../db/quoteWorkflowService";
import { updateQuoteStatus } from "../db/queries";
import type { ProjectNameSource } from "../db/schema";

export type Rfq = { customer: string; customerId: string | null; project: string; rfqRef: string; notes: string };
export type PersistenceStatus = "idle" | "loading" | "saving" | "saved" | "error";

const defaultCommercial = { marginPct: 18, taxPct: 0 };
const defaultRfq: Rfq = { customer: "", customerId: null, project: "", rfqRef: "", notes: "" };
const defaultExtraCosts: ExtraCost[] = QUOTE_EXTRA_COST_ROSTER.map(entry => ({
  code: entry.code as ExtraCostCode,
  label: entry.label,
  amount: 0,
  sortOrder: entry.sortOrder,
}));

interface QuoteStateCtx {
  parts: Part[];
  setParts: Dispatch<SetStateAction<Part[]>>;
  bops: Bop[];
  setBops: Dispatch<SetStateAction<Bop[]>>;
  extraCosts: ExtraCost[];
  setExtraCosts: Dispatch<SetStateAction<ExtraCost[]>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  asmQty: number;
  setAsmQty: Dispatch<SetStateAction<number>>;
  commercial: { marginPct: number; taxPct: number };
  setCommercial: Dispatch<SetStateAction<{ marginPct: number; taxPct: number }>>;
  rfq: Rfq;
  /** Sets RFQ fields. If `project` changes, flips projectNameSource to 'user' so future CAD attaches won't overwrite the typed name. */
  setRfq: Dispatch<SetStateAction<Rfq>>;
  /** Tracks whether `rfq.project` was typed by the user ('user') or auto-generated ('auto'). Drives whether a CAD attach is allowed to rename. */
  projectNameSource: ProjectNameSource;
  /** Sets the project name from an auto source (file attach, Untitled N). Also flips source to 'auto'. */
  setProjectAuto: (name: string) => void;
  /** File name of the CAD source persisted with the current quote (null when no CAD attached yet). Used to detect re-attach scenarios. */
  savedCadFileName: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  quoteStatus: "draft" | "review" | "sent" | "won" | "lost" | "expired";
  rfqId: string | null;
  persistenceStatus: PersistenceStatus;
  persistenceError: string | null;
  lastSavedAt: Date | null;
  loadQuote: (id: string) => Promise<boolean>;
  saveQuote: (overrides?: Partial<QuoteWorkflowDraft>) => Promise<string>;
  sendQuote: () => Promise<string>;
  changeStatus: (status: QuoteStateCtx["quoteStatus"]) => Promise<void>;
  clearPersistenceError: () => void;
}

const QuoteStateContext = createContext<QuoteStateCtx | null>(null);

function draftSignature(draft: QuoteWorkflowDraft): string {
  return JSON.stringify({
    quoteId: draft.quoteId ?? null,
    rfqId: draft.rfqId ?? null,
    rfq: {
      customer: draft.rfq.customer ?? "",
      customerId: draft.rfq.customerId ?? null,
      project: draft.rfq.project,
      rfqRef: draft.rfq.rfqRef ?? "",
      notes: draft.rfq.notes ?? "",
    },
    asmQty: draft.asmQty,
    commercial: {
      marginPct: draft.commercial.marginPct,
      taxPct: draft.commercial.taxPct,
      discountPct: draft.commercial.discountPct ?? 0,
    },
    extraCosts: (draft.extraCosts ?? []).map(row => ({
      code: row.code,
      amount: row.amount,
    })),
    bops: (draft.bops ?? []).map(bop => ({
      id: bop.id,
      catalogId: bop.catalogId ?? null,
      name: bop.name,
      supplier: bop.supplier ?? "",
      qtyPerAssembly: bop.qtyPerAssembly,
      unitCost: bop.unitCost,
      notes: bop.notes ?? "",
    })),
    parts: draft.parts.map(part => ({
      id: part.id,
      name: part.name,
      color: part.color,
      material: part.material,
      perAssembly: part.perAssembly,
      mass: part.mass,
      netVolumeMm3: part.netVolumeMm3 ?? null,
      finishing: part.finishing,
      included: part.included,
      stocked: part.stocked ?? false,
      materialRateOverride: part.materialRateOverride ?? null,
      meshIds: part.meshIds ?? [],
      stock: part.stock ? {
        shape: part.stock.shape,
        dims: Object.fromEntries(Object.entries(part.stock.dims ?? {}).sort(([a], [b]) => a.localeCompare(b))),
      } : null,
      geometry: part.geometry ? {
        fileName: part.geometry.fileName ?? "",
        unitSystem: part.geometry.unitSystem ?? "metric",
        bboxXMm: part.geometry.bboxXMm ?? 0,
        bboxYMm: part.geometry.bboxYMm ?? 0,
        bboxZMm: part.geometry.bboxZMm ?? 0,
        volumeMm3: part.geometry.volumeMm3 ?? 0,
        surfaceAreaMm2: part.geometry.surfaceAreaMm2 ?? 0,
        faceCount: part.geometry.faceCount ?? 0,
        vertexCount: part.geometry.vertexCount ?? 0,
      } : null,
      operations: part.operations.map(op => ({
        id: op.id,
        machine: op.machine,
        setupMin: op.setupMin,
        cycleMin: op.cycleMin,
        rateOverride: op.rateOverride ?? null,
      })),
    })),
    toolingCost: draft.toolingCost ?? 244,
    inspectionCost: draft.inspectionCost ?? 326,
    projectNameSource: draft.projectNameSource ?? null,
  });
}

function hasDraftContent(draft: QuoteWorkflowDraft): boolean {
  return draft.parts.length > 0
    || (draft.bops?.length ?? 0) > 0
    || Boolean(draft.rfq.customer?.trim())
    || Boolean(draft.rfq.customerId)
    || Boolean(draft.rfq.project.trim())
    || Boolean(draft.rfq.rfqRef?.trim())
    || Boolean(draft.rfq.notes?.trim());
}

export function QuoteStateProvider({ children }: { children: ReactNode }) {
  const cadCtx = useCad();
  const { getCadBytes, restoreFromBytes, clearCad } = cadCtx;
  // Snapshot pendingHandoff in a ref so applySnapshot (called inside async
  // callbacks) can read the live value without re-creating itself on every
  // change to CadContext state.
  const pendingHandoffRef = useRef(cadCtx.pendingHandoff);
  useEffect(() => {
    pendingHandoffRef.current = cadCtx.pendingHandoff;
  }, [cadCtx.pendingHandoff]);
  const [parts, setParts] = useState<Part[]>([]);
  const [bops, setBops] = useState<Bop[]>([]);
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>(defaultExtraCosts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asmQty, setAsmQty] = useState(1);
  const [commercial, setCommercial] = useState(defaultCommercial);
  const [rfq, setRfqState] = useState<Rfq>(defaultRfq);
  // Source of the current project name. New quotes start 'auto' (the New Quote
  // button assigns 'Untitled quote N'); the moment the user types in the Project
  // field we flip to 'user', which locks the name against CAD-attach overwrites.
  const [projectNameSource, setProjectNameSource] = useState<ProjectNameSource>("auto");
  const setRfq = useCallback<Dispatch<SetStateAction<Rfq>>>((update) => {
    setRfqState(prev => {
      const next = typeof update === "function" ? (update as (p: Rfq) => Rfq)(prev) : update;
      if (next.project !== prev.project) setProjectNameSource("user");
      return next;
    });
  }, []);
  const setProjectAuto = useCallback((name: string) => {
    setRfqState(prev => prev.project === name ? prev : { ...prev, project: name });
    setProjectNameSource("auto");
  }, []);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStateCtx["quoteStatus"]>("draft");
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedCadFileName, setSavedCadFileName] = useState<string | null>(null);
  const latestDraftRef = useRef<QuoteWorkflowDraft | null>(null);
  const saveInFlightRef = useRef<Promise<string> | null>(null);
  const loadInFlightRef = useRef<{ id: string; promise: Promise<boolean> } | null>(null);
  const lastSavedSignatureRef = useRef("");
  // Tracks the file name of the last persisted CAD source so autosave doesn't
  // re-encode (and re-write) the same multi-MB STEP file on every keystroke.
  const lastSavedCadFileRef = useRef<string | null>(null);

  useEffect(() => {
    latestDraftRef.current = {
      quoteId,
      rfqId,
      rfq,
      asmQty,
      commercial,
      parts,
      bops,
      extraCosts,
      toolingCost: 0,
      inspectionCost: 0,
      projectNameSource,
    };
  }, [asmQty, bops, commercial, extraCosts, parts, projectNameSource, quoteId, rfq, rfqId]);

  const applySnapshot = useCallback((snapshot: LoadedQuoteWorkflow) => {
    setQuoteId(snapshot.quoteId);
    setQuoteNumber(snapshot.records.quote.quoteNumber ?? null);
    setQuoteStatus(snapshot.records.quote.status);
    setRfqId(snapshot.rfqId);
    // Restore via the raw setter so we don't accidentally flip projectNameSource
    // to 'user' just because we're loading a saved value.
    setRfqState({
      customer: snapshot.rfq.customer ?? "",
      customerId: snapshot.rfq.customerId ?? null,
      project: snapshot.rfq.project,
      rfqRef: snapshot.rfq.rfqRef ?? "",
      notes: snapshot.rfq.notes ?? "",
    });
    // Default missing source to 'user' so legacy non-Untitled quotes stay locked
    // (only the migration's back-fill or a future auto-set will mark them auto).
    setProjectNameSource(snapshot.projectNameSource ?? "user");
    setAsmQty(snapshot.asmQty);
    setCommercial({
      marginPct: snapshot.commercial.marginPct,
      taxPct: snapshot.commercial.taxPct,
    });
    setParts(snapshot.parts);
    setBops(snapshot.bops ?? []);
    // Always merge over the default roster so any missing codes still show with 0.
    {
      const incoming = new Map((snapshot.extraCosts ?? []).map(row => [row.code, row]));
      setExtraCosts(defaultExtraCosts.map(entry => {
        const match = incoming.get(entry.code);
        return match ? { ...entry, label: match.label, amount: match.amount } : entry;
      }));
    }
    setSelectedId(current => {
      if (current && snapshot.parts.some(part => part.id === current)) return current;
      return snapshot.parts[0]?.id ?? null;
    });
    setLastSavedAt(snapshot.records.quote.updatedAt ?? null);
    lastSavedSignatureRef.current = draftSignature(snapshot);
    if (snapshot.cadSource) {
      const current = getCadBytes();
      lastSavedCadFileRef.current = snapshot.cadSource.fileName;
      setSavedCadFileName(snapshot.cadSource.fileName);
      // Skip the re-import if CadContext already holds the same file (post-save
      // applySnapshot path) — only re-hydrate when CAD state is stale (cold load).
      // Also skip if a viewer→quote handoff is pending: the user is about to
      // attach new CAD bytes and we mustn't overwrite them with the old saved
      // ones. The next save will overwrite the row with the user's choice.
      const handoffPending = pendingHandoffRef.current;
      const hasMeshParts = snapshot.parts.some(p => p.meshIds && p.meshIds.length > 0);
      const missingGeometry = snapshot.parts.some(p => p.meshIds && p.meshIds.length > 0 && !p.geometry);
      const forceReimport = hasMeshParts && missingGeometry;
      if ((current?.fileName !== snapshot.cadSource.fileName || forceReimport) && !handoffPending) {
        void restoreFromBytes(snapshot.cadSource.bytes, snapshot.cadSource.fileName, forceReimport);
      }
    } else {
      lastSavedCadFileRef.current = null;
      setSavedCadFileName(null);
      // Don't clear CAD when a handoff is in flight — the user is in the middle
      // of attaching a STEP from the viewer and we'd wipe their bytes.
      if (!pendingHandoffRef.current) clearCad();
    }
  }, [clearCad, getCadBytes, restoreFromBytes]);

  const applySavedIdentity = useCallback((snapshot: LoadedQuoteWorkflow) => {
    setQuoteId(snapshot.quoteId);
    setQuoteNumber(snapshot.records.quote.quoteNumber ?? null);
    setQuoteStatus(snapshot.records.quote.status);
    setRfqId(snapshot.rfqId);
    setLastSavedAt(snapshot.records.quote.updatedAt ?? null);
    lastSavedSignatureRef.current = draftSignature(snapshot);
    if (snapshot.cadSource) {
      lastSavedCadFileRef.current = snapshot.cadSource.fileName;
      setSavedCadFileName(snapshot.cadSource.fileName);
    }
  }, []);

  const loadQuote = useCallback(async (id: string) => {
    // Reuse an in-flight load for the same id so that React effects re-running
    // (or two consumers calling loadQuote concurrently) can't kick off a second
    // load whose later applySnapshot would revert any state mutations made
    // between the two loads — e.g. a viewer→quote merge.
    const existing = loadInFlightRef.current;
    if (existing && existing.id === id) return existing.promise;

    setPersistenceStatus("loading");
    setPersistenceError(null);
    const promise = (async () => {
      try {
        const snapshot = await loadQuoteWorkflow(id);
        applySnapshot(snapshot);
        setPersistenceStatus("saved");
        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes("Quote not found")) {
          setQuoteId(null);
          setQuoteNumber(null);
          setQuoteStatus("draft");
          setRfqId(null);
          setPersistenceStatus("idle");
          return false;
        }
        setPersistenceStatus("error");
        setPersistenceError(error instanceof Error ? error.message : "Quote load failed.");
        return false;
      } finally {
        loadInFlightRef.current = null;
      }
    })();
    loadInFlightRef.current = { id, promise };
    return promise;
  }, [applySnapshot]);

  const saveQuote = useCallback(async (overrides: Partial<QuoteWorkflowDraft> = {}) => {
    if (saveInFlightRef.current) return saveInFlightRef.current;

    setPersistenceStatus("saving");
    setPersistenceError(null);
    const currentCad = getCadBytes();
    // Only attach cadSource when the underlying file has changed since the last
    // persisted save — base64-encoding a multi-MB STEP on every autosave tick
    // would dominate save time. `cadSource: null` here means "don't touch the
    // existing cad row," not "delete it."
    const cadSource = currentCad && currentCad.fileName !== lastSavedCadFileRef.current
      ? { bytes: currentCad.bytes, fileName: currentCad.fileName }
      : null;
    const draft: QuoteWorkflowDraft = {
      quoteId,
      rfqId,
      rfq,
      asmQty,
      commercial,
      parts,
      bops,
      extraCosts,
      toolingCost: 0,
      inspectionCost: 0,
      cadSource,
      projectNameSource,
      ...overrides,
    };
    const promise = (async () => {
      try {
        const snapshot = await saveQuoteWorkflow(draft);
        const latestDraft = latestDraftRef.current;
        if (latestDraft && draftSignature(latestDraft) !== draftSignature(draft)) {
          applySavedIdentity(snapshot.draft);
        } else {
          applySnapshot(snapshot.draft);
        }
        setPersistenceStatus("saved");
        return snapshot.quote.id;
      } catch (error) {
        setPersistenceStatus("error");
        setPersistenceError(error instanceof Error ? error.message : "Quote save failed.");
        throw error;
      } finally {
        saveInFlightRef.current = null;
      }
    })();
    saveInFlightRef.current = promise;
    return promise;
  }, [applySavedIdentity, applySnapshot, asmQty, bops, commercial, extraCosts, getCadBytes, parts, projectNameSource, quoteId, rfq, rfqId]);

  useEffect(() => {
    const draft: QuoteWorkflowDraft = {
      quoteId,
      rfqId,
      rfq,
      asmQty,
      commercial,
      parts,
      bops,
      extraCosts,
      toolingCost: 0,
      inspectionCost: 0,
      projectNameSource,
    };
    if (!hasDraftContent(draft)) return;
    const signature = draftSignature(draft);
    if (signature === lastSavedSignatureRef.current || persistenceStatus === "loading" || persistenceStatus === "saving") return;

    const delay = quoteId ? 900 : 0;
    const timer = window.setTimeout(() => {
      void saveQuote().catch(() => {
        // Error state is exposed through persistenceStatus/persistenceError.
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [asmQty, bops, commercial, extraCosts, parts, persistenceStatus, projectNameSource, quoteId, rfq, rfqId, saveQuote]);

  const sendQuote = useCallback(async () => {
    // Flush pending edits first so the sent quote reflects what the user sees.
    const id = await saveQuote();
    const result = await sendQuoteWorkflow(id);
    const reloaded = await loadQuoteWorkflow(result.quote.id);
    applySnapshot(reloaded);
    setPersistenceStatus("saved");
    return result.quoteNumber;
  }, [applySnapshot, saveQuote]);

  const clearPersistenceError = useCallback(() => setPersistenceError(null), []);

  const changeStatus = useCallback(async (status: QuoteStateCtx["quoteStatus"]) => {
    if (!quoteId) return;
    await updateQuoteStatus(quoteId, status);
    setQuoteStatus(status);
  }, [quoteId]);

  return (
    <QuoteStateContext.Provider value={{ parts, setParts, bops, setBops, extraCosts, setExtraCosts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, rfq, setRfq, projectNameSource, setProjectAuto, savedCadFileName, quoteId, quoteNumber, quoteStatus, rfqId, persistenceStatus, persistenceError, lastSavedAt, loadQuote, saveQuote, sendQuote, changeStatus, clearPersistenceError }}>
      {children}
    </QuoteStateContext.Provider>
  );
}

export function useQuoteState(): QuoteStateCtx {
  const ctx = useContext(QuoteStateContext);
  if (!ctx) throw new Error("useQuoteState must be used within QuoteStateProvider");
  return ctx;
}

