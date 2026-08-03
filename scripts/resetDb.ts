/**
 * Wipes every document from every collection in the connected database, leaving the collections
 * and their indexes intact. There's only one MONGODB_URI (no dev/test/prod separation enforced in
 * code), so this requires an explicit --yes flag after printing which database it's about to
 * empty, to avoid an accidental run against the wrong cluster.
 *
 * Run with: pnpm db:reset -- --yes
 */
import { connectToDatabase } from "@/lib/db/connect";

async function main() {
  const conn = await connectToDatabase();
  const db = conn.connection.db;
  if (!db) {
    throw new Error("No active database connection.");
  }

  const host = conn.connection.host;
  const dbName = db.databaseName;
  console.log(`Target database: "${dbName}" on ${host}`);

  const confirmed = process.argv.includes("--yes");
  if (!confirmed) {
    console.log("\nThis will delete ALL documents from ALL collections in the database above.");
    console.log("Re-run with --yes to proceed, e.g.:  pnpm db:reset -- --yes");
    process.exit(0);
  }

  const collections = await db.listCollections().toArray();

  for (const { name } of collections) {
    const result = await db.collection(name).deleteMany({});
    console.log(`  cleared "${name}" (${result.deletedCount} document(s) deleted)`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
