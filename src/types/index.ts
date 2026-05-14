export type UnitSystem = "metric" | "imperial";

export type MaterialPreset = {
  id: string;
  name: string;
  densityKgPerM3: number;
  costPerKg: number;
  currency: string;
  markupPercent?: number;
};

export type StepGeometryInput = {
  fileName?: string;
  unitSystem?: UnitSystem;
  boundingBoxMm?: {
    x: number;
    y: number;
    z: number;
  };
  volumeMm3?: number;
  surfaceAreaMm2?: number;
  faceCount?: number;
  edgeCount?: number;
  vertexCount?: number;
};

export type GeometrySummary = {
  fileName: string;
  unitSystem: UnitSystem;
  boundingBoxMm: {
    x: number;
    y: number;
    z: number;
  };
  volumeMm3: number;
  surfaceAreaMm2: number;
  volumeCm3: number;
  surfaceAreaCm2: number;
  boundingBoxVolumeMm3: number;
  materialUtilizationPercent: number;
  longestDimensionMm: number;
  shortestDimensionMm: number;
  faceCount: number;
  edgeCount: number;
  vertexCount: number;
};

export type QuoteProcessInput = {
  setupCost: number;
  machineRatePerHour: number;
  machineTimeMinutes: number;
  laborRatePerHour?: number;
  laborTimeMinutes?: number;
  finishingCost?: number;
  inspectionCost?: number;
  toolingCost?: number;
};

export type QuoteInput = {
  id?: string;
  quoteNumber?: string;
  customerName?: string;
  projectName: string;
  partName: string;
  quantity: number;
  material: MaterialPreset;
  geometry: StepGeometryInput;
  process: QuoteProcessInput;
  taxPercent?: number;
  marginPercent?: number;
  discountPercent?: number;
  createdAt?: string;
  notes?: string;
};

export type QuoteCostBreakdown = {
  materialCost: number;
  setupCost: number;
  machineCost: number;
  laborCost: number;
  finishingCost: number;
  inspectionCost: number;
  toolingCost: number;
  subtotal: number;
  discount: number;
  margin: number;
  tax: number;
  total: number;
  unitPrice: number;
};

export type QuoteCalculation = {
  id: string;
  quoteNumber: string;
  customerName?: string;
  projectName: string;
  partName: string;
  quantity: number;
  currency: string;
  material: MaterialPreset;
  geometry: GeometrySummary;
  massKg: number;
  process: Required<QuoteProcessInput>;
  taxPercent: number;
  marginPercent: number;
  discountPercent: number;
  costs: QuoteCostBreakdown;
  createdAt: string;
  notes?: string;
};

export type StorageResult<T> = {
  ok: boolean;
  value: T;
  error?: string;
};

export type PdfExportResult =
  | {
      ok: true;
      fileName: string;
      bytes: Uint8Array;
      mimeType: "application/pdf";
    }
  | {
      ok: false;
      reason: string;
    };
