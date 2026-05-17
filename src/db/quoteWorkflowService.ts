import {
  clearDfmIssuesForPart,
  createDfmIssue,
  createOperation,
  createPart,
  createQuote,
  createRfq,
  deleteOperation,
  deleteOperationsForPart,
  deletePart,
  deletePartGeometry,
  deletePartStock,
  getAllMachines,
  getAllMaterials,
  getDfmIssuesByPart,
  getEventsByQuote,
  getOperationsByPart,
  getPartGeometry,
  getPartById,
  getPartsByQuote,
  getPartStock,
  getQuoteById,
  getRfqById,
  logQuoteEvent,
  updateOperation,
  updatePart,
  updateQuote,
  updateRfq,
  upsertPartGeometry,
  upsertPartStock,
} from "./queries";
import type {
  DfmIssue,
  DfmSeverity,
  PartGeometry,
  Quote,
  QuoteCostSnapshot,
  QuoteEvent,
  Rfq,
  UnitSystem,
} from "./schema";
import type { Op, Part, Stock } from "../utils/quoteTypes";
import {
  buildMachineCatalog,
  buildMaterialCatalog,
  calculateQuoteRollup,
  toQuoteCostSnapshot,
} from "../utils/quoteCosting";

export type QuoteWorkflowRfqDraft = {
  customer?: string;
  customerId?: string | null;
  project: string;
  rfqRef?: string;
  notes?: string;
};

export type QuoteWorkflowCommercialDraft = {
  marginPct: number;
  taxPct: number;
  discountPct?: number;
};

export type QuoteWorkflowPartGeometryDraft = {
  fileName?: string;
  unitSystem?: UnitSystem;
  bboxXMm?: number;
  bboxYMm?: number;
  bboxZMm?: number;
  volumeMm3?: number;
  surfaceAreaMm2?: number;
  faceCount?: number;
  edgeCount?: number;
  vertexCount?: number;
};

export type QuoteWorkflowDfmIssueDraft = {
  id?: string;
  partId: string;
  severity: DfmSeverity;
  title: string;
  description?: string | null;
  impactCost?: number;
  suggestion?: string | null;
  isActionable?: boolean;
  isDismissed?: boolean;
};

export type QuoteWorkflowPartDraft = Part & {
  geometry?: QuoteWorkflowPartGeometryDraft | null;
  dfmIssues?: QuoteWorkflowDfmIssueDraft[];
};

export type QuoteWorkflowDraft = {
  quoteId?: string | null;
  rfqId?: string | null;
  rfq: QuoteWorkflowRfqDraft;
  parts: QuoteWorkflowPartDraft[];
  asmQty: number;
  commercial: QuoteWorkflowCommercialDraft;
  currency?: string;
  toolingCost?: number;
  inspectionCost?: number;
  quantityBreaks?: number[];
  costSnapshot?: QuoteCostSnapshot | null;
  dfmIssues?: QuoteWorkflowDfmIssueDraft[];
  fileName?: string;
};

export type LoadedQuoteWorkflow = QuoteWorkflowDraft & {
  quoteId: string;
  rfqId: string | null;
  records: {
    rfq: Rfq | null;
    quote: Quote;
    events: QuoteEvent[];
  };
};

export type SaveQuoteWorkflowResult = {
  rfq: Rfq;
  quote: Quote;
  draft: LoadedQuoteWorkflow;
};

type PartNotesMeta = {
  materialRateOverride?: number | null;
  meshIds?: string[];
};

type OperationNotesMeta = {
  rateOverride?: number | null;
};

type RfqNotesMeta = {
  customer?: string;
  notes?: string;
};

const META_KEY = "quoteWorkflow";

function cleanTitle(project: string | undefined): string {
  const title = project?.trim();
  return title ? title : "Untitled quote";
}

function finiteNumber(value: number | undefined, fallback = 0): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function definedJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function cleanDims(dims: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    Object.entries(dims ?? {})
      .filter(([, value]) => Number.isFinite(value))
      .map(([key, value]) => [key, value]),
  );
}

function encodeMeta<T extends Record<string, unknown>>(meta: T): string {
  return JSON.stringify({ [META_KEY]: definedJson(meta) });
}

function decodeMeta<T>(notes: string | null | undefined): T | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    const meta = parsed[META_KEY];
    return meta && typeof meta === "object" ? (meta as T) : null;
  } catch {
    return null;
  }
}

function partNotes(part: QuoteWorkflowPartDraft): string | null {
  const meta: PartNotesMeta = {};
  if (part.materialRateOverride !== undefined) {
    meta.materialRateOverride = part.materialRateOverride;
  }
  if (part.meshIds !== undefined) meta.meshIds = part.meshIds;
  return Object.keys(meta).length > 0 ? encodeMeta(meta) : null;
}

function operationNotes(op: Op): string | null {
  if (op.rateOverride === undefined) return null;
  return encodeMeta<OperationNotesMeta>({ rateOverride: op.rateOverride });
}

function rfqNotes(rfq: QuoteWorkflowRfqDraft): string | null {
  const meta: RfqNotesMeta = {};
  if (rfq.customer) meta.customer = rfq.customer;
  if (rfq.notes) meta.notes = rfq.notes;
  return Object.keys(meta).length > 0 ? encodeMeta(meta) : null;
}

function geometryForPart(
  part: QuoteWorkflowPartDraft,
  fallbackFileName: string,
): QuoteWorkflowPartGeometryDraft | null {
  if (part.geometry) return part.geometry;
  if (part.netVolumeMm3 === undefined) return null;
  return {
    fileName: fallbackFileName,
    volumeMm3: part.netVolumeMm3,
  };
}

function toPartDraft(part: import("./schema").Part): QuoteWorkflowPartDraft {
  const meta = decodeMeta<PartNotesMeta>(part.notes);
  return {
    id: part.id,
    name: part.name,
    color: part.colorHex,
    material: part.materialId ?? "",
    perAssembly: part.perAssembly,
    mass: part.massKg,
    finishing: part.finishingCost,
    included: part.isIncluded,
    stocked: part.isStocked,
    materialRateOverride: meta?.materialRateOverride,
    meshIds: meta?.meshIds,
    stock: null,
    operations: [],
  };
}

function stockToDraft(stock: import("./schema").PartStock | null): Stock | null {
  if (!stock) return null;
  return {
    shape: stock.shape,
    dims: stock.dims,
  };
}

function geometryToDraft(geometry: PartGeometry | null): QuoteWorkflowPartGeometryDraft | null {
  if (!geometry) return null;
  return {
    fileName: geometry.fileName,
    unitSystem: geometry.unitSystem,
    bboxXMm: geometry.bboxXMm,
    bboxYMm: geometry.bboxYMm,
    bboxZMm: geometry.bboxZMm,
    volumeMm3: geometry.volumeMm3,
    surfaceAreaMm2: geometry.surfaceAreaMm2,
    faceCount: geometry.faceCount,
    edgeCount: geometry.edgeCount,
    vertexCount: geometry.vertexCount,
  };
}

function operationToDraft(operation: import("./schema").PartOperation): Op {
  const meta = decodeMeta<OperationNotesMeta>(operation.notes);
  return {
    id: operation.id,
    machine: operation.machineId ?? "",
    setupMin: operation.setupMin,
    cycleMin: operation.cycleMin,
    rateOverride: meta?.rateOverride,
  };
}

function dfmToDraft(issue: DfmIssue): QuoteWorkflowDfmIssueDraft {
  return {
    id: issue.id,
    partId: issue.partId,
    severity: issue.severity,
    title: issue.title,
    description: issue.description,
    impactCost: issue.impactCost,
    suggestion: issue.suggestion,
    isActionable: issue.isActionable,
    isDismissed: issue.isDismissed,
  };
}

async function savePartChildren(
  part: QuoteWorkflowPartDraft,
  quoteId: string,
  sortOrder: number,
  fallbackFileName: string,
): Promise<void> {
  const existingParts = await getPartsByQuote(quoteId);
  const existing = existingParts.find((row) => row.id === part.id);
  const partData = {
    id: part.id,
    quoteId,
    name: part.name,
    materialId: part.material || null,
    colorHex: part.color,
    perAssembly: Math.max(1, Math.trunc(finiteNumber(part.perAssembly, 1))),
    massKg: finiteNumber(part.mass),
    finishingCost: finiteNumber(part.finishing),
    isIncluded: part.included,
    isStocked: part.stocked ?? false,
    notes: partNotes(part),
    sortOrder,
  };

  if (existing) {
    await updatePart(part.id, partData);
  } else {
    await createPart(partData);
  }

  if (part.stock) {
    await upsertPartStock({
      partId: part.id,
      shape: part.stock.shape as import("./schema").StockShape,
      dims: cleanDims(part.stock.dims),
    });
  } else {
    await deletePartStock(part.id);
  }

  const geometry = geometryForPart(part, fallbackFileName);
  if (geometry) {
    await upsertPartGeometry({
      partId: part.id,
      fileName: geometry.fileName ?? fallbackFileName,
      unitSystem: geometry.unitSystem ?? "metric",
      bboxXMm: finiteNumber(geometry.bboxXMm),
      bboxYMm: finiteNumber(geometry.bboxYMm),
      bboxZMm: finiteNumber(geometry.bboxZMm),
      volumeMm3: finiteNumber(geometry.volumeMm3 ?? part.netVolumeMm3),
      surfaceAreaMm2: finiteNumber(geometry.surfaceAreaMm2),
      faceCount: Math.trunc(finiteNumber(geometry.faceCount)),
      edgeCount: Math.trunc(finiteNumber(geometry.edgeCount)),
      vertexCount: Math.trunc(finiteNumber(geometry.vertexCount)),
    });
  } else {
    await deletePartGeometry(part.id);
  }

  const existingOperations = await getOperationsByPart(part.id);
  const incomingOperationIds = new Set(part.operations.map((op) => op.id));
  for (const operation of existingOperations) {
    if (!incomingOperationIds.has(operation.id)) await deleteOperation(operation.id);
  }
  for (let i = 0; i < part.operations.length; i++) {
    const operation = part.operations[i]!;
    const operationData = {
      id: operation.id,
      partId: part.id,
      machineId: operation.machine || null,
      setupMin: finiteNumber(operation.setupMin),
      cycleMin: finiteNumber(operation.cycleMin),
      notes: operationNotes(operation),
      sortOrder: i,
    };
    if (existingOperations.some((row) => row.id === operation.id)) {
      await updateOperation(operation.id, operationData);
    } else {
      await createOperation(operationData);
    }
  }
}

async function replaceDfmIssues(
  partId: string,
  issues: QuoteWorkflowDfmIssueDraft[] | undefined,
): Promise<void> {
  if (issues === undefined) return;
  await clearDfmIssuesForPart(partId);
  for (const issue of issues) {
    await createDfmIssue({
      id: issue.id,
      partId,
      severity: issue.severity,
      title: issue.title,
      description: issue.description ?? null,
      impactCost: finiteNumber(issue.impactCost),
      suggestion: issue.suggestion ?? null,
      isActionable: issue.isActionable ?? false,
      isDismissed: issue.isDismissed ?? false,
    });
  }
}

async function normalizePartIdsForQuote(
  quoteId: string,
  parts: QuoteWorkflowPartDraft[],
): Promise<{ parts: QuoteWorkflowPartDraft[]; idMap: Map<string, string> }> {
  const quoteParts = await getPartsByQuote(quoteId);
  const quotePartIds = new Set(quoteParts.map((part) => part.id));
  const idMap = new Map<string, string>();
  const normalized: QuoteWorkflowPartDraft[] = [];

  for (const part of parts) {
    let id = part.id;
    if (!quotePartIds.has(id)) {
      const existing = await getPartById(id);
      if (existing && existing.quoteId !== quoteId) {
        id = `part-${crypto.randomUUID()}`;
      }
    }
    idMap.set(part.id, id);
    normalized.push({
      ...part,
      id,
      dfmIssues: part.dfmIssues?.map((issue) => ({ ...issue, partId: id })),
    });
  }

  return { parts: normalized, idMap };
}

export async function saveQuoteWorkflow(
  draft: QuoteWorkflowDraft,
): Promise<SaveQuoteWorkflowResult> {
  const title = cleanTitle(draft.rfq.project);
  const [materials, machines] = await Promise.all([getAllMaterials(false), getAllMachines(false)]);
  const costSnapshot = draft.costSnapshot ?? toQuoteCostSnapshot(calculateQuoteRollup(
    draft.parts,
    Math.max(1, Math.trunc(finiteNumber(draft.asmQty, 1))),
    { marginPct: finiteNumber(draft.commercial.marginPct), taxPct: finiteNumber(draft.commercial.taxPct) },
    buildMaterialCatalog(materials),
    buildMachineCatalog(machines),
    {
      toolingCost: finiteNumber(draft.toolingCost),
      inspectionCost: finiteNumber(draft.inspectionCost),
      currency: draft.currency ?? "INR",
    },
  ));
  const rfq = draft.rfqId
    ? await updateRfq(draft.rfqId, {
        customerId: draft.rfq.customerId ?? null,
        title,
        referenceNumber: draft.rfq.rfqRef || null,
        notes: rfqNotes(draft.rfq),
      })
    : await createRfq({
        customerId: draft.rfq.customerId ?? null,
        title,
        referenceNumber: draft.rfq.rfqRef || null,
        description: null,
        status: "reviewing",
        receivedAt: new Date(),
        dueDate: null,
        notes: rfqNotes(draft.rfq),
      });

  if (!rfq) throw new Error(`RFQ not found: ${draft.rfqId}`);

  const quote = draft.quoteId
    ? await updateQuote(draft.quoteId, {
        rfqId: rfq.id,
        customerId: draft.rfq.customerId ?? null,
        title,
        assemblyQuantity: Math.max(1, Math.trunc(finiteNumber(draft.asmQty, 1))),
        quantityBreaks: draft.quantityBreaks ?? [1, 10, 25, 100, 250],
        currency: draft.currency ?? "INR",
        toolingCost: finiteNumber(draft.toolingCost),
        inspectionCost: finiteNumber(draft.inspectionCost),
        marginPercent: finiteNumber(draft.commercial.marginPct),
        taxPercent: finiteNumber(draft.commercial.taxPct),
        discountPercent: finiteNumber(draft.commercial.discountPct),
        costSnapshot,
      })
    : await createQuote({
        rfqId: rfq.id,
        customerId: draft.rfq.customerId ?? null,
        parentQuoteId: null,
        revision: "A",
        title,
        quoteNumber: null,
        status: "draft",
        assemblyQuantity: Math.max(1, Math.trunc(finiteNumber(draft.asmQty, 1))),
        quantityBreaks: draft.quantityBreaks ?? [1, 10, 25, 100, 250],
        currency: draft.currency ?? "INR",
        toolingCost: finiteNumber(draft.toolingCost),
        inspectionCost: finiteNumber(draft.inspectionCost),
        marginPercent: finiteNumber(draft.commercial.marginPct),
        taxPercent: finiteNumber(draft.commercial.taxPct),
        discountPercent: finiteNumber(draft.commercial.discountPct),
        costSnapshot,
        notes: null,
        validUntil: null,
      });

  if (!quote) throw new Error(`Quote not found: ${draft.quoteId}`);

  const normalized = await normalizePartIdsForQuote(quote.id, draft.parts);
  const existingParts = await getPartsByQuote(quote.id);
  const incomingPartIds = new Set(normalized.parts.map((part) => part.id));
  for (const part of existingParts) {
    if (!incomingPartIds.has(part.id)) await deletePart(part.id);
  }

  const fallbackFileName = draft.fileName ?? `${title}.step`;
  for (let i = 0; i < normalized.parts.length; i++) {
    const part = normalized.parts[i]!;
    try {
      await savePartChildren(part, quote.id, i, fallbackFileName);
    } catch (error) {
      throw new Error(
        `Failed to save part "${part.name}" (${part.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const dfmByPartId = new Map<string, QuoteWorkflowDfmIssueDraft[]>();
  for (const issue of draft.dfmIssues ?? []) {
    const partId = normalized.idMap.get(issue.partId) ?? issue.partId;
    const issues = dfmByPartId.get(partId) ?? [];
    issues.push({ ...issue, partId });
    dfmByPartId.set(partId, issues);
  }
  for (const part of normalized.parts) {
    await replaceDfmIssues(part.id, part.dfmIssues ?? dfmByPartId.get(part.id));
  }

  await logQuoteEvent({
    quoteId: quote.id,
    eventType: draft.quoteId ? "updated" : "created",
    payload: { rfqId: rfq.id, partCount: draft.parts.length },
  });

  return {
    rfq,
    quote,
    draft: await loadQuoteWorkflow(quote.id),
  };
}

export async function loadQuoteWorkflow(quoteId: string): Promise<LoadedQuoteWorkflow> {
  const quote = await getQuoteById(quoteId);
  if (!quote) throw new Error(`Quote not found: ${quoteId}`);
  const rfq = quote.rfqId ? await getRfqById(quote.rfqId) : null;
  const rfqMeta = decodeMeta<RfqNotesMeta>(rfq?.notes);
  const partRows = await getPartsByQuote(quote.id);
  const parts: QuoteWorkflowPartDraft[] = [];
  const dfmIssues: QuoteWorkflowDfmIssueDraft[] = [];

  for (const partRow of partRows) {
    const part = toPartDraft(partRow);
    const [stock, geometry, operations, issues] = await Promise.all([
      getPartStock(part.id),
      getPartGeometry(part.id),
      getOperationsByPart(part.id),
      getDfmIssuesByPart(part.id),
    ]);
    part.stock = stockToDraft(stock);
    part.geometry = geometryToDraft(geometry);
    part.netVolumeMm3 = geometry?.volumeMm3 ?? part.netVolumeMm3;
    part.operations = operations.map(operationToDraft);
    part.dfmIssues = issues.map(dfmToDraft);
    dfmIssues.push(...part.dfmIssues);
    parts.push(part);
  }

  return {
    quoteId: quote.id,
    rfqId: quote.rfqId,
    rfq: {
      customer: rfqMeta?.customer ?? "",
      customerId: quote.customerId,
      project: rfq?.title ?? quote.title,
      rfqRef: rfq?.referenceNumber ?? "",
      notes: rfqMeta?.notes ?? "",
    },
    parts,
    asmQty: quote.assemblyQuantity,
    commercial: {
      marginPct: quote.marginPercent,
      taxPct: quote.taxPercent,
      discountPct: quote.discountPercent,
    },
    currency: quote.currency,
    toolingCost: quote.toolingCost,
    inspectionCost: quote.inspectionCost,
    quantityBreaks: quote.quantityBreaks,
    costSnapshot: quote.costSnapshot,
    dfmIssues,
    records: {
      rfq,
      quote,
      events: await getEventsByQuote(quote.id),
    },
  };
}

export async function deleteQuoteWorkflowChildren(quoteId: string): Promise<void> {
  const parts = await getPartsByQuote(quoteId);
  for (const part of parts) {
    await deleteOperationsForPart(part.id);
    await clearDfmIssuesForPart(part.id);
    await deletePartStock(part.id);
    await deletePartGeometry(part.id);
    await deletePart(part.id);
  }
}
