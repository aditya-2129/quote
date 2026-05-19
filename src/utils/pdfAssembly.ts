import type { CatalogContextValue } from "@context/CatalogContext";
import type { Customer } from "../db/schema";
import { calculateConfiguredQuoteRollup, effectivePartRate, operationCost as calculateOperationCost, operationRate as calculateOperationRate, partMaterialCost as calculatePartMaterialCost, partQuantity } from "./quoteCosting";
import { fmtStockDims } from "./stock";
import type { Bop, ExtraCost, Part } from "./quoteTypes";
import type { QuotationData, QuotationLineItem } from "./export";
import pacificIndiaLogoUrl from "../assets/pacific-india-logo.jpg";

export const COMPANY_INFO = {
  name: "PACIFIC INDIA VENTURE",
  addressLines: ["Tapkir Plaza, Nigdi, PCMC, Pune 411044"] as string[],
  phone: "9527352858",
  email: "pacificindia.pcmcpune@gmail.com",
  gstn: "27AAKPF1080D1Z4",
  state: "Maharashtra",
  stateCode: "27",
  tagline: "Manufacturing & Supply of SPM, Precision Tools, Die & Components",
  contactPerson: "N. CHANDRA",
  contactPhone: "9527352858",
  contactEmail: "pacificindia.pcmcpune@gmail.com",
} as const;

export const QUOTATION_TERMS = [
  "E. & O.E.",
  "Delivery Period: As mention on PO from the order date and advance.",
  "Payment Terms: As mutually agreed and finalized with the company.",
  "Taxes & Duties: GST @ 18% extra as applicable.",
  "Freight: Charged extra at actuals.",
];

let _logoBytesCache: Uint8Array | null = null;

export async function loadCompanyLogoBytes(): Promise<Uint8Array | null> {
  if (_logoBytesCache) return _logoBytesCache;
  try {
    const response = await fetch(pacificIndiaLogoUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    _logoBytesCache = new Uint8Array(buffer);
    return _logoBytesCache;
  } catch {
    return null;
  }
}

export function dataUrlToBytes(dataUrl: string | null): Uint8Array | null {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function fmtQuotationDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function buildQuotationData(args: {
  rfq: { customer: string; customerId: string | null; project: string; rfqRef: string; notes: string };
  parts: Part[];
  bops: Bop[];
  extraCosts: ExtraCost[];
  asmQty: number;
  commercial: { marginPct: number; taxPct: number };
  quoteNumber: string | null;
  catalog: CatalogContextValue;
  customerRecord?: Customer | null;
}): QuotationData {
  const included = args.parts.filter(p => p.included);
  const { materials, materialCosts, machineCosts, partMaterialLabel, opMachineLabel } = args.catalog;
  const totals = calculateConfiguredQuoteRollup(args.parts, args.asmQty, args.commercial, materialCosts, machineCosts, { bops: args.bops, extraCosts: args.extraCosts });
  const grandTotal = Math.round(totals.total);
  const asmQty = Math.max(1, args.asmQty);
  const unitPrice = grandTotal / asmQty;
  const projectName = args.rfq.project?.trim() || args.quoteNumber || "Job Work";
  const items: QuotationLineItem[] = [{
    partNumber: projectName,
    description: "(Complete set as per model provided, Precision finished & work suitable)",
    materialNote: "Job Material – As required",
    qty: asmQty,
    unit: asmQty > 1 ? "Set" : "Nos",
    unitPrice,
    totalPrice: grandTotal,
  }];

  const refLabel = args.quoteNumber || args.rfq.rfqRef || "DRAFT";
  const cust = args.customerRecord;
  const customerName = cust?.company?.trim() || args.rfq.customer?.trim() || cust?.name?.trim() || "—";
  const customerLines: string[] = [];
  if (cust?.address?.trim()) {
    const addr = cust.address.trim();
    const parts = addr.includes("\n") ? addr.split(/\r?\n/) : addr.split(",");
    for (const p of parts) {
      const line = p.trim();
      if (line) customerLines.push(line);
    }
  }
  if (cust?.name?.trim() && cust.name.trim() !== customerName) customerLines.push(`Kind Attn: ${cust.name.trim()}`);
  const contactBits: string[] = [];
  if (cust?.phone?.trim()) contactBits.push(`Phone: ${cust.phone.trim()}`);
  if (cust?.email?.trim()) contactBits.push(`Email: ${cust.email.trim()}`);
  customerLines.push(...contactBits);
  if (customerLines.length === 0) customerLines.push("—");

  const partMaterials = included
    .filter(p => !materials[p.material]?.isPurchased)
    .map(p => ({
      partName: p.name,
      material: partMaterialLabel(p),
      dimensions: p.stock ? fmtStockDims(p.stock) : "—",
      ratePerKg: effectivePartRate(p, materialCosts),
      cost: calculatePartMaterialCost(p, args.asmQty, materialCosts),
    }));

  const partOperationGroups = included.map(p => ({
    partName: p.name,
    operations: p.operations.length === 0 ? [] : p.operations.map(op => ({
      operation: opMachineLabel(op),
      ratePerHour: calculateOperationRate(op, machineCosts),
      cost: calculateOperationCost(op, partQuantity(p, args.asmQty), machineCosts),
    })),
  }));

  const bopBreakdown = args.bops
    .filter(b => b.qtyPerAssembly > 0 && b.unitCost >= 0)
    .map(b => ({
      name: b.name || "—",
      qtyPerAssembly: b.qtyPerAssembly,
      unitCost: b.unitCost,
      totalCost: b.unitCost * b.qtyPerAssembly * Math.max(0, args.asmQty),
    }));

  return {
    company: {
      name: COMPANY_INFO.name,
      addressLines: COMPANY_INFO.addressLines,
      phone: COMPANY_INFO.phone,
      email: COMPANY_INFO.email,
      gstn: COMPANY_INFO.gstn,
      state: COMPANY_INFO.state,
      stateCode: COMPANY_INFO.stateCode,
      tagline: COMPANY_INFO.tagline,
    },
    customer: { name: customerName, addressLines: customerLines },
    meta: { srNo: refLabel, date: fmtQuotationDate(new Date()), refNo: args.rfq.rfqRef, validFor: "15 DAYS" },
    items,
    grandTotal,
    currencyLabel: "INR",
    notes: args.rfq.notes,
    terms: QUOTATION_TERMS,
    contact: { name: COMPANY_INFO.contactPerson, phone: COMPANY_INFO.contactPhone, email: COMPANY_INFO.contactEmail },
    fileName: `${refLabel || "quotation"}.pdf`,
    partMaterials,
    partOperationGroups,
    bopBreakdown,
  };
}
