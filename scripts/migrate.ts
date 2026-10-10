import { openDatabase } from "../src/lib/db/connection";

const filename = process.env.DATABASE_URL ?? "./data/curator.db";
const handle = openDatabase(filename);
console.log(`Migrated ${filename}`);
handle.sqlite.close();
