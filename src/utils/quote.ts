import type {
  QuoteCalculation,
  QuoteCostBreakdown,
  QuoteInput,
  QuoteProcessInput,
} from "../types";
import { estimateMassKg, summarizeGeometry } from "./geometry";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function positive(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
}

function normalizeProcess(
  process: QuoteProcessInput,
): Required<QuoteProcessInput> {
  return {
    setupCost: positive(process.setupCost),
    machineRatePerHour: positive(process.machineRatePerHour),
    machineTimeMinutes: positive(process.machineTimeMinutes),
    laborRatePerHour: positive(process.laborRatePerHour),
    laborTimeMinutes: positive(process.laborTimeMinutes),
    finishingCost: positive(process.finishingCost),
    inspectionCost: positive(process.inspectionCost),
    toolingCost: positive(process.toolingCost),
  };
}

function createQuoteId(): string {
  return `quote-${Date.now().toString(36)}`;
}

function createQuoteNumber(createdAt: string): string {
  const date = new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? Date.now().toString()
    : date.toISOString().slice(0, 10).replaceAll("-", "");

  return `Q-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function calculateQuote(input: QuoteInput): QuoteCalculation {
  const quantity = Math.max(1, Math.trunc(positive(input.quantity)));
  const geometry = summarizeGeometry(input.geometry);
  const process = normalizeProcess(input.process);
  const materialMarkupPercent = positive(input.material.markupPercent);
  const massKg = estimateMassKg(geometry, input.material.densityKgPerM3);
  const materialCost = massKg * input.material.costPerKg * quantity;
  const setupCost = process.setupCost;
  const machineCost =
    (process.machineTimeMinutes / 60) * process.machineRatePerHour * quantity;
  const laborCost =
    (process.laborTimeMinutes / 60) * process.laborRatePerHour * quantity;
  const finishingCost = process.finishingCost * quantity;
  const inspectionCost = process.inspectionCost * quantity;
  const toolingCost = process.toolingCost;
  const preMarkupSubtotal =
    materialCost +
    setupCost +
    machineCost +
    laborCost +
    finishingCost +
    inspectionCost +
    toolingCost;
  const materialMarkup = materialCost * (materialMarkupPercent / 100);
  const subtotal = preMarkupSubtotal + materialMarkup;
  const discount = subtotal * (positive(input.discountPercent) / 100);
  const marginBase = subtotal - discount;
  const margin = marginBase * (positive(input.marginPercent) / 100);
  const taxable = marginBase + margin;
  const tax = taxable * (positive(input.taxPercent) / 100);
  const total = taxable + tax;
  const costs: QuoteCostBreakdown = {
    materialCost: roundMoney(materialCost + materialMarkup),
    setupCost: roundMoney(setupCost),
    machineCost: roundMoney(machineCost),
    laborCost: roundMoney(laborCost),
    finishingCost: roundMoney(finishingCost),
    inspectionCost: roundMoney(inspectionCost),
    toolingCost: roundMoney(toolingCost),
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    margin: roundMoney(margin),
    tax: roundMoney(tax),
    total: roundMoney(total),
    unitPrice: roundMoney(total / quantity),
  };
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    id: input.id ?? createQuoteId(),
    quoteNumber: input.quoteNumber ?? createQuoteNumber(createdAt),
    customerName: input.customerName,
    projectName: input.projectName,
    partName: input.partName,
    quantity,
    currency: input.material.currency,
    material: input.material,
    geometry,
    massKg,
    process,
    taxPercent: positive(input.taxPercent),
    marginPercent: positive(input.marginPercent),
    discountPercent: positive(input.discountPercent),
    costs,
    createdAt,
    notes: input.notes,
  };
}
