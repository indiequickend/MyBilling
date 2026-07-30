import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { CreditNote, type CreditNoteLineItemDoc, type CreditNoteStatus } from "@/lib/db/models/CreditNote";
import { Business } from "@/lib/db/models/Business";
import { Customer } from "@/lib/db/models/Customer";
import { Invoice } from "@/lib/db/models/Invoice";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, type LineItemCalcInput } from "@/lib/documents/calc";
import {
  writeDocumentStockMovements,
  InsufficientStockError,
  type DocumentStockLineItem,
} from "@/lib/db/queries/stockLedger";
import type { DiscountTarget } from "@/lib/constants/invoices";

export type CreditNoteLineItemWriteInput = {
  productId?: string;
  variantId?: string;
  description: string;
  notes?: string;
  hsnOrSac?: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: "amount" | "percentage";
  discountValue: number;
  taxRatePercent: number;
  /** Only meaningful (and required by the API boundary) when productId resolves to a
   * stock-tracked product, and only actually written when the header's restockItems is on. */
  warehouseId?: string;
  batchId?: string;
  serialNumbers?: string[];
};

export type CreditNoteWriteInput = {
  businessId: string;
  linkedInvoiceId: string;
  creditNoteDate: Date;
  reason?: string;
  /** Opt-in: adds product line items back to stock when true. A credit note doesn't always
   * represent a physical return (e.g. a price-only adjustment), so this defaults off. */
  restockItems?: boolean;
  placeOfSupplyState: string;
  lineItems: CreditNoteLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
};

export type CreateCreditNoteInput = CreditNoteWriteInput & {
  createdByUserId: string;
  finalize: boolean;
};

export type CreditNoteWriteFailureReason =
  | "invoice_not_found"
  | "invoice_not_eligible"
  | "business_not_found"
  | "not_found"
  | "not_cancellable"
  | "not_deletable"
  | "insufficient_stock";

export type CreditNoteWriteResult =
  | { ok: true; creditNote: InstanceType<typeof CreditNote> }
  | { ok: false; reason: CreditNoteWriteFailureReason };

const CANCELLABLE_STATUSES: CreditNoteStatus[] = ["draft", "issued"];
const DELETABLE_STATUSES: CreditNoteStatus[] = ["draft", "cancelled"];
// A credit note may only reference a real, finalized invoice — not a draft (no docNumber yet)
// and not one already cancelled.
const INVOICE_ELIGIBLE_STATUSES = ["pending", "partially_paid", "paid"];

function buildCustomerSnapshot(customer: InstanceType<typeof Customer>) {
  return {
    displayName: customer.displayName,
    gstin: customer.gstin ?? undefined,
    billingAddress: toPlainAddress(customer.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(customer.shippingAddress) ?? undefined,
  };
}

/**
 * A Credit Note must point at an Invoice that actually belongs to this business and is finalized
 * (not draft/cancelled) — the write's only cross-collection reference. The Invoice's own customer
 * is used as the Credit Note's customer (a credit note is always against the customer that was
 * billed), so there's no separate customerId input to validate.
 */
export async function createCreditNote(input: CreateCreditNoteInput): Promise<CreditNoteWriteResult> {
  await connectToDatabase();

  const invoice = await Invoice.findOne({
    _id: input.linkedInvoiceId,
    businessId: input.businessId,
    deletedAt: { $exists: false },
  });
  if (!invoice) return { ok: false, reason: "invoice_not_found" };
  if (!INVOICE_ELIGIBLE_STATUSES.includes(invoice.status)) return { ok: false, reason: "invoice_not_eligible" };

  const customer = await Customer.findOne({ _id: invoice.customerId, businessId: input.businessId });
  if (!customer) return { ok: false, reason: "invoice_not_found" };

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

  const lineItemDocs: CreditNoteLineItemDoc[] = input.lineItems.map((li, i) => ({
    productId: li.productId ? new mongoose.Types.ObjectId(li.productId) : undefined,
    variantId: li.variantId ? new mongoose.Types.ObjectId(li.variantId) : undefined,
    description: li.description,
    notes: li.notes,
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
    warehouseId: li.warehouseId ? new mongoose.Types.ObjectId(li.warehouseId) : undefined,
    batchId: li.batchId ? new mongoose.Types.ObjectId(li.batchId) : undefined,
    serialNumbers: li.serialNumbers,
  })) as CreditNoteLineItemDoc[];

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: CreditNoteWriteResult;
    try {
      await session.withTransaction(async () => {
        let docNumber: string | undefined;
        let seriesKey: string | undefined;
        if (input.finalize) {
          const numbering = business.preferences?.documentNumbering;
          const config = resolveNumberingConfig(numbering, "credit_note");
          seriesKey = resolveSeriesKey(input.creditNoteDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
          const number = await reserveNextDocumentNumber(input.businessId, "credit_note", seriesKey, session);
          docNumber = formatDocumentNumber(config, seriesKey, number);
        }

        const [creditNoteDoc] = await CreditNote.create(
          [
            {
              businessId: input.businessId,
              customerId: customer._id,
              customerSnapshot: buildCustomerSnapshot(customer),
              linkedInvoiceId: invoice._id,
              docNumber,
              seriesKey,
              status: input.finalize ? "issued" : "draft",
              creditNoteDate: input.creditNoteDate,
              reason: input.reason,
              restockItems: input.restockItems ?? false,
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

        if (input.finalize && input.restockItems) {
          await writeDocumentStockMovements(session, {
            businessId: input.businessId,
            lineItems: creditNoteDoc.lineItems as DocumentStockLineItem[],
            direction: "in",
            reason: "credit_note",
            refDocumentType: "credit_note",
            refDocumentId: String(creditNoteDoc._id),
            refDocumentNumber: docNumber,
            createdByUserId: input.createdByUserId,
          });
        }

        result = { ok: true, creditNote: creditNoteDoc };
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) return { ok: false, reason: "insufficient_stock" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelCreditNote(creditNoteId: string, businessId: string): Promise<CreditNoteWriteResult> {
  await connectToDatabase();
  const updated = await CreditNote.findOneAndUpdate(
    { _id: creditNoteId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, creditNote: updated };
}

export async function softDeleteCreditNote(
  creditNoteId: string,
  businessId: string,
): Promise<CreditNoteWriteResult> {
  await connectToDatabase();
  const updated = await CreditNote.findOneAndUpdate(
    { _id: creditNoteId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, creditNote: updated };
}

export async function restoreCreditNote(creditNoteId: string, businessId: string) {
  await connectToDatabase();
  return CreditNote.findOneAndUpdate(
    { _id: creditNoteId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findCreditNoteById(creditNoteId: string, businessId: string) {
  await connectToDatabase();
  return CreditNote.findOne({ _id: creditNoteId, businessId });
}

export type CreditNoteListParams = {
  search?: string;
  customerId?: string;
  tab?: "all" | "draft" | "issued" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listCreditNotes(businessId: string, params: CreditNoteListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.customerId) filter.customerId = params.customerId;
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ docNumber: pattern }, { "customerSnapshot.displayName": pattern }];
  }
  return paginate(CreditNote, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { creditNoteDate: -1, createdAt: -1 },
  });
}
