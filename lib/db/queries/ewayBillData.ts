import { connectToDatabase } from "@/lib/db/connect";
import { EwayBillData, type EwayBillDataDoc, type EwayBillTransportDetailsDoc } from "@/lib/db/models/EwayBillData";
import type { EwbInv01Payload } from "@/lib/gst/ewayBillPayload";

/** Batched status lookup for the e-way bills list page — avoids an N+1 query per invoice row. */
export async function listEwayBillDataByInvoiceIds(
  businessId: string,
  invoiceIds: string[],
): Promise<EwayBillDataDoc[]> {
  await connectToDatabase();
  if (invoiceIds.length === 0) return [];
  return EwayBillData.find({ businessId, invoiceId: { $in: invoiceIds } }).lean();
}

export async function findEwayBillDataByInvoice(
  invoiceId: string,
  businessId: string,
): Promise<EwayBillDataDoc | null> {
  await connectToDatabase();
  return EwayBillData.findOne({ invoiceId, businessId }).lean();
}

/** Creates or updates the one EwayBillData record for this invoice — always sets status to
 * "generated" since a payload was just (re)built. */
export async function upsertEwayBillData(
  businessId: string,
  invoiceId: string,
  transportDetails: EwayBillTransportDetailsDoc,
  payload: EwbInv01Payload,
  userId: string,
): Promise<EwayBillDataDoc | null> {
  await connectToDatabase();
  return EwayBillData.findOneAndUpdate(
    { businessId, invoiceId },
    {
      $set: {
        status: "generated",
        transportDetails,
        generatedPayload: payload,
        generatedAt: new Date(),
      },
      $setOnInsert: { createdByUserId: userId },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
}
