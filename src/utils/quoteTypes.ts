export type Op = { id: string; machine: string; setupMin: number; cycleMin: number };
export type Stock = { shape: string; dims: Record<string, number> };
export type Part = {
  id: string; name: string; color: string;
  material: string; perAssembly: number; mass: number; finishing: number; included: boolean; stocked?: boolean;
  stock: Stock | null;
  operations: Op[];
  // All CAD mesh ids that share this part's geometry. When undefined, the
  // part isn't backed by CAD bodies (sample data, purchased items) — treat as
  // a single virtual body keyed by part.id.
  meshIds?: string[];
};
