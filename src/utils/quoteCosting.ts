import type { Machine, Material, QuoteCostSnapshot } from "../db/schema";
import type { Op, Part, Stock } from "./quoteTypes";

export type MaterialCatalog = Record<string, {
  densityKgPerM3: number;
  costPerKg: number;
  formRates: Record<string, number>;
  markupPercent: number;
  currency: string;
}>;

export type MachineCatalog = Record<string, {
  ratePerHour: number;
}>;

export type CommercialTerms = {
  marginPct: number;
  taxPct: number;
};

export type QuoteRollup = {
  materialCost: number;
  setupCost: number;
  machineCost: number;
  finishingCost: number;
  tooling: number;
  inspection: number;
  partsCost: number;
  bopCost: number;
  /** Sum of fixed extra-cost line items (added after tax, no margin/tax markup). */
  extraCost: number;
  subtotal: number;
  margin: number;
  tax: number;
  total: number;
  unitPrice: number;
  currency: string;
};

export const DEFAULT_TOOLING_BATCH = 0;
export const DEFAULT_INSPECTION_BATCH = 0;
export const DEFAULT_QUANTITY_BREAKS = [1, 10, 25, 100, 250] as const;

function finite(value: number | null | undefined): number {
  return Number.isFinite(value) ? value! : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildMaterialCatalog(materials: Material[]): MaterialCatalog {
  return Object.fromEntries(materials.map(material => [
    material.id,
    {
      densityKgPerM3: material.densityKgPerM3,
      costPerKg: material.costPerKg,
      formRates: material.formRates ?? {},
      markupPercent: material.markupPercent,
      currency: material.currency,
    },
  ]));
}

export function buildMachineCatalog(machines: Machine[]): MachineCatalog {
  return Object.fromEntries(machines.map(machine => [
    machine.id,
    { ratePerHour: machine.ratePerHour },
  ]));
}

export function stockVolumeMm3(stock: Stock): number {
  const { shape, dims } = stock;
  switch (shape) {
    case "rect":
      return finite(dims.L) * finite(dims.W) * finite(dims.H);
    case "round": {
      const ro = finite(dims.D) / 2;
      const ri = finite(dims.ID) / 2;
      return Math.PI * (ro * ro - ri * ri) * finite(dims.L);
    }
    case "hex":
      return (Math.sqrt(3) / 2) * Math.pow(finite(dims.AF), 2) * finite(dims.L);
    default:
      return 0;
  }
}

export function materialRate(materials: MaterialCatalog, materialId: string, stockShape?: string): number {
  const material = materials[materialId];
  if (!material) return 0;
  if (stockShape && material.formRates[stockShape] !== undefined) return material.formRates[stockShape]!;
  return material.costPerKg || Object.values(material.formRates)[0] || 0;
}

export function effectivePartRate(part: Part, materials: MaterialCatalog): number {
  if (part.materialRateOverride != null && !Number.isNaN(part.materialRateOverride)) {
    return part.materialRateOverride;
  }
  return materialRate(materials, part.material, part.stock?.shape);
}

export function stockMassKg(stock: Stock | null, materialId: string, materials: MaterialCatalog): number {
  if (!stock) return 0;
  return stockVolumeMm3(stock) * 1e-9 * (materials[materialId]?.densityKgPerM3 ?? 0);
}

export function partNetMassKg(part: Part, materials: MaterialCatalog): number {
  if (part.netVolumeMm3 != null) {
    return part.netVolumeMm3 * 1e-9 * (materials[part.material]?.densityKgPerM3 ?? 0);
  }
  return part.mass || 0;
}

export function partQuantity(part: Part, assemblyQuantity: number): number {
  return Math.max(0, part.perAssembly) * Math.max(0, assemblyQuantity);
}

export function operationRate(operation: Op, machines: MachineCatalog): number {
  if (operation.rateOverride != null && !Number.isNaN(operation.rateOverride)) {
    return operation.rateOverride;
  }
  return machines[operation.machine]?.ratePerHour ?? 0;
}

export function operationCost(operation: Op, quantity: number, machines: MachineCatalog): number {
  const rate = operationRate(operation, machines);
  return (operation.setupMin / 60) * rate + (operation.cycleMin / 60) * rate * quantity;
}

export function operationMinutes(operation: Op, quantity: number): number {
  return operation.setupMin + operation.cycleMin * quantity;
}

export function partMaterialCost(part: Part, assemblyQuantity: number, materials: MaterialCatalog): number {
  const mass = (part.stocked || !part.stock)
    ? partNetMassKg(part, materials)
    : stockMassKg(part.stock, part.material, materials);
  return mass * effectivePartRate(part, materials) * partQuantity(part, assemblyQuantity);
}

export function partSetupCost(part: Part, machines: MachineCatalog): number {
  return (part.operations || []).reduce((sum, operation) => (
    sum + (operation.setupMin / 60) * operationRate(operation, machines)
  ), 0);
}

export function partMachineCost(part: Part, assemblyQuantity: number, machines: MachineCatalog): number {
  const quantity = partQuantity(part, assemblyQuantity);
  return (part.operations || []).reduce((sum, operation) => (
    sum + (operation.cycleMin / 60) * operationRate(operation, machines) * quantity
  ), 0);
}

export function partFinishingCost(part: Part, assemblyQuantity: number): number {
  return finite(part.finishing) * partQuantity(part, assemblyQuantity);
}

export function partSubtotal(
  part: Part,
  assemblyQuantity: number,
  materials: MaterialCatalog,
  machines: MachineCatalog,
): number {
  if (!part.included) return 0;
  return partMaterialCost(part, assemblyQuantity, materials)
    + partSetupCost(part, machines)
    + partMachineCost(part, assemblyQuantity, machines);
}

export function calculateQuoteRollup(
  parts: Part[],
  assemblyQuantity: number,
  commercial: CommercialTerms,
  materials: MaterialCatalog,
  machines: MachineCatalog,
  options: {
    toolingCost?: number;
    inspectionCost?: number;
    currency?: string;
    bops?: Array<{ qtyPerAssembly: number; unitCost: number }>;
    extraCosts?: Array<{ amount: number }>;
  } = {},
): QuoteRollup {
  const included = parts.filter(part => part.included);
  const materialCost = included.reduce((sum, part) => sum + partMaterialCost(part, assemblyQuantity, materials), 0);
  const setupCost = included.reduce((sum, part) => sum + partSetupCost(part, machines), 0);
  const machineCost = included.reduce((sum, part) => sum + partMachineCost(part, assemblyQuantity, machines), 0);
  const finishingCost = 0;
  const bopCost = (options.bops ?? []).reduce((sum, bop) => {
    const qty = Math.max(0, Math.trunc(finite(bop.qtyPerAssembly)));
    const cost = Math.max(0, finite(bop.unitCost));
    return sum + cost * qty * Math.max(0, assemblyQuantity);
  }, 0);
  const extraCost = (options.extraCosts ?? []).reduce(
    (sum, row) => sum + Math.max(0, finite(row.amount)),
    0,
  );
  const tooling = options.toolingCost ?? DEFAULT_TOOLING_BATCH;
  const inspection = options.inspectionCost ?? DEFAULT_INSPECTION_BATCH;
  const partsCost = materialCost + setupCost + machineCost;
  const subtotal = partsCost + bopCost + tooling + inspection;
  const margin = subtotal * (finite(commercial.marginPct) / 100);
  const tax = (subtotal + margin) * (finite(commercial.taxPct) / 100);
  const total = subtotal + margin + tax + extraCost;
  const unitPrice = assemblyQuantity > 0 ? total / assemblyQuantity : 0;
  const firstMaterial = included.map(part => materials[part.material]).find(Boolean);
  const currency = options.currency ?? firstMaterial?.currency ?? "INR";

  return {
    materialCost,
    setupCost,
    machineCost,
    finishingCost,
    tooling,
    inspection,
    partsCost,
    bopCost,
    extraCost,
    subtotal,
    margin,
    tax,
    total,
    unitPrice,
    currency,
  };
}

export function buildQuantityBreaks(
  parts: Part[],
  commercial: CommercialTerms,
  materials: MaterialCatalog,
  machines: MachineCatalog,
  breaks: readonly number[] = DEFAULT_QUANTITY_BREAKS,
): Array<{ q: number; total: number; unit: number }> {
  return breaks.map(q => {
    const rollup = calculateQuoteRollup(parts, q, commercial, materials, machines);
    return { q, total: rollup.total, unit: q > 0 ? rollup.total / q : 0 };
  });
}

export function toQuoteCostSnapshot(rollup: QuoteRollup): QuoteCostSnapshot {
  return {
    partsCost: roundMoney(rollup.partsCost),
    tooling: roundMoney(rollup.tooling),
    inspection: roundMoney(rollup.inspection),
    subtotal: roundMoney(rollup.subtotal),
    margin: roundMoney(rollup.margin),
    tax: roundMoney(rollup.tax),
    extraCost: roundMoney(rollup.extraCost),
    total: roundMoney(rollup.total),
    unitPrice: roundMoney(rollup.unitPrice),
    currency: rollup.currency,
    computedAt: new Date().toISOString(),
  };
}



