import type { Part } from "@utils/quoteTypes";

export type PartRowProps = {
  p: Part;
  isSel: boolean;
  isExpanded: boolean;
  asmQty: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Part>) => void;
  onToggleExpanded: (id: string) => void;
  onDelete: (id: string) => void;
};

export type StockPanelProps = {
  part: Part;
  qty: number;
  onChange: (patch: Partial<Part>) => void;
};

export type OperationsEditorProps = {
  part: Part;
  qty: number;
  onChange: (patch: Partial<Part>) => void;
};

export type PartsTableProps = {
  parts: Part[];
  setParts: (parts: Part[]) => void;
  asmQty: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddPart: () => void;
  searchQuery: string;
};

export type RfqRailProps = {
  parts: Part[];
  asmQty: number;
  setAsmQty: (v: number) => void;
  commercial: { marginPct: number; taxPct: number };
  setCommercial: (v: { marginPct: number; taxPct: number }) => void;
  bops: import("@utils/quoteTypes").Bop[];
  extraCosts: import("@utils/quoteTypes").ExtraCost[];
  getCadSnapshot?: () => string | null;
};

export type CostPanelProps = {
  parts: Part[];
  asmQty: number;
  commercial: { marginPct: number; taxPct: number };
  bops: import("@utils/quoteTypes").Bop[];
  extraCosts: import("@utils/quoteTypes").ExtraCost[];
};

export type BopSectionProps = {
  bops: import("@utils/quoteTypes").Bop[];
  setBops: (value: import("@utils/quoteTypes").Bop[] | ((prev: import("@utils/quoteTypes").Bop[]) => import("@utils/quoteTypes").Bop[])) => void;
  asmQty: number;
};

export type ExtraCostsSectionProps = {
  extraCosts: import("@utils/quoteTypes").ExtraCost[];
  setExtraCosts: (value: import("@utils/quoteTypes").ExtraCost[] | ((prev: import("@utils/quoteTypes").ExtraCost[]) => import("@utils/quoteTypes").ExtraCost[])) => void;
};
