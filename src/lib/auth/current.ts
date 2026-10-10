import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { curators, type Curator } from "@/lib/db/schema";
import { ensureReady } from "@/lib/services/ready";
import { SESSION_COOKIE, readSessionToken } from "./session";

export async function getCurrentCurator(): Promise<Curator | null> {
  const handle = getDb();
  await ensureReady(handle);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await readSessionToken(token);
  if (!userId) return null;
  return handle.db.select().from(curators).where(eq(curators.id, userId)).get() ?? null;
}

export async function requireCurator(): Promise<Curator> {
  const curator = await getCurrentCurator();
  if (!curator) throw new Error("Not authenticated");
  return curator;
}
