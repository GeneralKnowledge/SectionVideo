import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/auth/password";
import type { DatabaseHandle } from "@/lib/db/connection";
import { curators } from "@/lib/db/schema";
import { syncCurriculum } from "./curriculum-sync";

let ready: Promise<void> | null = null;

export async function ensureCurator(handle: DatabaseHandle): Promise<void> {
  const existing = handle.db.select().from(curators).all();
  if (existing.length > 0) return;
  const email = process.env.CURATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.CURATOR_PASSWORD ?? "";
  const name = process.env.CURATOR_NAME?.trim() || "Curator";
  if (!email || password.length < 8) return;
  if (process.env.NODE_ENV === "production" && password.includes("replace-with")) return;
  handle.db
    .insert(curators)
    .values({
      id: nanoid(),
      email,
      passwordHash: await hashPassword(password),
      displayName: name,
      createdAt: Date.now(),
    })
    .run();
}

export async function ensureReady(handle: DatabaseHandle): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const lessons = handle.sqlite.prepare("SELECT COUNT(*) AS n FROM lesson_references").get() as {
        n: number;
      };
      if (lessons.n === 0) syncCurriculum(handle);
      await ensureCurator(handle);
    })();
  }
  await ready;
}

export function findCuratorByEmail(handle: DatabaseHandle, email: string) {
  return handle.db.select().from(curators).where(eq(curators.email, email.trim().toLowerCase())).get();
}
