import { getDb } from "./client";
import { customers, machines, materials } from "./schema";

export async function seed(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const uid = () => crypto.randomUUID();

  // ── Materials ────────────────────────────────────────────────────────────
  await db.insert(materials).values([
    { id: "mat-al6061",    name: "Aluminum 6061-T6",   densityKgPerM3: 2700, costPerKg: 5.5, currency: "USD", markupPercent: 15, machinability: 4, colorHex: "#bfc7d1", category: "Metal",     availableForms: ["plate","bar","extrusion"], isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-steel1018", name: "Steel 1018",         densityKgPerM3: 7870, costPerKg: 2.1, currency: "USD", markupPercent: 12, machinability: 3, colorHex: "#8d959c", category: "Metal",     availableForms: ["plate","bar"],             isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-ss304",     name: "Stainless Steel 304",densityKgPerM3: 8000, costPerKg: 6.8, currency: "USD", markupPercent: 18, machinability: 2, colorHex: "#a8b0b8", category: "Metal",     availableForms: ["plate","bar","tube"],      isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-brass",     name: "Brass CW614N",       densityKgPerM3: 8500, costPerKg: 8.4, currency: "USD", markupPercent: 20, machinability: 5, colorHex: "#c69f5a", category: "Metal",     availableForms: ["bar","tube"],              isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-stock",     name: "Stock / Purchased",  densityKgPerM3: 1000, costPerKg: 0,   currency: "USD", markupPercent: 0,  machinability: 0, colorHex: "#dcd9d2", category: "Purchased", availableForms: [],                          isActive: true, isSystem: true, createdAt: now, updatedAt: now },
  ]).run();

  // ── Machines ─────────────────────────────────────────────────────────────
  await db.insert(machines).values([
    { id: "mach-mill3ax", name: "Mill · 3-axis",    shortName: "Mill 3-ax", ratePerHour: 68,  category: "mill",    isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-mill5ax", name: "Mill · 5-axis",    shortName: "Mill 5-ax", ratePerHour: 110, category: "mill",    isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-lathe",   name: "Lathe",             shortName: "Lathe",     ratePerHour: 58,  category: "lathe",   isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-drill",   name: "Drill press",       shortName: "Drill",     ratePerHour: 38,  category: "mill",    isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-tap",     name: "Tap / thread",      shortName: "Tap",       ratePerHour: 38,  category: "mill",    isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-wireedm", name: "Wire EDM",          shortName: "Wire EDM",  ratePerHour: 95,  category: "edm",     isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-grind",   name: "Surface grind",     shortName: "Grind",     ratePerHour: 72,  category: "grind",   isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-deburr",  name: "Deburr / hand",     shortName: "Deburr",    ratePerHour: 28,  category: "hand",    isSystem: true, isActive: true, createdAt: now, updatedAt: now },
    { id: "mach-cmm",     name: "CMM inspect",       shortName: "CMM",       ratePerHour: 64,  category: "inspect", isSystem: true, isActive: true, createdAt: now, updatedAt: now },
  ]).run();

  // ── Customers ─────────────────────────────────────────────────────────────
  await db.insert(customers).values([
    { id: uid(), name: "Acme Manufacturing",     email: "contact@acme.example",       phone: "+1-555-0100", company: "Acme Corp",     address: "123 Industrial Blvd, Detroit, MI", createdAt: now, updatedAt: now },
    { id: uid(), name: "BuildRight Contractors", email: "info@buildright.example",    phone: "+1-555-0200", company: "BuildRight LLC", address: "456 Commerce St, Chicago, IL",     createdAt: now, updatedAt: now },
  ]).run();
}
