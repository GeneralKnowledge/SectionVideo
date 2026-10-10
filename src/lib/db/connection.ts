import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "./migrate";
import * as schema from "./schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type DatabaseHandle = {
  sqlite: Database.Database;
  db: AppDb;
};

export function openDatabase(filename: string): DatabaseHandle {
  let target = filename;
  if (target !== ":memory:") {
    target = path.isAbsolute(target) ? target : path.join(process.cwd(), target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  const sqlite = new Database(target);
  sqlite.pragma("foreign_keys = ON");
  if (target !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
