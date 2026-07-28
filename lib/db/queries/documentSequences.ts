import type { ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { DocumentSequence } from "@/lib/db/models/DocumentSequence";

/**
 * Read-only preview of the number a document would get if finalized right now — for the
 * create-invoice form's "next number will be..." display. Never increments, so it's safe to
 * call outside a transaction and can go stale if another save races it (the real reservation
 * below is what actually guarantees no gaps/dupes).
 */
export async function peekNextDocumentNumber(
  businessId: string,
  docType: string,
  seriesKey: string,
): Promise<number> {
  await connectToDatabase();
  const doc = await DocumentSequence.findOne({ businessId, docType, seriesKey }).lean();
  return (doc?.lastNumber ?? 0) + 1;
}

/**
 * Atomically increments and returns the next number in this business's {docType, seriesKey}
 * series. MUST be called with an active transaction session shared with the document create —
 * that's what makes numbering gap-safe: if the surrounding transaction rolls back, this
 * increment rolls back with it, so a failed save never burns a number.
 */
export async function reserveNextDocumentNumber(
  businessId: string,
  docType: string,
  seriesKey: string,
  session: ClientSession,
): Promise<number> {
  await connectToDatabase();
  const updated = await DocumentSequence.findOneAndUpdate(
    { businessId, docType, seriesKey },
    { $inc: { lastNumber: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  return updated.lastNumber;
}
