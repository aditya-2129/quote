import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Part } from "@utils/quoteTypes";
import {
  loadQuoteWorkflow,
  saveQuoteWorkflow,
  type LoadedQuoteWorkflow,
  type QuoteWorkflowDraft,
} from "../db/quoteWorkflowService";
import type { QuoteEvent } from "../db/schema";

export type Rfq = { customer: string; project: string; rfqRef: string; notes: string };
export type PersistenceStatus = "idle" | "loading" | "saving" | "saved" | "error";

const defaultCommercial = { marginPct: 18, taxPct: 0 };
const defaultRfq: Rfq = { customer: "", project: "", rfqRef: "", notes: "" };

interface QuoteStateCtx {
  parts: Part[];
  setParts: Dispatch<SetStateAction<Part[]>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  asmQty: number;
  setAsmQty: Dispatch<SetStateAction<number>>;
  commercial: { marginPct: number; taxPct: number };
  setCommercial: Dispatch<SetStateAction<{ marginPct: number; taxPct: number }>>;
  rfq: Rfq;
  setRfq: Dispatch<SetStateAction<Rfq>>;
  quoteId: string | null;
  rfqId: string | null;
  quoteEvents: QuoteEvent[];
  persistenceStatus: PersistenceStatus;
  persistenceError: string | null;
  lastSavedAt: Date | null;
  loadQuote: (id: string) => Promise<boolean>;
  saveQuote: (overrides?: Partial<QuoteWorkflowDraft>) => Promise<string>;
  clearPersistenceError: () => void;
}

const QuoteStateContext = createContext<QuoteStateCtx | null>(null);

function draftSignature(draft: QuoteWorkflowDraft): string {
  return JSON.stringify({
    quoteId: draft.quoteId ?? null,
    rfqId: draft.rfqId ?? null,
    rfq: draft.rfq,
    asmQty: draft.asmQty,
    commercial: draft.commercial,
    parts: draft.parts,
    toolingCost: draft.toolingCost,
    inspectionCost: draft.inspectionCost,
  });
}

function hasDraftContent(draft: QuoteWorkflowDraft): boolean {
  return draft.parts.length > 0
    || Boolean(draft.rfq.customer.trim())
    || Boolean(draft.rfq.project.trim())
    || Boolean(draft.rfq.rfqRef.trim())
    || Boolean(draft.rfq.notes.trim());
}

export function QuoteStateProvider({ children }: { children: ReactNode }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asmQty, setAsmQty] = useState(25);
  const [commercial, setCommercial] = useState(defaultCommercial);
  const [rfq, setRfq] = useState<Rfq>(defaultRfq);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [quoteEvents, setQuoteEvents] = useState<QuoteEvent[]>([]);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("idle");
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedSignatureRef = useRef("");

  const applySnapshot = useCallback((snapshot: LoadedQuoteWorkflow) => {
    setQuoteId(snapshot.quoteId);
    setRfqId(snapshot.rfqId);
    setRfq({
      customer: snapshot.rfq.customer ?? "",
      project: snapshot.rfq.project,
      rfqRef: snapshot.rfq.rfqRef ?? "",
      notes: snapshot.rfq.notes ?? "",
    });
    setAsmQty(snapshot.asmQty);
    setCommercial({
      marginPct: snapshot.commercial.marginPct,
      taxPct: snapshot.commercial.taxPct,
    });
    setParts(snapshot.parts);
    setSelectedId(snapshot.parts[0]?.id ?? null);
    setLastSavedAt(snapshot.records.quote.updatedAt ?? null);
    setQuoteEvents(snapshot.records.events);
    lastSavedSignatureRef.current = draftSignature(snapshot);
  }, []);

  const loadQuote = useCallback(async (id: string) => {
    setPersistenceStatus("loading");
    setPersistenceError(null);
    try {
      const snapshot = await loadQuoteWorkflow(id);
      applySnapshot(snapshot);
      setPersistenceStatus("saved");
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Quote not found")) {
        setQuoteId(null);
        setRfqId(null);
        setQuoteEvents([]);
        setPersistenceStatus("idle");
        return false;
      }
      setPersistenceStatus("error");
      setPersistenceError(error instanceof Error ? error.message : "Quote load failed.");
      return false;
    }
  }, [applySnapshot]);

  const saveQuote = useCallback(async (overrides: Partial<QuoteWorkflowDraft> = {}) => {
    setPersistenceStatus("saving");
    setPersistenceError(null);
    const draft: QuoteWorkflowDraft = {
      quoteId,
      rfqId,
      rfq,
      asmQty,
      commercial,
      parts,
      toolingCost: 244,
      inspectionCost: 326,
      ...overrides,
    };
    try {
      const snapshot = await saveQuoteWorkflow(draft);
      applySnapshot(snapshot.draft);
      setPersistenceStatus("saved");
      return snapshot.quote.id;
    } catch (error) {
      setPersistenceStatus("error");
      setPersistenceError(error instanceof Error ? error.message : "Quote save failed.");
      throw error;
    }
  }, [applySnapshot, asmQty, commercial, parts, quoteId, rfq, rfqId]);

  useEffect(() => {
    const draft: QuoteWorkflowDraft = {
      quoteId,
      rfqId,
      rfq,
      asmQty,
      commercial,
      parts,
      toolingCost: 244,
      inspectionCost: 326,
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
  }, [asmQty, commercial, parts, persistenceStatus, quoteId, rfq, rfqId, saveQuote]);

  const clearPersistenceError = useCallback(() => setPersistenceError(null), []);

  return (
    <QuoteStateContext.Provider value={{ parts, setParts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, rfq, setRfq, quoteId, rfqId, quoteEvents, persistenceStatus, persistenceError, lastSavedAt, loadQuote, saveQuote, clearPersistenceError }}>
      {children}
    </QuoteStateContext.Provider>
  );
}

export function useQuoteState(): QuoteStateCtx {
  const ctx = useContext(QuoteStateContext);
  if (!ctx) throw new Error("useQuoteState must be used within QuoteStateProvider");
  return ctx;
}
