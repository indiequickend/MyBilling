import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { connectToDatabase } from "@/lib/db/connect";
import {
  peekNextDocumentNumber,
  reserveNextDocumentNumber,
} from "@/lib/db/queries/documentSequences";
import { DocumentSequence } from "@/lib/db/models/DocumentSequence";

describe("documentSequences — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("document-sequences");
  });

  afterAll(async () => {
    await DocumentSequence.deleteMany({
      businessId: { $in: [tenants.businessAId, tenants.businessBId] },
    });
    await teardownTwoTenants(tenants);
  });

  it("two businesses issuing the same docType/seriesKey each start their own counter at 1", async () => {
    const conn = await connectToDatabase();

    const sessionA = await conn.startSession();
    let numberA!: number;
    await sessionA.withTransaction(async () => {
      numberA = await reserveNextDocumentNumber(tenants.businessAId, "invoice", "2025-26", sessionA);
    });
    await sessionA.endSession();

    const sessionB = await conn.startSession();
    let numberB!: number;
    await sessionB.withTransaction(async () => {
      numberB = await reserveNextDocumentNumber(tenants.businessBId, "invoice", "2025-26", sessionB);
    });
    await sessionB.endSession();

    expect(numberA).toBe(1);
    expect(numberB).toBe(1);
  });

  it("peekNextDocumentNumber never increments and reflects the next unreserved number", async () => {
    const preview = await peekNextDocumentNumber(tenants.businessAId, "invoice", "2025-26");
    expect(preview).toBe(2); // one number already reserved for business A above

    const previewAgain = await peekNextDocumentNumber(tenants.businessAId, "invoice", "2025-26");
    expect(previewAgain).toBe(2);
  });

  it("a rolled-back transaction does not consume a number", async () => {
    const before = await peekNextDocumentNumber(tenants.businessAId, "invoice", "2025-26");

    const conn = await connectToDatabase();
    const session = await conn.startSession();
    await expect(
      session.withTransaction(async () => {
        await reserveNextDocumentNumber(tenants.businessAId, "invoice", "2025-26", session);
        throw new Error("simulated failure after reservation");
      }),
    ).rejects.toThrow("simulated failure after reservation");
    await session.endSession();

    const after = await peekNextDocumentNumber(tenants.businessAId, "invoice", "2025-26");
    expect(after).toBe(before);
  });

  it("N concurrent reservations for one business produce unique, gap-free numbers", async () => {
    const conn = await connectToDatabase();
    const concurrency = 10;

    const results = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const session = await conn.startSession();
        try {
          let number!: number;
          await session.withTransaction(async () => {
            number = await reserveNextDocumentNumber(tenants.businessBId, "invoice", "race-fy", session);
          });
          return number;
        } finally {
          await session.endSession();
        }
      }),
    );

    const sorted = [...results].sort((a, b) => a - b);
    expect(new Set(sorted).size).toBe(concurrency); // all unique
    expect(sorted).toEqual(Array.from({ length: concurrency }, (_, i) => i + 1)); // 1..N, no gaps
  });
});
