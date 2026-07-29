import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { DebitNote, type DebitNoteLineItemDoc, type DebitNoteStatus } from "@/lib/db/models/DebitNote";
import { Business } from "@/lib/db/models/Business";
import { Vendor } from "@/lib/db/models/Vendor";
import { Purchase } from "@/lib/db/models/Purchase";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type DebitNoteLineItemWriteInput = {
  productId?: string;
  variantId?: string;
  description: string;
  hsnOrSac?: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: "amount" | "percentage";
  discountValue: number;
  taxRatePercent: number;
};

export type DebitNoteWriteInput = {
  businessId: string;
  linkedPurchaseId: string;
  debitNoteDate: Date;
  reason?: string;
  placeOfSupplyState: string;
  lineItems: DebitNoteLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
};

export type CreateDebitNoteInput = DebitNoteWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type DebitNoteWriteFailureReason =
  | "purchase_not_found"
  | "business_not_found"
  | "not_found"
  | "not_cancellable"
  | "not_deletable";

export type DebitNoteWriteResult =
  | { ok: true; debitNote: InstanceType<typeof DebitNote> }
  | { ok: false; reason: DebitNoteWriteFailureReason };

const CANCELLABLE_STATUSES: DebitNoteStatus[] = ["draft", "issued"];
const DELETABLE_STATUSES: DebitNoteStatus[] = ["draft", "cancelled"];

function buildVendorSnapshot(vendor: InstanceType<typeof Vendor>) {
  return {
    displayName: vendor.displayName,
    gstin: vendor.gstin ?? undefined,
    billingAddress: toPlainAddress(vendor.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(vendor.shippingAddress) ?? undefined,
  };
}

/**
 * A Debit Note must point at a Purchase that actually belongs to this business — the write's
 * only cross-collection reference. The Purchase's own vendor is used as the Debit Note's vendor
 * (a debit note is always against the vendor that was billed), so there's no separate vendorId
 * input to validate.
 */
export async function createDebitNote(input: CreateDebitNoteInput): Promise<DebitNoteWriteResult> {
  await connectToDatabase();

  const purchase = await Purchase.findOne({
    _id: input.linkedPurchaseId,
    businessId: input.businessId,
    deletedAt: { $exists: false },
  });
  if (!purchase) return { ok: false, reason: "purchase_not_found" };

  const vendor = await Vendor.findOne({ _id: purchase.vendorId, businessId: input.businessId });
  if (!vendor) return { ok: false, reason: "purchase_not_found" };

  const business = await Business.findOne({ _id: input.businessId, deletedAt: { $exists: false } });
  if (!business) return { ok: false, reason: "business_not_found" };

  const businessState = business.addresses?.billing?.state ?? "";
  const lineItemCalcInputs: LineItemCalcInput[] = input.lineItems.map((li) => ({
    quantity: li.quantity,
    unitPriceMinor: li.unitPriceMinor,
    discountType: li.discountType,
    discountValue: li.discountValue,
    taxRatePercent: li.taxRatePercent,
  }));

  const totals = computeDocumentTotals(
    lineItemCalcInputs,
    { type: input.discountType, value: input.discountValue, target: input.discountTarget },
    input.roundOff,
    businessState,
    input.placeOfSupplyState,
  );

  const lineItemDocs: DebitNoteLineItemDoc[] = input.lineItems.map((li, i) => ({
    productId: li.productId ? new mongoose.Types.ObjectId(li.productId) : undefined,
    variantId: li.variantId ? new mongoose.Types.ObjectId(li.variantId) : undefined,
    description: li.description,
    hsnOrSac: li.hsnOrSac,
    unit: li.unit ?? "PCS",
    quantity: li.quantity,
    unitPriceMinor: li.unitPriceMinor,
    discountType: li.discountType,
    discountValue: li.discountValue,
    taxRatePercent: li.taxRatePercent,
    cgstMinor: totals.lineItems[i].cgstMinor,
    sgstMinor: totals.lineItems[i].sgstMinor,
    igstMinor: totals.lineItems[i].igstMinor,
    taxableAmountMinor: totals.lineItems[i].taxableAmountMinor,
    totalMinor: totals.lineItems[i].totalMinor,
  })) as DebitNoteLineItemDoc[];

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: DebitNoteWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "debit_note");
        seriesKey = resolveSeriesKey(input.debitNoteDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "debit_note", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [debitNoteDoc] = await DebitNote.create(
        [
          {
            businessId: input.businessId,
            vendorId: vendor._id,
            vendorSnapshot: buildVendorSnapshot(vendor),
            linkedPurchaseId: purchase._id,
            docNumber,
            seriesKey,
            status: input.finalize ? "issued" : "draft",
            debitNoteDate: input.debitNoteDate,
            reason: input.reason,
            placeOfSupplyState: input.placeOfSupplyState,
            lineItems: lineItemDocs,
            discountType: input.discountType,
            discountValue: input.discountValue,
            discountTarget: input.discountTarget,
            discountAmountMinor: totals.discountAmountMinor,
            roundOff: input.roundOff,
            roundOffAmountMinor: totals.roundOffAmountMinor,
            subtotalMinor: totals.subtotalMinor,
            totalTaxMinor: totals.totalTaxMinor,
            totalCgstMinor: totals.totalCgstMinor,
            totalSgstMinor: totals.totalSgstMinor,
            totalIgstMinor: totals.totalIgstMinor,
            grandTotalMinor: totals.grandTotalMinor,
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      result = { ok: true, debitNote: debitNoteDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelDebitNote(debitNoteId: string, businessId: string): Promise<DebitNoteWriteResult> {
  await connectToDatabase();
  const updated = await DebitNote.findOneAndUpdate(
    { _id: debitNoteId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, debitNote: updated };
}

export async function softDeleteDebitNote(
  debitNoteId: string,
  businessId: string,
): Promise<DebitNoteWriteResult> {
  await connectToDatabase();
  const updated = await DebitNote.findOneAndUpdate(
    { _id: debitNoteId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, debitNote: updated };
}

export async function restoreDebitNote(debitNoteId: string, businessId: string) {
  await connectToDatabase();
  return DebitNote.findOneAndUpdate(
    { _id: debitNoteId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findDebitNoteById(debitNoteId: string, businessId: string) {
  await connectToDatabase();
  return DebitNote.findOne({ _id: debitNoteId, businessId });
}

export type DebitNoteListParams = {
  search?: string;
  vendorId?: string;
  tab?: "all" | "draft" | "issued" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listDebitNotes(businessId: string, params: DebitNoteListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.vendorId) filter.vendorId = params.vendorId;
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ docNumber: pattern }, { "vendorSnapshot.displayName": pattern }];
  }
  return paginate(DebitNote, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { debitNoteDate: -1, createdAt: -1 },
  });
}
