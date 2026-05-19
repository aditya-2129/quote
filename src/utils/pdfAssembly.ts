import type { CatalogContextValue } from "@context/CatalogContext";
import type { Customer } from "../db/schema";
import { getAllSettings } from "../db/queries";
import { calculateConfiguredQuoteRollup, effectivePartRate, operationCost as calculateOperationCost, operationRate as calculateOperationRate, partMaterialCost as calculatePartMaterialCost, partQuantity } from "./quoteCosting";
import { fmtStockDims } from "./stock";
import type { Bop, ExtraCost, Part } from "./quoteTypes";
import type { QuotationData, QuotationLineItem } from "./export";
import { isTauriRuntime } from "./tauriRuntime";

export type QuotationSettings = {
  company: QuotationData["company"];
  contact: QuotationData["contact"];
  currencyLabel: string;
  terms: string[];
  logoBytes: Uint8Array | null;
  logoMime: "image/jpeg" | "image/png";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map(line => line.trim())
    .filter(Boolean);
}

function splitTerms(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function inferLogoMime(path: string): "image/jpeg" | "image/png" {
  return path.trim().toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function loadLogoBytes(path: string): Promise<Uint8Array | null> {
  const cleaned = path.trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("data:")) return dataUrlToBytes(cleaned);

  if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith("/")) {
    try {
      const response = await fetch(cleaned);
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  if (isTauriRuntime()) {
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      return await readFile(cleaned);
    } catch {
      return null;
    }
  }

  return null;
}

export async function loadQuotationSettings(): Promise<QuotationSettings> {
  const settings = await getAllSettings();
  const companyName = asString(settings.company_name);
  const companyAddress = asString(settings.company_address);
  const companyPhone = asString(settings.company_phone);
  const companyEmail = asString(settings.company_email);
  const companyGstn = asString(settings.company_gstn);
  const companyState = asString(settings.company_state);
  const companyStateCode = asString(settings.company_state_code);
  const companyTagline = asString(settings.company_tagline);
  const contactPerson = asString(settings.company_contact_person);
  const contactPhone = asString(settings.company_contact_phone);
  const contactEmail = asString(settings.company_contact_email);
  const currencyLabel = asString(settings.currency);
  const quoteTerms = asString(settings.quote_terms);

  const missing = [
    [companyName, "company name"],
    [companyAddress, "company address"],
    [companyPhone, "company phone"],
    [companyEmail, "company email"],
    [companyGstn, "GSTN"],
    [companyState, "state"],
    [companyStateCode, "state code"],
    [companyTagline, "tagline"],
    [contactPerson, "contact person"],
    [contactPhone, "contact phone"],
    [contactEmail, "contact email"],
    [currencyLabel, "currency"],
    [quoteTerms, "PDF terms"],
  ]
    .filter(([value]) => !value)
    .map(([, label]) => label);

  if (missing.length > 0) {
    throw new Error(`Complete Settings before exporting: ${missing.join(", ")}.`);
  }

  const logoPath = asString(settings.company_logo_path);
  return {
    company: {
      name: companyName,
      addressLines: splitLines(companyAddress),
      phone: companyPhone,
      email: companyEmail,
      gstn: companyGstn,
      state: companyState,
      stateCode: companyStateCode,
      tagline: companyTagline,
    },
    contact: {
      name: contactPerson,
      phone: contactPhone,
      email: contactEmail,
    },
    currencyLabel,
    terms: splitTerms(quoteTerms),
    logoBytes: await loadLogoBytes(logoPath),
    logoMime: inferLogoMime(logoPath),
  };
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
  quotationSettings: QuotationSettings;
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
      name: args.quotationSettings.company.name,
      addressLines: args.quotationSettings.company.addressLines,
      phone: args.quotationSettings.company.phone,
      email: args.quotationSettings.company.email,
      gstn: args.quotationSettings.company.gstn,
      state: args.quotationSettings.company.state,
      stateCode: args.quotationSettings.company.stateCode,
      tagline: args.quotationSettings.company.tagline,
    },
    customer: { name: customerName, addressLines: customerLines },
    meta: { srNo: refLabel, date: fmtQuotationDate(new Date()), refNo: args.rfq.rfqRef, validFor: "15 DAYS" },
    items,
    grandTotal,
    currencyLabel: args.quotationSettings.currencyLabel,
    notes: args.rfq.notes,
    terms: args.quotationSettings.terms,
    contact: args.quotationSettings.contact,
    fileName: `${refLabel || "quotation"}.pdf`,
    partMaterials,
    partOperationGroups,
    bopBreakdown,
  };
}
