import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { customers, type Customer, type NewCustomer } from "../schema";

export async function getAllCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return db.select().from(customers).orderBy(customers.name).all();
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const db = await getDb();
  return (await db.select().from(customers).where(eq(customers.id, id)).get()) ?? null;
}

export async function createCustomer(
  data: Omit<NewCustomer, "id" | "createdAt" | "updatedAt">,
): Promise<Customer> {
  const db = await getDb();
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(customers).values({ ...data, id, createdAt: now, updatedAt: now }).run();
  return (await getCustomerById(id))!;
}

export async function updateCustomer(
  id: string,
  data: Partial<Omit<NewCustomer, "id" | "createdAt" | "updatedAt">>,
): Promise<Customer | null> {
  const db = await getDb();
  await db.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, id)).run();
  return getCustomerById(id);
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(customers).where(eq(customers.id, id)).run();
}
