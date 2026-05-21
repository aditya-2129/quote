import { describe, it, expect } from "vitest";
import type { Material, Machine } from "../db/schema";
import type { Op, Part, Stock } from "./quoteTypes";
import {
  buildMaterialCatalog,
  buildMachineCatalog,
  stockVolumeMm3,
  materialRate,
  effectivePartRate,
  stockMassKg,
  partNetMassKg,
  partQuantity,
  operationRate,
  operationCost,
  operationMinutes,
  partMaterialCost,
  partSetupCost,
  partMachineCost,
  partFeatureCost,
  partFinishingCost,
  partSubtotal,
  calculateQuoteRollup,
  calculateConfiguredQuoteRollup,
  buildQuantityBreaks,
  toQuoteCostSnapshot,
  DEFAULT_TOOLING_BATCH,
  DEFAULT_INSPECTION_BATCH,
  DEFAULT_QUANTITY_BREAKS,
  type MaterialCatalog,
  type MachineCatalog,
  type CommercialTerms,
  type PartWithFeatures,
} from "./quoteCosting";
import {
  featureCycleMinutes,
  DRILL_RATE_MM3_PER_MIN,
  TAP_RATE_MM_PER_MIN,
  POCKET_MILL_RATE_MM3_PER_MIN,
  SLOT_MILL_RATE_MM3_PER_MIN,
  FILLET_CHAMFER_RATE_MM_PER_MIN,
  type FeatureInput,
} from "./costing/featureCost";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    name: "Steel",
    densityKgPerM3: 7850,
    costPerKg: 100,
    currency: "INR",
    markupPercent: 0,
    category: null,
    availableForms: [],
    formRates: {},
    notes: null,
    isActive: true,
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMachine(overrides: Partial<Machine> = {}): Machine {
  return {
    id: "mach-1",
    name: "CNC Mill",
    shortName: "CNC",
    ratePerHour: 1200,
    category: "mill",
    notes: null,
    isActive: true,
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeOp(overrides: Partial<Op> = {}): Op {
  return {
    id: "op-1",
    machine: "mach-1",
    setupMin: 30,
    cycleMin: 10,
    ...overrides,
  };
}

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    id: "part-1",
    name: "Bracket",
    color: "#aaa",
    material: "mat-1",
    perAssembly: 1,
    mass: 0.5,
    finishing: 0,
    included: true,
    stock: null,
    operations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Convenience catalog helpers
// ---------------------------------------------------------------------------

function makeMaterialCatalog(overrides: Partial<Material> = {}): MaterialCatalog {
  return buildMaterialCatalog([makeMaterial(overrides)]);
}

function makeMachineCatalog(overrides: Partial<Machine> = {}): MachineCatalog {
  return buildMachineCatalog([makeMachine(overrides)]);
}

const defaultCommercial: CommercialTerms = { marginPct: 0, taxPct: 0 };

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("DEFAULT_TOOLING_BATCH is 0", () => {
    expect(DEFAULT_TOOLING_BATCH).toBe(0);
  });

  it("DEFAULT_INSPECTION_BATCH is 0", () => {
    expect(DEFAULT_INSPECTION_BATCH).toBe(0);
  });

  it("DEFAULT_QUANTITY_BREAKS is [1, 10, 25, 100, 250]", () => {
    expect([...DEFAULT_QUANTITY_BREAKS]).toEqual([1, 10, 25, 100, 250]);
  });
});

// ---------------------------------------------------------------------------
// buildMaterialCatalog
// ---------------------------------------------------------------------------

describe("buildMaterialCatalog", () => {
  it("indexes materials by id", () => {
    const mat = makeMaterial({ id: "m1", costPerKg: 50 });
    const catalog = buildMaterialCatalog([mat]);
    expect(catalog["m1"]).toBeDefined();
    expect(catalog["m1"]!.costPerKg).toBe(50);
  });

  it("includes all relevant fields for each material", () => {
    const mat = makeMaterial({ densityKgPerM3: 2700, formRates: { round: 80 }, currency: "USD" });
    const catalog = buildMaterialCatalog([mat]);
    const entry = catalog["mat-1"]!;
    expect(entry.densityKgPerM3).toBe(2700);
    expect(entry.formRates).toEqual({ round: 80 });
    expect(entry.currency).toBe("USD");
  });

  it("returns empty catalog for empty array", () => {
    expect(buildMaterialCatalog([])).toEqual({});
  });

  it("indexes multiple materials by their ids", () => {
    const m1 = makeMaterial({ id: "m1" });
    const m2 = makeMaterial({ id: "m2" });
    const catalog = buildMaterialCatalog([m1, m2]);
    expect(Object.keys(catalog)).toEqual(["m1", "m2"]);
  });
});

// ---------------------------------------------------------------------------
// buildMachineCatalog
// ---------------------------------------------------------------------------

describe("buildMachineCatalog", () => {
  it("indexes machines by id", () => {
    const mach = makeMachine({ id: "m1", ratePerHour: 500 });
    const catalog = buildMachineCatalog([mach]);
    expect(catalog["m1"]!.ratePerHour).toBe(500);
  });

  it("returns empty catalog for empty array", () => {
    expect(buildMachineCatalog([])).toEqual({});
  });

  it("indexes multiple machines by their ids", () => {
    const m1 = makeMachine({ id: "m1" });
    const m2 = makeMachine({ id: "m2" });
    const catalog = buildMachineCatalog([m1, m2]);
    expect(Object.keys(catalog)).toEqual(["m1", "m2"]);
  });
});

// ---------------------------------------------------------------------------
// stockVolumeMm3
// ---------------------------------------------------------------------------

describe("stockVolumeMm3", () => {
  it("calculates rect volume as L×W×H", () => {
    const stock: Stock = { shape: "rect", dims: { L: 100, W: 50, H: 20 } };
    expect(stockVolumeMm3(stock)).toBe(100000);
  });

  it("calculates round volume as π(D/2)²×L", () => {
    const stock: Stock = { shape: "round", dims: { D: 20, L: 100 } };
    const expected = Math.PI * 10 * 10 * 100;
    expect(stockVolumeMm3(stock)).toBeCloseTo(expected, 6);
  });

  it("calculates hex volume as (√3/2)×AF²×L", () => {
    const stock: Stock = { shape: "hex", dims: { AF: 20, L: 100 } };
    const expected = (Math.sqrt(3) / 2) * 400 * 100;
    expect(stockVolumeMm3(stock)).toBeCloseTo(expected, 6);
  });

  it("returns 0 for unknown shape", () => {
    const stock: Stock = { shape: "triangle", dims: { A: 10 } };
    expect(stockVolumeMm3(stock)).toBe(0);
  });

  it("returns 0 for rect with missing dims (treated as 0)", () => {
    const stock: Stock = { shape: "rect", dims: {} };
    expect(stockVolumeMm3(stock)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// materialRate
// ---------------------------------------------------------------------------

describe("materialRate", () => {
  it("returns costPerKg when no stockShape is given and no formRates", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 120 });
    expect(materialRate(catalog, "mat-1")).toBe(120);
  });

  it("returns formRate for the given shape when present", () => {
    const catalog = makeMaterialCatalog({ formRates: { round: 150 }, costPerKg: 100 });
    expect(materialRate(catalog, "mat-1", "round")).toBe(150);
  });

  it("falls back to costPerKg when shape not in formRates", () => {
    const catalog = makeMaterialCatalog({ formRates: { round: 150 }, costPerKg: 100 });
    expect(materialRate(catalog, "mat-1", "rect")).toBe(100);
  });

  it("falls back to first formRate value when costPerKg is 0 and no shape given", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 0, formRates: { round: 80 } });
    expect(materialRate(catalog, "mat-1")).toBe(80);
  });

  it("returns 0 for unknown materialId (missing material)", () => {
    const catalog = makeMaterialCatalog();
    expect(materialRate(catalog, "unknown-id")).toBe(0);
  });

  it("returns 0 when empty catalog and missing material", () => {
    expect(materialRate({}, "mat-1")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// effectivePartRate
// ---------------------------------------------------------------------------

describe("effectivePartRate", () => {
  it("uses materialRateOverride when finite", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ materialRateOverride: 200 });
    expect(effectivePartRate(part, catalog)).toBe(200);
  });

  it("falls back to catalog rate when materialRateOverride is null", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ materialRateOverride: null });
    expect(effectivePartRate(part, catalog)).toBe(100);
  });

  it("falls back to catalog rate when materialRateOverride is undefined", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ materialRateOverride: undefined });
    expect(effectivePartRate(part, catalog)).toBe(100);
  });

  it("falls back to catalog rate when materialRateOverride is NaN", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ materialRateOverride: NaN });
    expect(effectivePartRate(part, catalog)).toBe(100);
  });

  it("returns 0 when material is missing from catalog and no override", () => {
    const part = makePart({ material: "unknown", materialRateOverride: undefined });
    expect(effectivePartRate(part, {})).toBe(0);
  });

  it("uses stock shape for catalog lookup when no override", () => {
    const catalog = makeMaterialCatalog({ formRates: { round: 150 }, costPerKg: 100 });
    const part = makePart({ stock: { shape: "round", dims: { D: 20, L: 100 } }, materialRateOverride: undefined });
    expect(effectivePartRate(part, catalog)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// stockMassKg
// ---------------------------------------------------------------------------

describe("stockMassKg", () => {
  it("returns 0 when stock is null", () => {
    const catalog = makeMaterialCatalog({ densityKgPerM3: 7850 });
    expect(stockMassKg(null, "mat-1", catalog)).toBe(0);
  });

  it("computes mass from volume × density for rect stock", () => {
    const stock: Stock = { shape: "rect", dims: { L: 100, W: 50, H: 20 } };
    // volume = 100000 mm³ = 100000e-9 m³; mass = 100000e-9 * 7850
    const catalog = makeMaterialCatalog({ densityKgPerM3: 7850 });
    const expected = 100000 * 1e-9 * 7850;
    expect(stockMassKg(stock, "mat-1", catalog)).toBeCloseTo(expected, 9);
  });

  it("returns 0 when material is missing from catalog", () => {
    const stock: Stock = { shape: "rect", dims: { L: 100, W: 50, H: 20 } };
    expect(stockMassKg(stock, "unknown-mat", {})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// partNetMassKg
// ---------------------------------------------------------------------------

describe("partNetMassKg", () => {
  it("computes mass from netVolumeMm3 × density when netVolumeMm3 is set", () => {
    const catalog = makeMaterialCatalog({ densityKgPerM3: 7850 });
    const part = makePart({ netVolumeMm3: 1000000 }); // 1e6 mm³
    const expected = 1000000 * 1e-9 * 7850;
    expect(partNetMassKg(part, catalog)).toBeCloseTo(expected, 9);
  });

  it("falls back to part.mass when netVolumeMm3 is not set", () => {
    const catalog = makeMaterialCatalog();
    const part = makePart({ netVolumeMm3: undefined, mass: 1.25 });
    expect(partNetMassKg(part, catalog)).toBe(1.25);
  });

  it("returns 0 when netVolumeMm3 not set and mass is 0", () => {
    const catalog = makeMaterialCatalog();
    const part = makePart({ netVolumeMm3: undefined, mass: 0 });
    expect(partNetMassKg(part, catalog)).toBe(0);
  });

  it("returns 0 when material is missing from catalog with netVolumeMm3", () => {
    const part = makePart({ netVolumeMm3: 1000000, material: "unknown" });
    expect(partNetMassKg(part, {})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// partQuantity
// ---------------------------------------------------------------------------

describe("partQuantity", () => {
  it("returns perAssembly × assemblyQuantity", () => {
    const part = makePart({ perAssembly: 3 });
    expect(partQuantity(part, 4)).toBe(12);
  });

  it("returns 0 when assemblyQuantity is 0", () => {
    const part = makePart({ perAssembly: 3 });
    expect(partQuantity(part, 0)).toBe(0);
  });

  it("returns 0 when perAssembly is 0", () => {
    const part = makePart({ perAssembly: 0 });
    expect(partQuantity(part, 10)).toBe(0);
  });

  it("clamps negative perAssembly to 0", () => {
    const part = makePart({ perAssembly: -5 });
    expect(partQuantity(part, 10)).toBe(0);
  });

  it("clamps negative assemblyQuantity to 0", () => {
    const part = makePart({ perAssembly: 3 });
    expect(partQuantity(part, -4)).toBe(0);
  });

  it("clamps both negative values to 0", () => {
    const part = makePart({ perAssembly: -2 });
    expect(partQuantity(part, -3)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// operationRate
// ---------------------------------------------------------------------------

describe("operationRate", () => {
  it("uses rateOverride when finite", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ rateOverride: 800 });
    expect(operationRate(op, catalog)).toBe(800);
  });

  it("falls back to machine catalog rate when rateOverride is null", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ rateOverride: null });
    expect(operationRate(op, catalog)).toBe(1200);
  });

  it("falls back to machine catalog rate when rateOverride is undefined", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ rateOverride: undefined });
    expect(operationRate(op, catalog)).toBe(1200);
  });

  it("falls back to machine catalog rate when rateOverride is NaN", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ rateOverride: NaN });
    expect(operationRate(op, catalog)).toBe(1200);
  });

  it("returns 0 when machine is not in catalog and no override", () => {
    const op = makeOp({ machine: "unknown-mach", rateOverride: undefined });
    expect(operationRate(op, {})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// operationCost
// ---------------------------------------------------------------------------

describe("operationCost", () => {
  it("computes (setupMin/60 + cycleMin/60 × qty) × rate", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ setupMin: 30, cycleMin: 10 });
    // (30/60 + 10/60 * 5) * 1200 = (0.5 + 0.8333) * 1200 = 1600
    expect(operationCost(op, 5, catalog)).toBeCloseTo(1600, 6);
  });

  it("returns only setup cost when quantity is 0", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const op = makeOp({ setupMin: 60, cycleMin: 10 });
    // (60/60 + 0) * 1200 = 1200
    expect(operationCost(op, 0, catalog)).toBeCloseTo(1200, 6);
  });

  it("returns 0 when machine is missing from catalog", () => {
    const op = makeOp({ machine: "unknown", setupMin: 30, cycleMin: 10 });
    expect(operationCost(op, 5, {})).toBe(0);
  });

  it("uses rateOverride in cost calculation", () => {
    const op = makeOp({ setupMin: 60, cycleMin: 0, rateOverride: 600 });
    // (60/60 + 0) * 600 = 600
    expect(operationCost(op, 1, {})).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// operationMinutes
// ---------------------------------------------------------------------------

describe("operationMinutes", () => {
  it("returns setupMin + cycleMin × qty", () => {
    const op = makeOp({ setupMin: 30, cycleMin: 10 });
    expect(operationMinutes(op, 5)).toBe(80);
  });

  it("returns setupMin when qty is 0 (zero operations contribution)", () => {
    const op = makeOp({ setupMin: 30, cycleMin: 10 });
    expect(operationMinutes(op, 0)).toBe(30);
  });

  it("returns 0 when both setupMin and cycleMin are 0", () => {
    const op = makeOp({ setupMin: 0, cycleMin: 0 });
    expect(operationMinutes(op, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// partMaterialCost
// ---------------------------------------------------------------------------

describe("partMaterialCost", () => {
  it("uses net mass (part.mass fallback) when no stock", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ mass: 1.0, stock: null });
    // mass=1, rate=100, qty=1*1=1 → 100
    expect(partMaterialCost(part, 1, catalog)).toBeCloseTo(100, 6);
  });

  it("returns 0 when assemblyQuantity is 0", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ mass: 1.0, stock: null });
    expect(partMaterialCost(part, 0, catalog)).toBe(0);
  });

  it("returns 0 when material is missing from catalog", () => {
    const part = makePart({ material: "unknown", mass: 1.0, stock: null });
    expect(partMaterialCost(part, 5, {})).toBe(0);
  });

  it("scales with quantity", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const part = makePart({ mass: 2.0, stock: null, perAssembly: 2 });
    // mass=2, rate=100, qty=2*3=6 → 1200
    expect(partMaterialCost(part, 3, catalog)).toBeCloseTo(1200, 6);
  });

  it("uses stock mass when part.stocked is falsy and stock is set", () => {
    const stock: Stock = { shape: "rect", dims: { L: 100, W: 50, H: 20 } };
    const catalog = makeMaterialCatalog({ densityKgPerM3: 7850, costPerKg: 100 });
    const part = makePart({ stock, stocked: false, mass: 99 });
    // stock volume = 100000 mm³ → 100000e-9 m³ * 7850 kg/m³ * 100 ₹/kg * 1
    const expected = 100000 * 1e-9 * 7850 * 100 * 1;
    expect(partMaterialCost(part, 1, catalog)).toBeCloseTo(expected, 4);
  });
});

// ---------------------------------------------------------------------------
// partSetupCost
// ---------------------------------------------------------------------------

describe("partSetupCost", () => {
  it("sums (setupMin/60 × rate) across operations", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makePart({ operations: [makeOp({ setupMin: 30, cycleMin: 0 })] });
    // 30/60 * 1200 = 600
    expect(partSetupCost(part, catalog)).toBeCloseTo(600, 6);
  });

  it("returns 0 when operations array is empty", () => {
    const catalog = makeMachineCatalog();
    const part = makePart({ operations: [] });
    expect(partSetupCost(part, catalog)).toBe(0);
  });

  it("sums across multiple operations", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const ops = [makeOp({ id: "op1", setupMin: 30 }), makeOp({ id: "op2", setupMin: 60 })];
    const part = makePart({ operations: ops });
    // (30/60 + 60/60) * 1200 = 1.5 * 1200 = 1800
    expect(partSetupCost(part, catalog)).toBeCloseTo(1800, 6);
  });

  it("is not scaled by quantity (no assemblyQuantity parameter)", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makePart({ operations: [makeOp({ setupMin: 60 })], perAssembly: 10 });
    // setup is fixed regardless of perAssembly
    expect(partSetupCost(part, catalog)).toBeCloseTo(1200, 6);
  });
});

// ---------------------------------------------------------------------------
// partMachineCost
// ---------------------------------------------------------------------------

describe("partMachineCost", () => {
  it("sums (cycleMin/60 × rate × qty) across operations", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makePart({ operations: [makeOp({ setupMin: 0, cycleMin: 10 })] });
    // 10/60 * 1200 * 5 = 1000
    expect(partMachineCost(part, 5, catalog)).toBeCloseTo(1000, 6);
  });

  it("returns 0 when assemblyQuantity is 0", () => {
    const catalog = makeMachineCatalog();
    const part = makePart({ operations: [makeOp({ cycleMin: 10 })] });
    expect(partMachineCost(part, 0, catalog)).toBe(0);
  });

  it("returns 0 when operations array is empty", () => {
    const catalog = makeMachineCatalog();
    const part = makePart({ operations: [] });
    expect(partMachineCost(part, 5, catalog)).toBe(0);
  });

  it("scales cycle cost with total quantity (perAssembly × assemblyQuantity)", () => {
    const catalog = makeMachineCatalog({ ratePerHour: 600 });
    const part = makePart({ perAssembly: 2, operations: [makeOp({ setupMin: 0, cycleMin: 60 })] });
    // cycleMin/60 * rate * (perAssembly * assemblyQty) = 1 * 600 * (2*3) = 3600
    expect(partMachineCost(part, 3, catalog)).toBeCloseTo(3600, 6);
  });
});

// ---------------------------------------------------------------------------
// partFinishingCost
// ---------------------------------------------------------------------------

describe("partFinishingCost", () => {
  it("returns finishing × partQuantity", () => {
    const part = makePart({ finishing: 50, perAssembly: 2 });
    // 50 * (2 * 3) = 300
    expect(partFinishingCost(part, 3)).toBe(300);
  });

  it("returns 0 when assemblyQuantity is 0", () => {
    const part = makePart({ finishing: 50 });
    expect(partFinishingCost(part, 0)).toBe(0);
  });

  it("returns 0 when finishing is 0", () => {
    const part = makePart({ finishing: 0 });
    expect(partFinishingCost(part, 5)).toBe(0);
  });

  it("returns 0 when finishing is null/undefined (treated as 0 by finite())", () => {
    const part = makePart({ finishing: null as unknown as number });
    expect(partFinishingCost(part, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// partSubtotal
// ---------------------------------------------------------------------------

describe("partSubtotal", () => {
  it("returns 0 when part.included is false", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog();
    const part = makePart({ included: false, mass: 1.0, stock: null });
    expect(partSubtotal(part, 5, catalog, machCatalog)).toBe(0);
  });

  it("sums material + setup + machine costs when included", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makePart({
      included: true,
      mass: 1.0,
      stock: null,
      operations: [makeOp({ setupMin: 60, cycleMin: 0 })],
    });
    // material: 1 * 100 * 1 = 100
    // setup: 60/60 * 1200 = 1200
    // machine: 0
    expect(partSubtotal(part, 1, catalog, machCatalog)).toBeCloseTo(1300, 6);
  });

  it("does NOT include finishing cost in subtotal", () => {
    const catalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog();
    const part = makePart({ included: true, mass: 1.0, finishing: 999, stock: null });
    // finishing is NOT included in partSubtotal
    expect(partSubtotal(part, 1, catalog, machCatalog)).toBeCloseTo(100, 6);
  });
});

// ---------------------------------------------------------------------------
// calculateQuoteRollup
// ---------------------------------------------------------------------------

describe("calculateQuoteRollup", () => {
  it("produces correct subtotal for a single included part", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 2.0, stock: null });
    const rollup = calculateQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.partsCost).toBeCloseTo(200, 6);
    expect(rollup.subtotal).toBeCloseTo(200, 6);
  });

  it("skips excluded parts in the rollup", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const included = makePart({ id: "p1", mass: 2.0, stock: null, included: true });
    const excluded = makePart({ id: "p2", mass: 99.0, stock: null, included: false });
    const rollup = calculateQuoteRollup([included, excluded], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.partsCost).toBeCloseTo(200, 6);
  });

  it("finishingCost is always 0 in rollup (current behavior — not derived from parts)", () => {
    // LIMITATION: calculateQuoteRollup hardcodes finishingCost = 0, ignoring
    // part.finishing entirely. This locks in current behavior for golden tests.
    const matCatalog = makeMaterialCatalog();
    const machCatalog = makeMachineCatalog();
    const part = makePart({ finishing: 500, mass: 1.0, stock: null });
    const rollup = calculateQuoteRollup([part], 5, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.finishingCost).toBe(0);
  });

  it("applies margin percentage to subtotal", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const commercial: CommercialTerms = { marginPct: 20, taxPct: 0 };
    const rollup = calculateQuoteRollup([part], 1, commercial, matCatalog, machCatalog);
    expect(rollup.margin).toBeCloseTo(20, 6);
    expect(rollup.total).toBeCloseTo(120, 6);
  });

  it("applies tax percentage to (subtotal + margin)", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const commercial: CommercialTerms = { marginPct: 0, taxPct: 18 };
    const rollup = calculateQuoteRollup([part], 1, commercial, matCatalog, machCatalog);
    expect(rollup.tax).toBeCloseTo(18, 6);
    expect(rollup.total).toBeCloseTo(118, 6);
  });

  it("unitPrice is total / assemblyQuantity", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const rollup = calculateQuoteRollup([part], 10, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.unitPrice).toBeCloseTo(rollup.total / 10, 6);
  });

  it("unitPrice is 0 when assemblyQuantity is 0 (no division by zero)", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const rollup = calculateQuoteRollup([part], 0, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.unitPrice).toBe(0);
  });

  it("currency falls back to INR when no options.currency and no included material", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {});
    expect(rollup.currency).toBe("INR");
  });

  it("currency uses first included material's currency when no options.currency", () => {
    const matCatalog = makeMaterialCatalog({ currency: "EUR" });
    const machCatalog = makeMachineCatalog();
    const part = makePart({ mass: 1.0, stock: null, included: true });
    const rollup = calculateQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.currency).toBe("EUR");
  });

  it("currency from options.currency overrides all other sources", () => {
    const matCatalog = makeMaterialCatalog({ currency: "EUR" });
    const machCatalog = makeMachineCatalog();
    const part = makePart({ mass: 1.0, stock: null });
    const rollup = calculateQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog, { currency: "USD" });
    expect(rollup.currency).toBe("USD");
  });

  it("BoP cost: non-integer qtyPerAssembly is truncated to integer", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 0 });
    const machCatalog = makeMachineCatalog();
    const bops = [{ qtyPerAssembly: 3.7, unitCost: 10 }];
    // trunc(3.7) = 3; bopCost = 10 * 3 * 1 = 30
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, matCatalog, machCatalog, { bops });
    expect(rollup.bopCost).toBe(30);
  });

  it("BoP cost: negative qtyPerAssembly clamps to 0", () => {
    const bops = [{ qtyPerAssembly: -5, unitCost: 10 }];
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {}, { bops });
    expect(rollup.bopCost).toBe(0);
  });

  it("BoP cost: negative unitCost clamps to 0", () => {
    const bops = [{ qtyPerAssembly: 2, unitCost: -50 }];
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {}, { bops });
    expect(rollup.bopCost).toBe(0);
  });

  it("extraCosts: sums only positive amounts", () => {
    const extraCosts = [{ amount: 100 }, { amount: -50 }, { amount: 200 }];
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {}, { extraCosts });
    expect(rollup.extraCost).toBe(300);
  });

  it("extraCost is added after tax (not subject to margin or tax)", () => {
    const extraCosts = [{ amount: 500 }];
    const commercial: CommercialTerms = { marginPct: 10, taxPct: 10 };
    // subtotal=0, margin=0, tax=0, total = 0 + 500 = 500
    const rollup = calculateQuoteRollup([], 1, commercial, {}, {}, { extraCosts });
    expect(rollup.total).toBe(500);
    expect(rollup.subtotal).toBe(0);
  });

  it("toolingCost and inspectionCost are added to subtotal", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {}, {
      toolingCost: 100,
      inspectionCost: 50,
    });
    expect(rollup.tooling).toBe(100);
    expect(rollup.inspection).toBe(50);
    expect(rollup.subtotal).toBe(150);
  });

  it("defaults toolingCost to DEFAULT_TOOLING_BATCH (0) when not provided", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {});
    expect(rollup.tooling).toBe(DEFAULT_TOOLING_BATCH);
  });

  it("defaults inspectionCost to DEFAULT_INSPECTION_BATCH (0) when not provided", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {});
    expect(rollup.inspection).toBe(DEFAULT_INSPECTION_BATCH);
  });
});

// ---------------------------------------------------------------------------
// calculateConfiguredQuoteRollup
// ---------------------------------------------------------------------------

describe("calculateConfiguredQuoteRollup", () => {
  it("returns the probe rollup when both partsCost and bopCost are 0", () => {
    // No parts, no bops → probe result is returned as-is
    const rollup = calculateConfiguredQuoteRollup([], 1, defaultCommercial, {}, {});
    expect(rollup.partsCost).toBe(0);
    expect(rollup.bopCost).toBe(0);
  });

  it("always uses toolingCost=0 and inspectionCost=0 in the computation", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const rollup = calculateConfiguredQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.tooling).toBe(0);
    expect(rollup.inspection).toBe(0);
  });

  it("computes correct partsCost when parts have cost", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 2.0, stock: null });
    const rollup = calculateConfiguredQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.partsCost).toBeCloseTo(200, 6);
  });
});

// ---------------------------------------------------------------------------
// buildQuantityBreaks
// ---------------------------------------------------------------------------

describe("buildQuantityBreaks", () => {
  it("returns 5 entries using DEFAULT_QUANTITY_BREAKS by default", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const breaks = buildQuantityBreaks([part], defaultCommercial, matCatalog, machCatalog);
    expect(breaks).toHaveLength(5);
    expect(breaks.map(b => b.q)).toEqual([1, 10, 25, 100, 250]);
  });

  it("uses custom breaks array when provided", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const breaks = buildQuantityBreaks([part], defaultCommercial, matCatalog, machCatalog, [5, 50, 500]);
    expect(breaks).toHaveLength(3);
    expect(breaks.map(b => b.q)).toEqual([5, 50, 500]);
  });

  it("unit price is 0 when q is 0 in breaks (no division by zero)", () => {
    const breaks = buildQuantityBreaks([], defaultCommercial, {}, {}, [0, 1]);
    expect(breaks[0]!.unit).toBe(0);
  });

  it("unit price equals total / q for positive q", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const breaks = buildQuantityBreaks([part], defaultCommercial, matCatalog, machCatalog, [10]);
    expect(breaks[0]!.unit).toBeCloseTo(breaks[0]!.total / 10, 6);
  });

  it("total cost increases with quantity for variable-cost parts", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 1.0, stock: null });
    const breaks = buildQuantityBreaks([part], defaultCommercial, matCatalog, machCatalog);
    // total[q=250] > total[q=1]
    expect(breaks[4]!.total).toBeGreaterThan(breaks[0]!.total);
  });
});

// ---------------------------------------------------------------------------
// toQuoteCostSnapshot
// ---------------------------------------------------------------------------

describe("toQuoteCostSnapshot", () => {
  it("rounds every numeric field to 2 decimal places", () => {
    const rollup = calculateQuoteRollup(
      [makePart({ mass: 1.0, stock: null })],
      3,
      { marginPct: 10, taxPct: 10 },
      makeMaterialCatalog({ costPerKg: 100 }),
      makeMachineCatalog({ ratePerHour: 0 }),
    );
    const snap = toQuoteCostSnapshot(rollup);
    // Check all numeric fields are rounded to 2dp
    const numericFields = ["partsCost", "tooling", "inspection", "subtotal", "margin", "tax", "total", "unitPrice"] as const;
    for (const field of numericFields) {
      const val = snap[field];
      expect(val).toBe(Math.round((val + Number.EPSILON) * 100) / 100);
    }
  });

  it("no float drift: messy float inputs produce exact 2dp output", () => {
    // Use inputs that produce floating-point mess: 1/3 rate per unit
    // mass = 0.1, costPerKg = 333.33, qty = 3 → materialCost ≈ 99.999
    const matCatalog = makeMaterialCatalog({ costPerKg: 333.33 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 0.1, stock: null });
    const rollup = calculateQuoteRollup([part], 3, defaultCommercial, matCatalog, machCatalog);
    const snap = toQuoteCostSnapshot(rollup);
    // Verify the snapshot value equals its own 2dp rounding (no drift beyond 2dp)
    expect(snap.partsCost).toBe(Math.round((snap.partsCost + Number.EPSILON) * 100) / 100);
    expect(snap.total).toBe(Math.round((snap.total + Number.EPSILON) * 100) / 100);
  });

  it("includes computedAt as a valid ISO string", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {});
    const snap = toQuoteCostSnapshot(rollup);
    expect(typeof snap.computedAt).toBe("string");
    expect(() => new Date(snap.computedAt)).not.toThrow();
    expect(new Date(snap.computedAt).toISOString()).toBe(snap.computedAt);
  });

  it("preserves currency string unchanged", () => {
    const rollup = calculateQuoteRollup([], 1, defaultCommercial, {}, {}, { currency: "USD" });
    const snap = toQuoteCostSnapshot(rollup);
    expect(snap.currency).toBe("USD");
  });

  it("rounds 0.3 correctly (classic 0.1+0.2 float issue)", () => {
    // Construct a rollup where total is exactly 0.1 + 0.2 = 0.30000000000000004
    // Use mass=0.001 kg, rate=300 ₹/kg, qty=1 → materialCost = 0.3
    const matCatalog = makeMaterialCatalog({ costPerKg: 300 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 0 });
    const part = makePart({ mass: 0.001, stock: null });
    const rollup = calculateQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    const snap = toQuoteCostSnapshot(rollup);
    expect(snap.total).toBe(0.30);
  });
});

// ---------------------------------------------------------------------------
// Feature-based costing
// ---------------------------------------------------------------------------

describe("feature-based costing", () => {
  // Helper to build a part with features
  function makeFeaturePart(features: FeatureInput[], opOverrides: Partial<Op>[] = [{}]): PartWithFeatures {
    return {
      ...makePart({
        operations: opOverrides.map((o, i) => makeOp({ id: `op-${i}`, ...o })),
      }),
      features,
    };
  }

  // -- featureCycleMinutes unit tests ----------------------------------------

  it("returns 0 for undefined features", () => {
    expect(featureCycleMinutes(undefined)).toBe(0);
  });

  it("returns 0 for empty features array", () => {
    expect(featureCycleMinutes([])).toBe(0);
  });

  // -- Hole drill time -------------------------------------------------------

  it("hole drill time: π·(d/2)²·depth / DRILL_RATE", () => {
    const hole: FeatureInput = {
      featureType: "hole",
      featureData: {
        kind: "through",
        diameter: 10,
        depth: 20,
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        faceIds: ["f1"],
      },
    };
    const expected = (Math.PI * 25 * 20) / DRILL_RATE_MM3_PER_MIN;
    expect(featureCycleMinutes([hole])).toBeCloseTo(expected, 8);
  });

  it("hole contributes machine cost via partFeatureCost", () => {
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const hole: FeatureInput = {
      featureType: "hole",
      featureData: {
        kind: "through",
        diameter: 10,
        depth: 20,
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        faceIds: ["f1"],
      },
    };
    const part = makeFeaturePart([hole]);
    const cost = partFeatureCost(part, 1, machCatalog);
    const expectedMin = (Math.PI * 25 * 20) / DRILL_RATE_MM3_PER_MIN;
    const expectedCost = (expectedMin / 60) * 1200 * 1;
    expect(cost).toBeCloseTo(expectedCost, 6);
    expect(cost).toBeGreaterThan(0);
  });

  // -- Threaded hole ----------------------------------------------------------

  it("threaded hole = drill time + tap time", () => {
    const thread: FeatureInput = {
      featureType: "thread",
      featureData: {
        designation: "M6x1.0",
        pitch: 1.0,
        length: 15,
        gender: "internal",
        diameter: 5.0,
        faceIds: ["f1"],
      },
    };
    const r = 2.5;
    const drillMin = (Math.PI * r * r * 15) / DRILL_RATE_MM3_PER_MIN;
    const tapMin = 15 / TAP_RATE_MM_PER_MIN;
    expect(featureCycleMinutes([thread])).toBeCloseTo(drillMin + tapMin, 8);
  });

  // -- Pocket mill time -------------------------------------------------------

  it("pocket mill time: depth × footprint / POCKET_RATE", () => {
    const pocket: FeatureInput = {
      featureType: "pocket",
      featureData: {
        kind: "closed",
        depth: 10,
        footprintAreaMm2: 500,
        accessDirections: [[0, 0, 1]],
        wallCount: 4,
        faceIds: ["f1", "f2"],
      },
    };
    const expected = (10 * 500) / POCKET_MILL_RATE_MM3_PER_MIN;
    expect(featureCycleMinutes([pocket])).toBeCloseTo(expected, 8);
  });

  // -- Slot mill time ---------------------------------------------------------

  it("slot mill time: L × W × D / SLOT_RATE", () => {
    const slot: FeatureInput = {
      featureType: "slot",
      featureData: {
        kind: "rounded",
        lengthMm: 40,
        widthMm: 8,
        depthMm: 5,
        axis: [1, 0, 0] as [number, number, number],
        faceIds: ["f1"],
      },
    };
    const expected = (40 * 8 * 5) / SLOT_MILL_RATE_MM3_PER_MIN;
    expect(featureCycleMinutes([slot])).toBeCloseTo(expected, 8);
  });

  // -- Fillet path length -----------------------------------------------------

  it("fillet finishing pass: lengthMm / FILLET_CHAMFER_RATE", () => {
    const fillet: FeatureInput = {
      featureType: "fillet",
      featureData: {
        radius: 2,
        lengthMm: 60,
        adjacentFaceIds: ["a1", "a2"],
        concavity: "concave" as const,
        faceIds: ["f1"],
      },
    };
    const expected = 60 / FILLET_CHAMFER_RATE_MM_PER_MIN;
    expect(featureCycleMinutes([fillet])).toBeCloseTo(expected, 8);
  });

  // -- Chamfer path length ----------------------------------------------------

  it("chamfer finishing pass: lengthMm / FILLET_CHAMFER_RATE", () => {
    const chamfer: FeatureInput = {
      featureType: "chamfer",
      featureData: {
        widthMm: 1,
        angleDeg: 45,
        lengthMm: 30,
        adjacentFaceIds: ["a1", "a2"],
        faceId: "f1",
      },
    };
    const expected = 30 / FILLET_CHAMFER_RATE_MM_PER_MIN;
    expect(featureCycleMinutes([chamfer])).toBeCloseTo(expected, 8);
  });

  // -- Boss = 0 cost ----------------------------------------------------------

  it("bosses contribute zero cost", () => {
    const boss: FeatureInput = {
      featureType: "boss",
      featureData: {
        kind: "round",
        height: 10,
        baseFaceId: "base",
        faceIds: ["f1", "f2"],
        diameter: 20,
      },
    };
    expect(featureCycleMinutes([boss])).toBe(0);

    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makeFeaturePart([boss]);
    expect(partFeatureCost(part, 1, machCatalog)).toBe(0);
  });

  // -- Operator override beats feature-derived value --------------------------

  it("operator manual override on operation is preserved alongside feature cost", () => {
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const hole: FeatureInput = {
      featureType: "hole",
      featureData: {
        kind: "through",
        diameter: 10,
        depth: 20,
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        faceIds: ["f1"],
      },
    };
    // Operation with rateOverride — operator controls this op's cost
    const part = makeFeaturePart([hole], [{ setupMin: 30, cycleMin: 10, rateOverride: 500 }]);

    // Feature cost uses the first op's effective rate (500 override)
    const featureCost = partFeatureCost(part, 1, machCatalog);
    const featureMin = featureCycleMinutes([hole]);
    expect(featureCost).toBeCloseTo((featureMin / 60) * 500 * 1, 6);

    // Machine cost = operation cycle cost (uses override) + feature cost
    const totalMachineCost = partMachineCost(part, 1, machCatalog);
    const opCycleCost = (10 / 60) * 500 * 1;
    expect(totalMachineCost).toBeCloseTo(opCycleCost + featureCost, 6);
  });

  // -- Legacy (no features) matches today exactly -----------------------------

  it("part without features produces zero feature cost", () => {
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makePart({ operations: [makeOp({ setupMin: 30, cycleMin: 10 })] });
    expect(partFeatureCost(part, 5, machCatalog)).toBe(0);

    // Machine cost is purely operation-based
    const expected = (10 / 60) * 1200 * 5;
    expect(partMachineCost(part, 5, machCatalog)).toBeCloseTo(expected, 6);
  });

  it("part with empty features array produces zero feature cost", () => {
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part: PartWithFeatures = { ...makePart({ operations: [makeOp()] }), features: [] };
    expect(partFeatureCost(part, 1, machCatalog)).toBe(0);
  });

  // -- Performance guard ------------------------------------------------------

  it("100-feature rollup completes in under 50 ms", () => {
    const features: FeatureInput[] = [];
    for (let i = 0; i < 20; i++) {
      features.push({
        featureType: "hole",
        featureData: {
          kind: "through", diameter: 6, depth: 15,
          axisOrigin: [i, 0, 0], axisDirection: [0, 0, 1], faceIds: [`h${i}`],
        },
      });
    }
    for (let i = 0; i < 20; i++) {
      features.push({
        featureType: "pocket",
        featureData: {
          kind: "closed", depth: 5, footprintAreaMm2: 200,
          accessDirections: [[0, 0, 1]], wallCount: 4, faceIds: [`p${i}`],
        },
      });
    }
    for (let i = 0; i < 20; i++) {
      features.push({
        featureType: "slot",
        featureData: {
          kind: "rounded", lengthMm: 30, widthMm: 6, depthMm: 4,
          axis: [1, 0, 0] as [number, number, number], faceIds: [`s${i}`],
        },
      });
    }
    for (let i = 0; i < 20; i++) {
      features.push({
        featureType: "fillet",
        featureData: {
          radius: 2, lengthMm: 40,
          adjacentFaceIds: [`a${i}`], concavity: "concave" as const, faceIds: [`fl${i}`],
        },
      });
    }
    for (let i = 0; i < 20; i++) {
      features.push({
        featureType: "chamfer",
        featureData: {
          widthMm: 1, angleDeg: 45, lengthMm: 25,
          adjacentFaceIds: [`a${i}`], faceId: `ch${i}`,
        },
      });
    }

    expect(features).toHaveLength(100);

    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const part = makeFeaturePart(features);

    const start = performance.now();
    const cost = partFeatureCost(part, 10, machCatalog);
    const elapsed = performance.now() - start;

    expect(cost).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  // -- Feature cost flows through to partSubtotal and rollup ------------------

  it("feature cost is included in partSubtotal", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 100 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 1200 });
    const hole: FeatureInput = {
      featureType: "hole",
      featureData: {
        kind: "through",
        diameter: 10,
        depth: 20,
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        faceIds: ["f1"],
      },
    };
    const part: PartWithFeatures = {
      ...makePart({
        mass: 1.0,
        stock: null,
        operations: [makeOp({ setupMin: 0, cycleMin: 0 })],
      }),
      features: [hole],
    };

    const featureCost = partFeatureCost(part, 1, machCatalog);
    const subtotal = partSubtotal(part, 1, matCatalog, machCatalog);
    // subtotal = material (100) + setup (0) + machine (0 ops + featureCost)
    expect(subtotal).toBeCloseTo(100 + featureCost, 6);
    expect(featureCost).toBeGreaterThan(0);
  });

  it("feature cost is included in calculateQuoteRollup", () => {
    const matCatalog = makeMaterialCatalog({ costPerKg: 0 });
    const machCatalog = makeMachineCatalog({ ratePerHour: 600 });
    const pocket: FeatureInput = {
      featureType: "pocket",
      featureData: {
        kind: "closed",
        depth: 10,
        footprintAreaMm2: 500,
        accessDirections: [[0, 0, 1]],
        wallCount: 4,
        faceIds: ["f1"],
      },
    };
    const part: PartWithFeatures = {
      ...makePart({
        mass: 0,
        stock: null,
        operations: [makeOp({ setupMin: 0, cycleMin: 0 })],
      }),
      features: [pocket],
    };

    const rollup = calculateQuoteRollup([part], 1, defaultCommercial, matCatalog, machCatalog);
    expect(rollup.machineCost).toBeGreaterThan(0);
    expect(rollup.partsCost).toBeGreaterThan(0);
  });
});
