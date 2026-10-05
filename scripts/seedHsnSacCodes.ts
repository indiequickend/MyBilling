/**
 * Upserts the government HSN/SAC code -> official description master list (a one-time import,
 * re-run whenever lib/db/seeds/hsn-sac-codes.json is refreshed from a newer source list) into the
 * shared, non-tenant-scoped HsnSacCode collection — see that model's doc comment for why this
 * data has no businessId. Upserts by `code` so re-running is always safe (idempotent); it never
 * deletes a code that's since dropped from the source file.
 *
 * Run with: pnpm seed:hsn-sac-codes
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connectToDatabase } from "@/lib/db/connect";
import { HsnSacCode, type HsnSacCodeKind } from "@/lib/db/models/HsnSacCode";

type SeedRow = { code: string; type: HsnSacCodeKind; description: string };

const BATCH_SIZE = 1000;

async function main() {
  await connectToDatabase();

  const seedPath = path.join(process.cwd(), "lib/db/seeds/hsn-sac-codes.json");
  const rows: SeedRow[] = JSON.parse(await readFile(seedPath, "utf8"));
  console.log(`Loaded ${rows.length} HSN/SAC codes from ${seedPath}`);

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await HsnSacCode.bulkWrite(
      batch.map((row) => ({
        updateOne: {
          filter: { code: row.code },
          update: { $set: { code: row.code, kind: row.type, description: row.description } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    upserted += result.upsertedCount + result.modifiedCount;
    console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} processed`);
  }

  console.log(`Done. ${upserted} document(s) inserted/updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
