import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectToDatabase } from "@/lib/db/connect";
import { HsnSacCode, type HsnSacCodeKind } from "@/lib/db/models/HsnSacCode";
import { lookupHsnSacDescriptions } from "@/lib/db/queries/hsnSacCodes";

// A global, non-tenant-scoped reference collection (see HsnSacCode.ts's doc comment) — no
// businessId/two-tenant setup needed, just a handful of fixture codes cleaned up afterward.
describe("lookupHsnSacDescriptions", () => {
  const codes = ["TEST-HSN-0001", "TEST-SAC-0001"];

  beforeAll(async () => {
    await connectToDatabase();
    const fixtures: Array<{ code: string; kind: HsnSacCodeKind; description: string }> = [
      { code: "TEST-HSN-0001", kind: "hsn", description: "Test HSN widgets" },
      { code: "TEST-SAC-0001", kind: "sac", description: "Test SAC services" },
    ];
    await HsnSacCode.bulkWrite(
      fixtures.map((doc) => ({ updateOne: { filter: { code: doc.code }, update: { $set: doc }, upsert: true } })),
    );
  });

  afterAll(async () => {
    await HsnSacCode.deleteMany({ code: { $in: codes } });
  });

  it("returns a code -> description map only for codes that exist", async () => {
    const result = await lookupHsnSacDescriptions([...codes, "NO-SUCH-CODE"]);
    expect(result.get("TEST-HSN-0001")).toBe("Test HSN widgets");
    expect(result.get("TEST-SAC-0001")).toBe("Test SAC services");
    expect(result.has("NO-SUCH-CODE")).toBe(false);
  });

  it("returns an empty map without querying when given no codes", async () => {
    expect(await lookupHsnSacDescriptions([])).toEqual(new Map());
  });
});
