import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Part } from "@utils/quoteTypes";

export type Rfq = { customer: string; project: string; rfqRef: string };

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
}

const QuoteStateContext = createContext<QuoteStateCtx | null>(null);

export function QuoteStateProvider({ children }: { children: ReactNode }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asmQty, setAsmQty] = useState(25);
  const [commercial, setCommercial] = useState({ marginPct: 18, taxPct: 0 });
  const [rfq, setRfq] = useState<Rfq>({ customer: "", project: "", rfqRef: "" });
  return (
    <QuoteStateContext.Provider value={{ parts, setParts, selectedId, setSelectedId, asmQty, setAsmQty, commercial, setCommercial, rfq, setRfq }}>
      {children}
    </QuoteStateContext.Provider>
  );
}

export function useQuoteState(): QuoteStateCtx {
  const ctx = useContext(QuoteStateContext);
  if (!ctx) throw new Error("useQuoteState must be used within QuoteStateProvider");
  return ctx;
}
