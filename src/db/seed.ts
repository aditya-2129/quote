import { getDb } from "./client";
import { customers, machines, materials } from "./schema";

export async function seed(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const uid = () => crypto.randomUUID();

  // ── Materials ────────────────────────────────────────────────────────────
  await db.insert(materials).values([
    { id: "mat-ms",        name: "Mild Steel (MS)",    densityKgPerM3: 7850, costPerKg: 75,  currency: "INR", markupPercent: 15, category: "Metal",     availableForms: ["rect","round","hex"],     formRates: { rect: 75, round: 80, hex: 85 },   isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-al6061",    name: "Aluminum 6061-T6",   densityKgPerM3: 2700, costPerKg: 280, currency: "INR", markupPercent: 15, category: "Metal",     availableForms: ["rect","round"],           formRates: { rect: 280, round: 290 },         isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-ss304",     name: "Stainless Steel 304",densityKgPerM3: 8000, costPerKg: 320, currency: "INR", markupPercent: 18, category: "Metal",     availableForms: ["rect","round","hex"],     formRates: { rect: 320, round: 330, hex: 350 }, isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-brass",     name: "Brass CW614N",       densityKgPerM3: 8500, costPerKg: 650, currency: "INR", markupPercent: 20, category: "Metal",     availableForms: ["round","hex"],            formRates: { round: 650, hex: 680 },           isActive: true, isSystem: true, createdAt: now, updatedAt: now },
    { id: "mat-stock",     name: "Stock / Purchased",  densityKgPerM3: 1000, costPerKg: 0,   currency: "INR", markupPercent: 0,  category: "Purchased", availableForms: ["rect"],                   formRates: { rect: 0 },                        isActive: true, isSystem: true, createdAt: now, updatedAt: now },
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
