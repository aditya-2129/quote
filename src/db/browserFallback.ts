import type {
  Customer,
  Machine,
  Material,
  NewCustomer,
  NewMachine,
  NewMaterial,
  NewPart,
  NewPartGeometry,
  NewPartOperation,
  NewPartStock,
  NewQuote,
  NewQuoteCadSource,
  NewRfq,
  Part,
  PartGeometry,
  PartOperation,
  PartStock,
  Quote,
  QuoteCadSource,
  QuoteStatus,
  Rfq,
  RfqStatus,
} from "./schema";

type BrowserDb = {
  customers: Customer[];
  machines: Machine[];
  materials: Material[];
  partGeometry: PartGeometry[];
  partOperations: PartOperation[];
  parts: Part[];
  partStock: PartStock[];
  quoteCadSources: QuoteCadSource[];
  quotes: Quote[];
  rfqs: Rfq[];
};

const STORAGE_KEY = "quote:dev-browser-db:v1";

type MaybeTauriWindow = typeof globalThis & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function isBrowserDbFallback(): boolean {
  const g = globalThis as MaybeTauriWindow;
  return Boolean(import.meta.env.DEV && typeof window !== "undefined" && !g.__TAURI__ && !g.__TAURI_INTERNALS__);
}

const now = () => new Date();

const seedDate = new Date("2026-05-16T00:00:00.000Z");

const initialDb: BrowserDb = {
  materials: [
    { id: "mat-ms", name: "Mild Steel (MS)", densityKgPerM3: 7850, costPerKg: 75, currency: "INR", markupPercent: 15, category: "Metal", availableForms: ["rect", "round", "hex"], formRates: { rect: 75, round: 80, hex: 85 }, notes: null, isActive: true, isSystem: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mat-al6061", name: "Aluminum 6061-T6", densityKgPerM3: 2700, costPerKg: 280, currency: "INR", markupPercent: 15, category: "Metal", availableForms: ["rect", "round"], formRates: { rect: 280, round: 290 }, notes: null, isActive: true, isSystem: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mat-ss304", name: "Stainless Steel 304", densityKgPerM3: 8000, costPerKg: 320, currency: "INR", markupPercent: 18, category: "Metal", availableForms: ["rect", "round", "hex"], formRates: { rect: 320, round: 330, hex: 350 }, notes: null, isActive: true, isSystem: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mat-brass", name: "Brass CW614N", densityKgPerM3: 8500, costPerKg: 650, currency: "INR", markupPercent: 20, category: "Metal", availableForms: ["round", "hex"], formRates: { round: 650, hex: 680 }, notes: null, isActive: true, isSystem: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mat-stock", name: "Stock / Purchased", densityKgPerM3: 1000, costPerKg: 0, currency: "INR", markupPercent: 0, category: "Purchased", availableForms: ["rect"], formRates: { rect: 0 }, notes: null, isActive: true, isSystem: true, createdAt: seedDate, updatedAt: seedDate },
  ],
  machines: [
    { id: "mach-mill3ax", name: "Mill 3-axis", shortName: "Mill 3-ax", ratePerHour: 68, category: "mill", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-mill5ax", name: "Mill 5-axis", shortName: "Mill 5-ax", ratePerHour: 110, category: "mill", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-lathe", name: "Lathe", shortName: "Lathe", ratePerHour: 58, category: "lathe", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-drill", name: "Drill press", shortName: "Drill", ratePerHour: 38, category: "mill", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-tap", name: "Tap / thread", shortName: "Tap", ratePerHour: 38, category: "mill", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-wireedm", name: "Wire EDM", shortName: "Wire EDM", ratePerHour: 95, category: "edm", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-grind", name: "Surface grind", shortName: "Grind", ratePerHour: 72, category: "grind", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-deburr", name: "Deburr / hand", shortName: "Deburr", ratePerHour: 28, category: "hand", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
    { id: "mach-cmm", name: "CMM inspect", shortName: "CMM", ratePerHour: 64, category: "inspect", notes: null, isSystem: true, isActive: true, createdAt: seedDate, updatedAt: seedDate },
  ],
  customers: [
    { id: "cust-acme", name: "Rahul Sharma", email: "rahul@acme.example", phone: "9876543210", company: "Acme Industries", address: "123 Industrial Estate, Pune", notes: "Dev browser seed customer.", createdAt: seedDate, updatedAt: seedDate },
    { id: "cust-buildright", name: "Priya Mehta", email: "priya@buildright.example", phone: "9876501234", company: "BuildRight Components", address: "42 Machine Tool Road, Bengaluru", notes: null, createdAt: seedDate, updatedAt: seedDate },
  ],
  parts: [
    { id: "part-demo-body", quoteId: "quote-demo", name: "Manifold body", materialId: "mat-al6061", colorHex: "#6b7280", perAssembly: 1, massKg: 1.42, finishingCost: 120, isIncluded: true, isStocked: false, notes: "Seed part for browser persistence testing.", sortOrder: 0, createdAt: seedDate, updatedAt: seedDate },
    { id: "part-demo-plug", quoteId: "quote-demo", name: "Seal plug", materialId: "mat-ss304", colorHex: "#9ca3af", perAssembly: 4, massKg: 0.08, finishingCost: 0, isIncluded: true, isStocked: true, notes: null, sortOrder: 1, createdAt: seedDate, updatedAt: seedDate },
  ],
  partStock: [
    { id: "stock-demo-plug", partId: "part-demo-plug", shape: "round-bar", dims: { D: 16, L: 24 }, createdAt: seedDate },
  ],
  partGeometry: [
    { id: "geom-demo-body", partId: "part-demo-body", fileName: "pump-manifold-v3.step", unitSystem: "metric", bboxXMm: 120, bboxYMm: 80, bboxZMm: 42, volumeMm3: 526000, surfaceAreaMm2: 38400, faceCount: 142, edgeCount: 318, vertexCount: 176, createdAt: seedDate },
  ],
  partOperations: [
    { id: "op-demo-body-setup", partId: "part-demo-body", machineId: "mach-mill3ax", setupMin: 45, cycleMin: 18, notes: "Rough and finish milling", sortOrder: 0, createdAt: seedDate },
    { id: "op-demo-body-inspect", partId: "part-demo-body", machineId: "mach-cmm", setupMin: 15, cycleMin: 4, notes: null, sortOrder: 1, createdAt: seedDate },
  ],
  rfqs: [
    { id: "rfq-demo", customerId: "cust-acme", title: "Pump Manifold v3", referenceNumber: "RFQ-2026-014", description: "Browser fallback RFQ for UI testing.", status: "reviewing", receivedAt: seedDate, dueDate: new Date("2026-05-28T00:00:00.000Z"), notes: null, createdAt: seedDate, updatedAt: seedDate },
  ],
  quotes: [
    {
      id: "quote-demo",
      rfqId: "rfq-demo",
      customerId: "cust-acme",
      parentQuoteId: null,
      revision: "C",
      title: "Pump Manifold v3",
      projectNameSource: "user",
      quoteNumber: "Q-026-014",
      status: "draft",
      assemblyQuantity: 25,
      quantityBreaks: [1, 10, 25, 100, 250],
      currency: "INR",
      toolingCost: 244,
      inspectionCost: 326,
      marginPercent: 18,
      taxPercent: 0,
      discountPercent: 0,
      costSnapshot: { partsCost: 43484.52, tooling: 244, inspection: 326, subtotal: 44054.52, margin: 7929.81, tax: 0, total: 51984.33, unitPrice: 2079.37, currency: "INR", computedAt: seedDate.toISOString() },
      notes: "Dev browser seed quote.",
      validUntil: new Date("2026-06-16T00:00:00.000Z"),
      createdAt: seedDate,
      updatedAt: seedDate,
    },
  ],
  quoteCadSources: [],
};

function reviveDates<T>(value: T): T {
  const dateKeys = new Set(["createdAt", "updatedAt", "receivedAt", "dueDate", "validUntil"]);
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input).map(([key, val]) => [
        key,
        dateKeys.has(key) && val ? new Date(String(val)) : walk(val),
      ]),
    );
  };
  return walk(value) as T;
}

function readDb(): BrowserDb {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || raw === "undefined") {
    writeDb(initialDb);
    return structuredClone(initialDb);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BrowserDb>;
    return { ...structuredClone(initialDb), ...reviveDates(parsed) };
  } catch {
    // Corrupt cache (e.g. literal "undefined" written by a prior buggy save) — reseed.
    writeDb(initialDb);
    return structuredClone(initialDb);
  }
}

function writeDb(db: BrowserDb): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const byCreatedDesc = <T extends { createdAt: Date }>(a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function deletePartRows(db: BrowserDb, partId: string): void {
  db.partStock = db.partStock.filter(row => row.partId !== partId);
  db.partGeometry = db.partGeometry.filter(row => row.partId !== partId);
  db.partOperations = db.partOperations.filter(row => row.partId !== partId);
}

function deleteQuoteRows(db: BrowserDb, quoteId: string): void {
  for (const part of db.parts.filter(row => row.quoteId === quoteId)) {
    deletePartRows(db, part.id);
  }
  db.parts = db.parts.filter(row => row.quoteId !== quoteId);
  db.quoteCadSources = db.quoteCadSources.filter(row => row.quoteId !== quoteId);
}

function deletePartsForQuoteRows(db: BrowserDb, quoteId: string): void {
  for (const part of db.parts.filter(row => row.quoteId === quoteId)) {
    deletePartRows(db, part.id);
  }
  db.parts = db.parts.filter(row => row.quoteId !== quoteId);
}

export const browserDb = {
  getAllMachines(activeOnly = true): Machine[] {
    const rows = readDb().machines;
    return rows.filter(row => !activeOnly || row.isActive).sort(byName);
  },
  getMachineById(id: string): Machine | null {
    return readDb().machines.find(row => row.id === id) ?? null;
  },
  createMachine(data: Omit<NewMachine, "id" | "createdAt" | "updatedAt">): Machine {
    const db = readDb();
    const row: Machine = {
      id: newId("mach"),
      name: data.name,
      shortName: data.shortName,
      ratePerHour: data.ratePerHour ?? 0,
      category: data.category ?? "mill",
      notes: data.notes ?? null,
      isSystem: data.isSystem ?? false,
      isActive: data.isActive ?? true,
      createdAt: now(),
      updatedAt: now(),
    };
    db.machines.push(row);
    writeDb(db);
    return row;
  },
  updateMachine(id: string, data: Partial<Omit<NewMachine, "id" | "createdAt" | "updatedAt">>): Machine | null {
    const db = readDb();
    const index = db.machines.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.machines[index] = { ...db.machines[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.machines[index]!;
  },
  deleteMachine(id: string): void {
    const db = readDb();
    db.machines = db.machines.filter(row => row.id !== id);
    writeDb(db);
  },

  getAllMaterials(activeOnly = true): Material[] {
    const rows = readDb().materials;
    return rows.filter(row => !activeOnly || row.isActive).sort(byName);
  },
  getMaterialById(id: string): Material | null {
    return readDb().materials.find(row => row.id === id) ?? null;
  },
  createMaterial(data: Omit<NewMaterial, "id" | "createdAt" | "updatedAt">): Material {
    const db = readDb();
    const row: Material = {
      id: newId("mat"),
      name: data.name,
      densityKgPerM3: data.densityKgPerM3 ?? 0,
      costPerKg: data.costPerKg ?? 0,
      currency: data.currency ?? "INR",
      markupPercent: data.markupPercent ?? 0,
      category: data.category ?? null,
      availableForms: data.availableForms ?? [],
      formRates: data.formRates ?? {},
      notes: data.notes ?? null,
      isSystem: data.isSystem ?? false,
      isActive: data.isActive ?? true,
      createdAt: now(),
      updatedAt: now(),
    };
    db.materials.push(row);
    writeDb(db);
    return row;
  },
  updateMaterial(id: string, data: Partial<Omit<NewMaterial, "id" | "createdAt" | "updatedAt">>): Material | null {
    const db = readDb();
    const index = db.materials.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.materials[index] = { ...db.materials[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.materials[index]!;
  },
  deleteMaterial(id: string): void {
    const db = readDb();
    db.materials = db.materials.filter(row => row.id !== id);
    writeDb(db);
  },

  getAllCustomers(): Customer[] {
    return readDb().customers.sort(byName);
  },
  getCustomerById(id: string): Customer | null {
    return readDb().customers.find(row => row.id === id) ?? null;
  },
  createCustomer(data: Omit<NewCustomer, "id" | "createdAt" | "updatedAt">): Customer {
    const db = readDb();
    const row: Customer = { email: null, phone: null, company: null, address: null, notes: null, ...data, id: newId("cust"), createdAt: now(), updatedAt: now() };
    db.customers.push(row);
    writeDb(db);
    return row;
  },
  updateCustomer(id: string, data: Partial<Omit<NewCustomer, "id" | "createdAt" | "updatedAt">>): Customer | null {
    const db = readDb();
    const index = db.customers.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.customers[index] = { ...db.customers[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.customers[index]!;
  },
  deleteCustomer(id: string): void {
    const db = readDb();
    db.customers = db.customers.filter(row => row.id !== id);
    writeDb(db);
  },

  getAllRfqs(): Rfq[] {
    return readDb().rfqs.sort(byCreatedDesc);
  },
  getRfqById(id: string): Rfq | null {
    return readDb().rfqs.find(row => row.id === id) ?? null;
  },
  getRfqsByCustomer(customerId: string): Rfq[] {
    return readDb().rfqs.filter(row => row.customerId === customerId).sort(byCreatedDesc);
  },
  getRfqsByStatus(status: RfqStatus): Rfq[] {
    return readDb().rfqs.filter(row => row.status === status).sort(byCreatedDesc);
  },
  createRfq(data: Omit<NewRfq, "id" | "createdAt" | "updatedAt">): Rfq {
    const db = readDb();
    const row: Rfq = {
      id: newId("rfq"),
      customerId: data.customerId ?? null,
      title: data.title,
      referenceNumber: data.referenceNumber ?? null,
      description: data.description ?? null,
      status: data.status ?? "new",
      receivedAt: data.receivedAt ?? now(),
      dueDate: data.dueDate ?? null,
      notes: data.notes ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.rfqs.push(row);
    writeDb(db);
    return row;
  },
  updateRfq(id: string, data: Partial<Omit<NewRfq, "id" | "createdAt" | "updatedAt">>): Rfq | null {
    const db = readDb();
    const index = db.rfqs.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.rfqs[index] = { ...db.rfqs[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.rfqs[index]!;
  },
  deleteRfq(id: string): void {
    const db = readDb();
    db.rfqs = db.rfqs.filter(row => row.id !== id);
    writeDb(db);
  },

  getPartsByQuote(quoteId: string): Part[] {
    return readDb().parts.filter(row => row.quoteId === quoteId).sort(bySortOrder);
  },
  getPartById(id: string): Part | null {
    return readDb().parts.find(row => row.id === id) ?? null;
  },
  createPart(data: Omit<NewPart, "createdAt" | "updatedAt"> & { id?: string }): Part {
    const db = readDb();
    const row: Part = {
      materialId: null,
      colorHex: "#888888",
      perAssembly: 1,
      massKg: 0,
      finishingCost: 0,
      isIncluded: true,
      isStocked: false,
      notes: null,
      sortOrder: 0,
      ...data,
      id: data.id ?? newId("part"),
      createdAt: now(),
      updatedAt: now(),
    };
    db.parts.push(row);
    writeDb(db);
    return row;
  },
  updatePart(id: string, data: Partial<Omit<NewPart, "id" | "createdAt" | "updatedAt">>): Part | null {
    const db = readDb();
    const index = db.parts.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.parts[index] = { ...db.parts[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.parts[index]!;
  },
  deletePart(id: string): void {
    const db = readDb();
    db.parts = db.parts.filter(row => row.id !== id);
    deletePartRows(db, id);
    writeDb(db);
  },
  deletePartsForQuote(quoteId: string): void {
    const db = readDb();
    deletePartsForQuoteRows(db, quoteId);
    writeDb(db);
  },
  reorderParts(orderedIds: string[]): void {
    const db = readDb();
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    db.parts = db.parts.map(row => order.has(row.id) ? { ...row, sortOrder: order.get(row.id)! } : row);
    writeDb(db);
  },

  getPartStock(partId: string): PartStock | null {
    return readDb().partStock.find(row => row.partId === partId) ?? null;
  },
  upsertPartStock(data: Omit<NewPartStock, "id" | "createdAt">): PartStock {
    const db = readDb();
    const index = db.partStock.findIndex(row => row.partId === data.partId);
    if (index >= 0) {
      db.partStock[index] = { ...db.partStock[index]!, ...data };
      writeDb(db);
      return db.partStock[index]!;
    }
    const row: PartStock = { shape: "plate", dims: {}, ...data, id: newId("stock"), createdAt: now() };
    db.partStock.push(row);
    writeDb(db);
    return row;
  },
  deletePartStock(partId: string): void {
    const db = readDb();
    db.partStock = db.partStock.filter(row => row.partId !== partId);
    writeDb(db);
  },

  getPartGeometry(partId: string): PartGeometry | null {
    return readDb().partGeometry.find(row => row.partId === partId) ?? null;
  },
  upsertPartGeometry(data: Omit<NewPartGeometry, "id" | "createdAt">): PartGeometry {
    const db = readDb();
    const index = db.partGeometry.findIndex(row => row.partId === data.partId);
    if (index >= 0) {
      db.partGeometry[index] = { ...db.partGeometry[index]!, ...data };
      writeDb(db);
      return db.partGeometry[index]!;
    }
    const row: PartGeometry = {
      unitSystem: "metric",
      bboxXMm: 0,
      bboxYMm: 0,
      bboxZMm: 0,
      volumeMm3: 0,
      surfaceAreaMm2: 0,
      faceCount: 0,
      edgeCount: 0,
      vertexCount: 0,
      ...data,
      id: newId("geom"),
      createdAt: now(),
    };
    db.partGeometry.push(row);
    writeDb(db);
    return row;
  },
  deletePartGeometry(partId: string): void {
    const db = readDb();
    db.partGeometry = db.partGeometry.filter(row => row.partId !== partId);
    writeDb(db);
  },

  getQuoteCadSource(quoteId: string): QuoteCadSource | null {
    return readDb().quoteCadSources.find(row => row.quoteId === quoteId) ?? null;
  },
  upsertQuoteCadSource(data: Omit<NewQuoteCadSource, "id" | "importedAt">): QuoteCadSource {
    const db = readDb();
    const index = db.quoteCadSources.findIndex(row => row.quoteId === data.quoteId);
    if (index >= 0) {
      db.quoteCadSources[index] = { ...db.quoteCadSources[index]!, ...data };
      writeDb(db);
      return db.quoteCadSources[index]!;
    }
    const row: QuoteCadSource = {
      ...data,
      id: newId("cadsrc"),
      importedAt: now(),
    };
    db.quoteCadSources.push(row);
    writeDb(db);
    return row;
  },
  deleteQuoteCadSource(quoteId: string): void {
    const db = readDb();
    db.quoteCadSources = db.quoteCadSources.filter(row => row.quoteId !== quoteId);
    writeDb(db);
  },

  getOperationsByPart(partId: string): PartOperation[] {
    return readDb().partOperations.filter(row => row.partId === partId).sort(bySortOrder);
  },
  getOperationById(id: string): PartOperation | null {
    return readDb().partOperations.find(row => row.id === id) ?? null;
  },
  createOperation(data: Omit<NewPartOperation, "createdAt"> & { id?: string }): PartOperation {
    const db = readDb();
    const row: PartOperation = {
      machineId: null,
      setupMin: 0,
      cycleMin: 0,
      notes: null,
      sortOrder: 0,
      ...data,
      id: data.id ?? newId("op"),
      createdAt: now(),
    };
    db.partOperations.push(row);
    writeDb(db);
    return row;
  },
  updateOperation(id: string, data: Partial<Omit<NewPartOperation, "id" | "partId" | "createdAt">>): PartOperation | null {
    const db = readDb();
    const index = db.partOperations.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.partOperations[index] = { ...db.partOperations[index]!, ...data };
    writeDb(db);
    return db.partOperations[index]!;
  },
  deleteOperation(id: string): void {
    const db = readDb();
    db.partOperations = db.partOperations.filter(row => row.id !== id);
    writeDb(db);
  },
  deleteOperationsForPart(partId: string): void {
    const db = readDb();
    db.partOperations = db.partOperations.filter(row => row.partId !== partId);
    writeDb(db);
  },
  reorderOperations(orderedIds: string[]): void {
    const db = readDb();
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    db.partOperations = db.partOperations.map(row => order.has(row.id) ? { ...row, sortOrder: order.get(row.id)! } : row);
    writeDb(db);
  },

  getAllQuotes(): Quote[] {
    return readDb().quotes.sort(byCreatedDesc);
  },
  getQuoteById(id: string): Quote | null {
    return readDb().quotes.find(row => row.id === id) ?? null;
  },
  getRootQuotes(): Quote[] {
    return readDb().quotes.filter(row => row.parentQuoteId === null).sort(byCreatedDesc);
  },
  getQuotesByCustomer(customerId: string): Quote[] {
    return readDb().quotes.filter(row => row.customerId === customerId).sort(byCreatedDesc);
  },
  getQuotesByStatus(status: QuoteStatus): Quote[] {
    return readDb().quotes.filter(row => row.status === status).sort(byCreatedDesc);
  },
  getQuotesByRfq(rfqId: string): Quote[] {
    return readDb().quotes.filter(row => row.rfqId === rfqId).sort(byCreatedDesc);
  },
  getRevisionChain(quoteId: string): Quote[] {
    const rows = readDb().quotes;
    const quote = rows.find(row => row.id === quoteId);
    if (!quote) return [];
    const rootId = quote.parentQuoteId ?? quote.id;
    return rows
      .filter(row => row.id === rootId || row.parentQuoteId === rootId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },
  createQuote(data: Omit<NewQuote, "id" | "createdAt" | "updatedAt">): Quote {
    const db = readDb();
    const row: Quote = {
      rfqId: null,
      customerId: null,
      parentQuoteId: null,
      revision: "A",
      quoteNumber: null,
      projectNameSource: null,
      status: "draft",
      assemblyQuantity: 1,
      quantityBreaks: [1, 10, 25, 100, 250],
      currency: "INR",
      toolingCost: 0,
      inspectionCost: 0,
      marginPercent: 0,
      taxPercent: 0,
      discountPercent: 0,
      costSnapshot: null,
      notes: null,
      validUntil: null,
      ...data,
      id: newId("quote"),
      createdAt: now(),
      updatedAt: now(),
    };
    db.quotes.push(row);
    writeDb(db);
    return row;
  },
  updateQuote(id: string, data: Partial<Omit<NewQuote, "id" | "createdAt" | "updatedAt">>): Quote | null {
    const db = readDb();
    const index = db.quotes.findIndex(row => row.id === id);
    if (index < 0) return null;
    db.quotes[index] = { ...db.quotes[index]!, ...data, updatedAt: now() };
    writeDb(db);
    return db.quotes[index]!;
  },
  deleteQuote(id: string): void {
    const db = readDb();
    db.quotes = db.quotes.filter(row => row.id !== id);
    deleteQuoteRows(db, id);
    writeDb(db);
  },
};
