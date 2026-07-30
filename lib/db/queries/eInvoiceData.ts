import { connectToDatabase } from "@/lib/db/connect";
import { EInvoiceData, type EInvoiceDataDoc } from "@/lib/db/models/EInvoiceData";
import type { IrpPayload } from "@/lib/gst/eInvoicePayload";

/** Batched status lookup for the e-invoices list page — avoids an N+1 query per invoice row. */
export async function listEInvoiceDataByInvoiceIds(
  businessId: string,
  invoiceIds: string[],
): Promise<EInvoiceDataDoc[]> {
  await connectToDatabase();
  if (invoiceIds.length === 0) return [];
  return EInvoiceData.find({ businessId, invoiceId: { $in: invoiceIds } }).lean();
}

export async function findEInvoiceDataByInvoice(
  invoiceId: string,
  businessId: string,
): Promise<EInvoiceDataDoc | null> {
  await connectToDatabase();
  return EInvoiceData.findOne({ invoiceId, businessId }).lean();
}

/** Creates or updates the one EInvoiceData record for this invoice — validationStatus is only
 * ever set to "success"/"failed" here, by re-running validation; a manual "cancelled"/"pending"
 * override goes through overrideEInvoiceStatus instead. */
export async function upsertEInvoiceData(
  businessId: string,
  invoiceId: string,
  payload: IrpPayload,
  validation: { valid: boolean; errors: string[] },
  userId: string,
): Promise<EInvoiceDataDoc | null> {
  await connectToDatabase();
  return EInvoiceData.findOneAndUpdate(
    { businessId, invoiceId },
    {
      $set: {
        validationStatus: validation.valid ? "success" : "failed",
        validationErrors: validation.errors,
        generatedPayload: payload,
        generatedAt: new Date(),
      },
      $setOnInsert: { createdByUserId: userId },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
}

/** Manual local override only (e.g. the underlying invoice was cancelled) — never sets
 * "success", which is only ever produced by re-running validation via upsertEInvoiceData. */
export async function overrideEInvoiceStatus(
  businessId: string,
  invoiceId: string,
  status: "cancelled" | "pending",
): Promise<EInvoiceDataDoc | null> {
  await connectToDatabase();
  return EInvoiceData.findOneAndUpdate(
    { businessId, invoiceId },
    { $set: { validationStatus: status } },
    { returnDocument: "after" },
  ).lean();
}
