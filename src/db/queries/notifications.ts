import { desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { notifications, type NewNotification, type Notification } from "../schema";

export async function getNotifications(limit = 50): Promise<Notification[]> {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();
}

export async function getUnreadNotifications(): Promise<Notification[]> {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.isRead, false))
    .orderBy(desc(notifications.createdAt))
    .all();
}

export async function getUnreadCount(): Promise<number> {
  const rows = await getUnreadNotifications();
  return rows.length;
}

export async function createNotification(
  data: Omit<NewNotification, "id" | "createdAt">,
): Promise<Notification> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.insert(notifications).values({ ...data, id, createdAt: new Date() }).run();
  return (await db.select().from(notifications).where(eq(notifications.id, id)).get())!;
}

export async function markRead(id: string): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).run();
}

export async function markAllRead(): Promise<void> {
  const db = await getDb();
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false)).run();
}

export async function deleteNotification(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(notifications).where(eq(notifications.id, id)).run();
}
