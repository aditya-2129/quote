export type Op = {
  id: string;
  machine: string;
  setupMin: number;
  cycleMin: number;
  // Snapshot of the machine name at quote time so deleted/inactive machines
  // never fall back to showing raw ids in old quotes.
  machineLabelSnapshot?: string | null;
  // Per-quote override of the machine ₹/hour rate. Cleared when the machine changes.
  rateOverride?: number | null;
};
export type Stock = { shape: string; dims: Record<string, number> };
export type ExtraCostCode =
  | "stuffing_packing"
  | "shipping_delivery"
  | "design_engineering"
  | "assembly_testing";
export type ExtraCost = {
  code: ExtraCostCode;
  label: string;
  amount: number;
  sortOrder: number;
};
export type Bop = {
  id: string;
  /** Optional reference back to the reusable catalog row. */
  catalogId: string | null;
  name: string;
  supplier: string;
  qtyPerAssembly: number;
  unitCost: number;
  notes?: string;
};
export type Part = {
  id: string; name: string; color: string;
  material: string; perAssembly: number; mass: number; finishing: number; included: boolean; stocked?: boolean;
  // Snapshot of the material name at quote time so old quotes do not expose
  // raw material ids if the library row is later deleted.
  materialLabelSnapshot?: string | null;
  // Net solid volume of the part in mm³ (from CAD geometry). Mass is derived as volume × material density.
  netVolumeMm3?: number;
  // Per-quote override of the material ₹/kg rate. Cleared when material or stock shape changes.
  materialRateOverride?: number | null;
  stock: Stock | null;
  operations: Op[];
  // All CAD mesh ids that share this part's geometry. When undefined, the
  // part isn't backed by CAD bodies (sample data, purchased items) — treat as
  // a single virtual body keyed by part.id.
  meshIds?: string[];
};
