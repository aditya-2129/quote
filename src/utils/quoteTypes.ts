export type Op = { id: string; machine: string; setupMin: number; cycleMin: number };
export type Stock = { shape: string; dims: Record<string, number> };
export type Part = {
  id: string; name: string; color: string;
  material: string; perAssembly: number; mass: number; finishing: number; included: boolean; stocked?: boolean;
  stock: Stock | null;
  operations: Op[];
};
