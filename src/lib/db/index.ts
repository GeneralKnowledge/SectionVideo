import "server-only";
import { openDatabase, type DatabaseHandle } from "./connection";

const globalForDb = globalThis as unknown as { curatorDb?: DatabaseHandle };

export function getDb(): DatabaseHandle {
  if (!globalForDb.curatorDb) {
    globalForDb.curatorDb = openDatabase(process.env.DATABASE_URL ?? "./data/curator.db");
  }
  return globalForDb.curatorDb;
}

export type { DatabaseHandle } from "./connection";
