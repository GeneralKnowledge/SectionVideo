import { openDatabase } from "../src/lib/db/connection";
import { ensureCurator } from "../src/lib/services/ready";
import { syncCurriculum } from "../src/lib/services/curriculum-sync";

const filename = process.env.DATABASE_URL ?? "./data/curator.db";
const handle = openDatabase(filename);
const synced = syncCurriculum(handle);
await ensureCurator(handle);
console.log(`Ready ${filename}: ${synced.lessonCount} lessons at ${synced.version}`);
handle.sqlite.close();
