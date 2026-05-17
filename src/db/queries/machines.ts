import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { browserDb, isBrowserDbFallback } from "../browserFallback";
import { machines, type Machine, type MachineCategory, type NewMachine } from "../schema";

export async function getAllMachines(activeOnly = true): Promise<Machine[]> {
  if (isBrowserDbFallback()) return browserDb.getAllMachines(activeOnly);
  const db = await getDb();
  const q = db.select().from(machines).orderBy(machines.name);
  return activeOnly ? q.where(eq(machines.isActive, true)).all() : q.all();
}

export async function getMachineById(id: string): Promise<Machine | null> {
  if (isBrowserDbFallback()) return browserDb.getMachineById(id);
  const db = await getDb();
  return (await db.select().from(machines).where(eq(machines.id, id)).get()) ?? null;
}

export async function getMachinesByCategory(category: MachineCategory): Promise<Machine[]> {
  if (isBrowserDbFallback()) return browserDb.getAllMachines(false).filter(machine => machine.category === category);
  const db = await getDb();
  return db.select().from(machines).where(eq(machines.category, category)).orderBy(machines.name).all();
}

export async function createMachine(
  data: Omit<NewMachine, "id" | "createdAt" | "updatedAt">,
): Promise<Machine> {
  if (isBrowserDbFallback()) return browserDb.createMachine(data);
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(machines).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getMachineById(id))!;
}

export async function updateMachine(
  id: string,
  data: Partial<Omit<NewMachine, "id" | "createdAt" | "updatedAt">>,
): Promise<Machine | null> {
  if (isBrowserDbFallback()) return browserDb.updateMachine(id, data);
  const db = await getDb();
  await db.update(machines).set({ ...data, updatedAt: new Date() }).where(eq(machines.id, id)).run();
  return getMachineById(id);
}

export async function deleteMachine(id: string): Promise<void> {
  if (isBrowserDbFallback()) return browserDb.deleteMachine(id);
  const db = await getDb();
  await db.delete(machines).where(eq(machines.id, id)).run();
}
