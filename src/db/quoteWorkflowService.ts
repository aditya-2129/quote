import {
  createOperation,
  createPart,
  createQuote,
  createQuoteBop,
  createRfq,
  deleteQuote,
  deleteQuoteBop,
  deleteRfq,
  deleteOperation,
  deleteOperationsForPart,
  deletePart,
  deletePartGeometry,
  deletePartStock,
  getAllMachines,
  getAllMaterials,
  getAllQuotes,
  getOperationsByPart,
  getPartGeometry,
  getPartById,
  getPartsByQuote,
  getPartStock,
  getQuoteById,
  getQuoteBopsByQuote,
  getQuoteCadSource,
  getRootQuotes,
  getRfqById,
  updateOperation,
  updatePart,
  updateQuote,
  updateQuoteBop,
  updateRfq,
  upsertPartGeometry,
  upsertPartStock,
  upsertQuoteCadSource,
} from "./queries";
import type {
  PartGeometry,
  ProjectNameSource,
  Quote,
  QuoteCostSnapshot,
  Rfq,
  UnitSystem,
} from "./schema";
import type { Bop, Op, Part, Stock } from "../utils/quoteTypes";
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

export type QuoteWorkflowPartDraft = Part & {
  geometry?: QuoteWorkflowPartGeometryDraft | null;
};

export type QuoteWorkflowCadSource = {
  bytes: Uint8Array;
  fileName: string;
};

export type QuoteWorkflowDraft = {
  quoteId?: string | null;
  rfqId?: string | null;
  rfq: QuoteWorkflowRfqDraft;
  parts: QuoteWorkflowPartDraft[];
  bops?: Bop[];
  asmQty: number;
  commercial: QuoteWorkflowCommercialDraft;
  currency?: string;
  toolingCost?: number;
  inspectionCost?: number;
  quantityBreaks?: number[];
  costSnapshot?: QuoteCostSnapshot | null;
  fileName?: string;
  /** 'auto' = title was generated (file name / 'Untitled quote N'); 'user' = typed by hand. Drives whether a CAD attach is allowed to overwrite the title. */
  projectNameSource?: ProjectNameSource | null;
  /** Source STEP bytes — persisted per quote so the 3D preview survives reloads. */
  cadSource?: QuoteWorkflowCadSource | null;
};

export type LoadedQuoteWorkflow = QuoteWorkflowDraft & {
  quoteId: string;
  rfqId: string | null;
  bops: Bop[];
  records: {
    rfq: Rfq | null;
    quote: Quote;
  };
  cadSource: QuoteWorkflowCadSource | null;
};

export type SaveQuoteWorkflowResult = {
  rfq: Rfq;
  quote: Quote;
  draft: LoadedQuoteWorkflow;
};

export type DuplicateDraftCleanupResult = {
  groupsScanned: number;
  duplicateGroups: number;
  deletedCount: number;
  keptQuoteIds: string[];
  deletedQuoteIds: string[];
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

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to keep String.fromCharCode under the call-stack limit for multi-MB files.
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

async function savePartChildren(
  part: QuoteWorkflowPartDraft,
  quoteId: string,
  sortOrder: number,
  fallbackFileName: string,
  validMachineIds: Set<string>,
  validMaterialIds: Set<string>,
): Promise<void> {
  const existingParts = await getPartsByQuote(quoteId);
  const existing = existingParts.find((row) => row.id === part.id);
  const partData = {
    id: part.id,
    quoteId,
    name: part.name,
    materialId: part.material && validMaterialIds.has(part.material) ? part.material : null,
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
      machineId: operation.machine && validMachineIds.has(operation.machine) ? operation.machine : null,
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
    });
  }

  return { parts: normalized, idMap };
}

export async function saveQuoteWorkflow(
  draft: QuoteWorkflowDraft,
): Promise<SaveQuoteWorkflowResult> {
  const title = cleanTitle(draft.rfq.project);
  const [materials, machines] = await Promise.all([getAllMaterials(false), getAllMachines(false)]);
  const matCat = buildMaterialCatalog(materials);
  const macCat = buildMachineCatalog(machines);
  const asm = Math.max(1, Math.trunc(finiteNumber(draft.asmQty, 1)));
  const terms = { marginPct: finiteNumber(draft.commercial.marginPct), taxPct: finiteNumber(draft.commercial.taxPct) };
  // Only apply per-batch tooling/inspection when included parts have non-zero
  // configured cost (material + ops). Blank drafts and just-added empty parts
  // should report ₹0 instead of the ₹570 default overhead baseline.
  const probe = calculateQuoteRollup(draft.parts, asm, terms, matCat, macCat, {
    toolingCost: 0, inspectionCost: 0, currency: draft.currency ?? "INR",
  });
  const costSnapshot = draft.costSnapshot ?? toQuoteCostSnapshot(
    probe.partsCost > 0
      ? calculateQuoteRollup(draft.parts, asm, terms, matCat, macCat, {
          toolingCost: finiteNumber(draft.toolingCost),
          inspectionCost: finiteNumber(draft.inspectionCost),
          currency: draft.currency ?? "INR",
        })
      : probe,
  );
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

  // Only persist projectNameSource when it's explicitly set on the draft —
  // omitting the column from an update preserves the existing value so a save
  // triggered by edits unrelated to the Project field doesn't clobber it.
  const projectNameSourcePatch = draft.projectNameSource !== undefined
    ? { projectNameSource: draft.projectNameSource }
    : {};

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
        ...projectNameSourcePatch,
      })
    : await createQuote({
        rfqId: rfq.id,
        customerId: draft.rfq.customerId ?? null,
        parentQuoteId: null,
        revision: "A",
        title,
        // Fresh inserts default to 'auto' unless the caller specified otherwise.
        projectNameSource: draft.projectNameSource ?? "auto",
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
  const validMachineIds = new Set(machines.map((m) => m.id));
  const validMaterialIds = new Set(materials.map((m) => m.id));
  for (let i = 0; i < normalized.parts.length; i++) {
    const part = normalized.parts[i]!;
    try {
      await savePartChildren(part, quote.id, i, fallbackFileName, validMachineIds, validMaterialIds);
    } catch (error) {
      throw new Error(
        `Failed to save part "${part.name}" (${part.id}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  if (draft.bops !== undefined) {
    const existingBops = await getQuoteBopsByQuote(quote.id);
    const existingIds = new Set(existingBops.map((row) => row.id));
    const incomingIds = new Set(draft.bops.map((row) => row.id));
    for (const row of existingBops) {
      if (!incomingIds.has(row.id)) await deleteQuoteBop(row.id);
    }
    for (let i = 0; i < draft.bops.length; i++) {
      const bop = draft.bops[i]!;
      const payload = {
        id: bop.id,
        quoteId: quote.id,
        catalogId: bop.catalogId ?? null,
        name: bop.name,
        supplier: bop.supplier || null,
        qtyPerAssembly: Math.max(1, Math.trunc(finiteNumber(bop.qtyPerAssembly, 1))),
        unitCost: finiteNumber(bop.unitCost),
        notes: bop.notes ? bop.notes : null,
        sortOrder: i,
      };
      if (existingIds.has(bop.id)) {
        await updateQuoteBop(bop.id, payload);
      } else {
        await createQuoteBop(payload);
      }
    }
  }

  if (draft.cadSource && draft.cadSource.bytes.length > 0) {
    await upsertQuoteCadSource({
      quoteId: quote.id,
      fileName: draft.cadSource.fileName,
      fileBytesBase64: bytesToBase64(draft.cadSource.bytes),
    });
  }

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

  for (const partRow of partRows) {
    const part = toPartDraft(partRow);
    const [stock, geometry, operations] = await Promise.all([
      getPartStock(part.id),
      getPartGeometry(part.id),
      getOperationsByPart(part.id),
    ]);
    part.stock = stockToDraft(stock);
    part.geometry = geometryToDraft(geometry);
    part.netVolumeMm3 = geometry?.volumeMm3 ?? part.netVolumeMm3;
    part.operations = operations.map(operationToDraft);
    parts.push(part);
  }

  const bopRows = await getQuoteBopsByQuote(quote.id);
  const bops: Bop[] = bopRows.map((row) => ({
    id: row.id,
    catalogId: row.catalogId ?? null,
    name: row.name,
    supplier: row.supplier ?? "",
    qtyPerAssembly: row.qtyPerAssembly,
    unitCost: row.unitCost,
    notes: row.notes ?? undefined,
  }));

  const cadSourceRow = await getQuoteCadSource(quote.id);
  const cadSource: QuoteWorkflowCadSource | null = cadSourceRow
    ? { bytes: base64ToBytes(cadSourceRow.fileBytesBase64), fileName: cadSourceRow.fileName }
    : null;

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
    bops,
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
    projectNameSource: quote.projectNameSource ?? null,
    cadSource,
    records: {
      rfq,
      quote,
    },
  };
}

export async function deleteQuoteWorkflowChildren(quoteId: string): Promise<void> {
  const parts = await getPartsByQuote(quoteId);
  for (const part of parts) {
    await deleteOperationsForPart(part.id);
    await deletePartStock(part.id);
    await deletePartGeometry(part.id);
    await deletePart(part.id);
  }
}

export async function deleteQuoteWorkflow(quoteId: string): Promise<void> {
  const quote = await getQuoteById(quoteId);
  await deleteQuoteWorkflowChildren(quoteId);
  await deleteQuote(quoteId);
  if (quote?.rfqId) {
    const siblingQuotes = (await getRootQuotes()).filter(row => row.rfqId === quote.rfqId);
    if (siblingQuotes.length === 0) await deleteRfq(quote.rfqId);
  }
}

function duplicateDraftSignature(draft: LoadedQuoteWorkflow): string {
  const cost = draft.costSnapshot;
  return JSON.stringify({
    title: draft.records.quote.title,
    status: draft.records.quote.status,
    quoteNumber: draft.records.quote.quoteNumber,
    revision: draft.records.quote.revision,
    asmQty: draft.asmQty,
    commercial: draft.commercial,
    currency: draft.currency,
    toolingCost: draft.toolingCost,
    inspectionCost: draft.inspectionCost,
    costSnapshot: cost ? {
      partsCost: cost.partsCost,
      tooling: cost.tooling,
      inspection: cost.inspection,
      subtotal: cost.subtotal,
      margin: cost.margin,
      tax: cost.tax,
      total: cost.total,
      unitPrice: cost.unitPrice,
      currency: cost.currency,
    } : null,
    parts: draft.parts.map(part => ({
      name: part.name,
      material: part.material,
      perAssembly: part.perAssembly,
      mass: part.mass,
      netVolumeMm3: part.netVolumeMm3,
      finishing: part.finishing,
      included: part.included,
      stocked: part.stocked,
      stock: part.stock,
      operations: part.operations.map(op => ({
        machine: op.machine,
        setupMin: op.setupMin,
        cycleMin: op.cycleMin,
        rateOverride: op.rateOverride,
      })),
    })),
  });
}

export async function cleanupDuplicateDraftQuotes(): Promise<DuplicateDraftCleanupResult> {
  const rootQuotes = await getRootQuotes();
  const candidates = rootQuotes.filter(quote =>
    quote.status === "draft"
    && quote.parentQuoteId === null
    && quote.quoteNumber === null
    && quote.title === "Untitled quote",
  );

  const groups = new Map<string, LoadedQuoteWorkflow[]>();
  for (const quote of candidates) {
    const draft = await loadQuoteWorkflow(quote.id);
    const key = duplicateDraftSignature(draft);
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }

  const deletedQuoteIds: string[] = [];
  const keptQuoteIds: string[] = [];
  let duplicateGroups = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateGroups++;
    const sorted = [...group].sort(
      (a, b) => b.records.quote.updatedAt.getTime() - a.records.quote.updatedAt.getTime(),
    );
    const keep = sorted[0]!;
    keptQuoteIds.push(keep.quoteId);
    for (const duplicate of sorted.slice(1)) {
      await deleteQuoteWorkflow(duplicate.quoteId);
      deletedQuoteIds.push(duplicate.quoteId);
    }
  }

  return {
    groupsScanned: groups.size,
    duplicateGroups,
    deletedCount: deletedQuoteIds.length,
    keptQuoteIds,
    deletedQuoteIds,
  };
}

/**
 * Returns the next 'Untitled quote N' name by scanning every quote title for
 * the `^Untitled quote (\d+)$` pattern and taking max+1. Starts at 1. Legacy
 * rows whose title is the bare 'Untitled quote' (no number) don't participate
 * in the count (they were back-filled to source='auto' and will be renamed in
 * place if the user attaches a CAD file).
 */
export async function nextUntitledQuoteName(): Promise<string> {
  const quotes = await getAllQuotes();
  const numberedPattern = /^Untitled quote (\d+)$/;
  let maxN = 0;
  for (const q of quotes) {
    const m = numberedPattern.exec(q.title ?? "");
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  return `Untitled quote ${maxN + 1}`;
}

/**
 * Creates a real persisted blank draft row so the New Quote button can navigate
 * straight to /quotes/<real-id>. Without this, the URL holds a fake `q-<rand>`
 * id and the QuoteStateProvider gets remounted on the first autosave (losing
 * anything the user typed between save and remount).
 *
 * Assigns the auto-generated 'Untitled quote N' name up front so the page
 * header, sidebar, and quote-list all show a stable label from the start.
 */
export async function createBlankQuoteWorkflow(options: {
  asmQty?: number;
  commercial?: QuoteWorkflowCommercialDraft;
} = {}): Promise<string> {
  const project = await nextUntitledQuoteName();
  const result = await saveQuoteWorkflow({
    quoteId: null,
    rfqId: null,
    rfq: { project },
    parts: [],
    asmQty: options.asmQty ?? 25,
    commercial: options.commercial ?? { marginPct: 18, taxPct: 0 },
    toolingCost: 244,
    inspectionCost: 326,
    projectNameSource: "auto",
  });
  return result.quote.id;
}

function pad3(n: number): string { return n.toString().padStart(3, "0"); }

/**
 * Allocates the next sequential quote number for the current 2-digit year.
 * Format: Q-{YY}-{NNN}. Looks at every existing quote (across revisions) to
 * find the highest in-year sequence and increments it.
 */
async function allocateQuoteNumber(): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  const prefix = `Q-${yy}-`;
  const all = await getAllQuotes();
  let max = 0;
  for (const q of all) {
    if (!q.quoteNumber || !q.quoteNumber.startsWith(prefix)) continue;
    const n = parseInt(q.quoteNumber.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${pad3(max + 1)}`;
}

export type SendQuoteResult = { quote: Quote; quoteNumber: string };

/**
 * Transitions a draft into "sent": assigns a quote number if missing and flips
 * status.
 */
export async function sendQuoteWorkflow(quoteId: string): Promise<SendQuoteResult> {
  const quote = await getQuoteById(quoteId);
  if (!quote) throw new Error(`Quote not found: ${quoteId}`);

  let quoteNumber = quote.quoteNumber;
  if (!quoteNumber) quoteNumber = await allocateQuoteNumber();

  const updated = await updateQuote(quoteId, {
    quoteNumber,
    status: "sent",
  });
  if (!updated) throw new Error(`Quote not found after send: ${quoteId}`);

  return { quote: updated, quoteNumber };
}
