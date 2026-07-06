import { createSqliteStore } from "../src/lib/storage/sqlite";

const dbPath = process.env.LOCAL_SQLITE_PATH ?? ".data/sweepscout.sqlite";
const store = await createSqliteStore(dbPath);
const data = await store.getDashboardData();

console.log(`Seeded ${data.sweepstakes.length} sweepstakes in ${dbPath}`);
