import type { ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { DocumentSequence } from "@/lib/db/models/DocumentSequence";
import type { DocumentNumberingPreferences } from "@/lib/db/models/Business";
import type { DocumentType } from "@/lib/constants/documentTypes";
import { resolveNumberingConfig, resolveSeriesKey } from "@/lib/documents/numbering";

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

/**
 * Bulk-imported documents carry a caller-supplied docNumber (e.g. "INV/26-27/13") instead of one
 * drawn from the sequence, so the counter never sees them and the next system-generated number
 * would restart at 1. Raises the {docType, seriesKey} counter to the trailing number of the
 * imported docNumber (never lowers it), so the next generated number continues right after the
 * highest imported one. Pass the import's `session` when it runs inside a transaction.
 */
export async function advanceSequenceForImportedNumber(
  businessId: string,
  docType: DocumentType,
  docNumber: string,
  docDate: Date,
  numbering: DocumentNumberingPreferences | undefined,
  session?: ClientSession,
): Promise<void> {
  const trailing = /(\d+)\s*$/.exec(docNumber);
  if (!trailing) return;
  const imported = Number(trailing[1]);
  if (!Number.isSafeInteger(imported) || imported <= 0) return;

  await connectToDatabase();
  const config = resolveNumberingConfig(numbering, docType);
  const seriesKey = resolveSeriesKey(docDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
  await DocumentSequence.updateOne(
    { businessId, docType, seriesKey },
    { $max: { lastNumber: imported } },
    { upsert: true, session },
  );
}
