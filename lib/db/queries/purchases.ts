import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Purchase, type PurchaseLineItemDoc } from "@/lib/db/models/Purchase";
import { Business } from "@/lib/db/models/Business";
import { Vendor } from "@/lib/db/models/Vendor";
import { Payment } from "@/lib/db/models/Payment";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { createPayment, type CreatePaymentInput } from "@/lib/db/queries/payments";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, derivePaymentStatus, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget } from "@/lib/constants/invoices";
import type { DocumentStatus } from "@/lib/constants/documents";
import type { PaymentMode } from "@/lib/constants/payments";

export type PurchaseLineItemWriteInput = {
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
  /** Only honored when the business's trackItcEligibility preference is on; forced false otherwise. */
  itcEligible?: boolean;
};

export type PurchasePaymentSplitWriteInput = {
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  paymentDate: Date;
  referenceNote?: string;
};

export type PurchaseWriteInput = {
  businessId: string;
  vendorId: string;
  purchaseDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  vendorInvoiceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: PurchaseLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  customFieldValues?: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
  bankAccountId?: string;
  /** Set when this Purchase is created by converting a Purchase Order (see purchaseOrders.ts). */
  sourcePurchaseOrderId?: string;
};

export type CreatePurchaseInput = PurchaseWriteInput & {
  createdByUserId: string;
  finalize: boolean;
  payments?: PurchasePaymentSplitWriteInput[];
};

export type PurchaseWriteFailureReason =
  | "vendor_not_found"
  | "invalid_bank_account"
  | "invalid_note_template"
  | "invalid_term_template"
  | "business_not_found"
  | "payments_exceed_total"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable"
  | "not_payable"
  | "no_payments";

export type PurchaseWriteResult =
  | { ok: true; purchase: InstanceType<typeof Purchase>; payments: InstanceType<typeof Payment>[] }
  | { ok: false; reason: PurchaseWriteFailureReason };

const EDITABLE_STATUSES: DocumentStatus[] = ["draft", "pending", "partially_paid"];
const CANCELLABLE_STATUSES: DocumentStatus[] = ["draft", "pending", "partially_paid"];
const DELETABLE_STATUSES: DocumentStatus[] = ["draft", "cancelled"];
const PAYABLE_STATUSES: DocumentStatus[] = ["pending", "partially_paid"];

function buildVendorSnapshot(vendor: InstanceType<typeof Vendor>) {
  return {
    displayName: vendor.displayName,
    gstin: vendor.gstin ?? undefined,
    billingAddress: toPlainAddress(vendor.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(vendor.shippingAddress) ?? undefined,
  };
}

/**
 * Verifies every cross-collection reference on a purchase write (vendor, bank account, note/term
 * templates) actually belongs to this business — same defense-in-depth pattern as
 * assertOwnedInvoiceReferences in invoices.ts.
 */
async function assertOwnedPurchaseReferences(params: {
  businessId: string;
  vendorId: string;
  bankAccountId?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; vendor: InstanceType<typeof Vendor> }
  | { ok: false; reason: PurchaseWriteFailureReason }
> {
  const vendor = await Vendor.findOne({
    _id: params.vendorId,
    businessId: params.businessId,
    deletedAt: { $exists: false },
  });
  if (!vendor) return { ok: false, reason: "vendor_not_found" };

  if (params.bankAccountId && !(await isOwnedBankAccount(params.bankAccountId, params.businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (params.noteTemplateId && !(await isOwnedNoteTermTemplate(params.noteTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_note_template" };
  }
  if (params.termTemplateId && !(await isOwnedNoteTermTemplate(params.termTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_term_template" };
  }
  return { ok: true, vendor };
}

type PreparedPurchaseWrite = {
  ok: true;
  vendor: InstanceType<typeof Vendor>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: PurchaseLineItemDoc[];
};

/** Shared by createPurchase/updatePurchase/finalizePurchaseDraft: validate references, then compute totals. */
async function preparePurchaseWrite(
  input: PurchaseWriteInput,
): Promise<PreparedPurchaseWrite | { ok: false; reason: PurchaseWriteFailureReason }> {
  const ownership = await assertOwnedPurchaseReferences(input);
  if (!ownership.ok) return ownership;

  const business = await Business.findOne({ _id: input.businessId, deletedAt: { $exists: false } });
  if (!business) return { ok: false, reason: "business_not_found" };

  const trackItcEligibility = business.preferences?.document?.purchases?.trackItcEligibility ?? false;

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

  const lineItemDocs: PurchaseLineItemDoc[] = input.lineItems.map((li, i) => ({
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
    itcEligible: trackItcEligibility ? (li.itcEligible ?? true) : false,
  })) as PurchaseLineItemDoc[];

  return { ok: true, vendor: ownership.vendor, business, totals, lineItemDocs };
}

function buildPurchaseSetFields(input: PurchaseWriteInput, prepared: PreparedPurchaseWrite) {
  return {
    vendorId: prepared.vendor._id,
    vendorSnapshot: buildVendorSnapshot(prepared.vendor),
    purchaseDate: input.purchaseDate,
    dueDate: input.dueDate,
    referenceNumber: input.referenceNumber,
    vendorInvoiceNumber: input.vendorInvoiceNumber,
    placeOfSupplyState: input.placeOfSupplyState,
    reverseCharge: input.reverseCharge,
    sourcePurchaseOrderId: input.sourcePurchaseOrderId,
    lineItems: prepared.lineItemDocs,
    discountType: input.discountType,
    discountValue: input.discountValue,
    discountTarget: input.discountTarget,
    discountAmountMinor: prepared.totals.discountAmountMinor,
    roundOff: input.roundOff,
    roundOffAmountMinor: prepared.totals.roundOffAmountMinor,
    subtotalMinor: prepared.totals.subtotalMinor,
    totalTaxMinor: prepared.totals.totalTaxMinor,
    totalCgstMinor: prepared.totals.totalCgstMinor,
    totalSgstMinor: prepared.totals.totalSgstMinor,
    totalIgstMinor: prepared.totals.totalIgstMinor,
    grandTotalMinor: prepared.totals.grandTotalMinor,
    customFieldValues: input.customFieldValues ?? {},
    notes: input.notes,
    terms: input.terms,
    noteTemplateId: input.noteTemplateId,
    termTemplateId: input.termTemplateId,
    bankAccountId: input.bankAccountId,
  };
}

function toCreatePaymentInput(
  businessId: string,
  vendorId: mongoose.Types.ObjectId,
  purchaseId: mongoose.Types.ObjectId,
  split: PurchasePaymentSplitWriteInput,
  createdByUserId: string,
): CreatePaymentInput {
  return {
    businessId,
    partyType: "vendor",
    partyId: String(vendorId),
    direction: "out",
    amountMinor: split.amountMinor,
    mode: split.mode,
    bankAccountId: split.bankAccountId,
    paymentDate: split.paymentDate,
    linkedDocumentType: "purchase",
    linkedDocumentId: String(purchaseId),
    referenceNote: split.referenceNote,
    createdByUserId,
  };
}

async function assertOwnedPaymentBankAccounts(
  businessId: string,
  payments: PurchasePaymentSplitWriteInput[] | undefined,
): Promise<boolean> {
  if (!payments?.length) return true;
  for (const p of payments) {
    if (!(await isOwnedBankAccount(p.bankAccountId, businessId))) return false;
  }
  return true;
}

class PurchaseNoLongerDraftError extends Error {}

export async function createPurchase(input: CreatePurchaseInput): Promise<PurchaseWriteResult> {
  await connectToDatabase();

  const prepared = await preparePurchaseWrite(input);
  if (!prepared.ok) return prepared;

  if (!(await assertOwnedPaymentBankAccounts(input.businessId, input.payments))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (input.finalize && input.payments?.length) {
    const paidSum = input.payments.reduce((s, p) => s + p.amountMinor, 0);
    if (paidSum > prepared.totals.grandTotalMinor) return { ok: false, reason: "payments_exceed_total" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: PurchaseWriteResult;
    await session.withTransaction(async () => {
      let docNumber: string | undefined;
      let seriesKey: string | undefined;
      if (input.finalize) {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "purchase");
        seriesKey = resolveSeriesKey(input.purchaseDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(input.businessId, "purchase", seriesKey, session);
        docNumber = formatDocumentNumber(config, seriesKey, number);
      }

      const [purchaseDoc] = await Purchase.create(
        [
          {
            businessId: input.businessId,
            ...buildPurchaseSetFields(input, prepared),
            docNumber,
            seriesKey,
            status: input.finalize ? "pending" : "draft",
            amountPaidMinor: 0,
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      const createdPayments = [];
      if (input.finalize && input.payments?.length) {
        for (const split of input.payments) {
          const payment = await createPayment(
            toCreatePaymentInput(
              input.businessId,
              prepared.vendor._id,
              purchaseDoc._id,
              split,
              input.createdByUserId,
            ),
            session,
          );
          createdPayments.push(payment);
        }
        const paidMinor = createdPayments.reduce((s, p) => s + p.amountMinor, 0);
        purchaseDoc.amountPaidMinor = paidMinor;
        purchaseDoc.status = derivePaymentStatus(purchaseDoc.grandTotalMinor, paidMinor);
        await purchaseDoc.save({ session });
      }

      result = { ok: true, purchase: purchaseDoc, payments: createdPayments };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Edits a draft/pending/partially_paid purchase's header and line items; paid/cancelled purchases
 * are immutable (same reasoning as updateInvoice — editing a settled financial record would
 * corrupt ledger math). Not transactional: a single document update, no numbering, no Payment writes. */
export async function updatePurchase(
  purchaseId: string,
  businessId: string,
  input: PurchaseWriteInput,
): Promise<PurchaseWriteResult> {
  await connectToDatabase();
  const existing = await Purchase.findOne({ _id: purchaseId, businessId, deletedAt: { $exists: false } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await preparePurchaseWrite(input);
  if (!prepared.ok) return prepared;

  const status: DocumentStatus =
    existing.status === "draft"
      ? "draft"
      : derivePaymentStatus(prepared.totals.grandTotalMinor, existing.amountPaidMinor);

  const updated = await Purchase.findOneAndUpdate(
    { _id: purchaseId, businessId },
    { $set: { ...buildPurchaseSetFields(input, prepared), status } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, purchase: updated, payments: [] };
}

/** Turns a draft into a numbered, finalized purchase — the only place a draft ever gets a docNumber. */
export async function finalizePurchaseDraft(
  purchaseId: string,
  businessId: string,
  input: PurchaseWriteInput,
  payments: PurchasePaymentSplitWriteInput[] | undefined,
  createdByUserId: string,
): Promise<PurchaseWriteResult> {
  await connectToDatabase();
  const existing = await Purchase.findOne({ _id: purchaseId, businessId, deletedAt: { $exists: false } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await preparePurchaseWrite(input);
  if (!prepared.ok) return prepared;

  if (!(await assertOwnedPaymentBankAccounts(businessId, payments))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (payments?.length) {
    const paidSum = payments.reduce((s, p) => s + p.amountMinor, 0);
    if (paidSum > prepared.totals.grandTotalMinor) return { ok: false, reason: "payments_exceed_total" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: PurchaseWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "purchase");
        const seriesKey = resolveSeriesKey(input.purchaseDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "purchase", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await Purchase.findOneAndUpdate(
          { _id: purchaseId, businessId, status: "draft" },
          { $set: { ...buildPurchaseSetFields(input, prepared), docNumber, seriesKey, status: "pending" } },
          { returnDocument: "after", session },
        );
        // The draft was finalized/edited/deleted by a concurrent request between our read above
        // and this write — abort so the just-reserved document number rolls back with it,
        // rather than being silently burned.
        if (!updated) throw new PurchaseNoLongerDraftError();

        const createdPayments = [];
        if (payments?.length) {
          for (const split of payments) {
            const payment = await createPayment(
              toCreatePaymentInput(businessId, prepared.vendor._id, updated._id, split, createdByUserId),
              session,
            );
            createdPayments.push(payment);
          }
          const paidMinor = createdPayments.reduce((s, p) => s + p.amountMinor, 0);
          updated.amountPaidMinor = paidMinor;
          updated.status = derivePaymentStatus(updated.grandTotalMinor, paidMinor);
          await updated.save({ session });
        }

        result = { ok: true, purchase: updated, payments: createdPayments };
      });
    } catch (err) {
      if (err instanceof PurchaseNoLongerDraftError) return { ok: false, reason: "not_editable" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

/** Adds payment(s) to an already-finalized purchase (as opposed to inline recording at create/finalize time). */
export async function recordPurchasePayment(
  purchaseId: string,
  businessId: string,
  payments: PurchasePaymentSplitWriteInput[],
  createdByUserId: string,
): Promise<PurchaseWriteResult> {
  await connectToDatabase();
  if (!payments.length) return { ok: false, reason: "no_payments" };
  if (!(await assertOwnedPaymentBankAccounts(businessId, payments))) {
    return { ok: false, reason: "invalid_bank_account" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    // Reassigned fresh on every invocation of the withTransaction callback (including retries
    // after a transient error), so a stale value from an earlier attempt can never leak out.
    let result: PurchaseWriteResult = { ok: false, reason: "not_found" };
    await session.withTransaction(async () => {
      const purchase = await Purchase.findOne({ _id: purchaseId, businessId, deletedAt: { $exists: false } }).session(
        session,
      );
      if (!purchase) {
        result = { ok: false, reason: "not_found" };
        return;
      }
      if (!PAYABLE_STATUSES.includes(purchase.status)) {
        result = { ok: false, reason: "not_payable" };
        return;
      }
      const paidSum = payments.reduce((s, p) => s + p.amountMinor, 0);
      if (purchase.amountPaidMinor + paidSum > purchase.grandTotalMinor) {
        result = { ok: false, reason: "payments_exceed_total" };
        return;
      }

      const createdPayments = [];
      for (const split of payments) {
        const payment = await createPayment(
          toCreatePaymentInput(businessId, purchase.vendorId, purchase._id, split, createdByUserId),
          session,
        );
        createdPayments.push(payment);
      }
      purchase.amountPaidMinor += paidSum;
      purchase.status = derivePaymentStatus(purchase.grandTotalMinor, purchase.amountPaidMinor);
      await purchase.save({ session });

      result = { ok: true, purchase, payments: createdPayments };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelPurchase(purchaseId: string, businessId: string): Promise<PurchaseWriteResult> {
  await connectToDatabase();
  const updated = await Purchase.findOneAndUpdate(
    { _id: purchaseId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, purchase: updated, payments: [] };
}

/** Deleting a pending/partially_paid/paid purchase would corrupt a legal financial record and its
 * ledger math — only draft/cancelled documents may be soft-deleted. */
export async function softDeletePurchase(purchaseId: string, businessId: string): Promise<PurchaseWriteResult> {
  await connectToDatabase();
  const updated = await Purchase.findOneAndUpdate(
    { _id: purchaseId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, purchase: updated, payments: [] };
}

export async function restorePurchase(purchaseId: string, businessId: string) {
  await connectToDatabase();
  return Purchase.findOneAndUpdate(
    { _id: purchaseId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findPurchaseById(purchaseId: string, businessId: string) {
  await connectToDatabase();
  return Purchase.findOne({ _id: purchaseId, businessId });
}

export type PurchaseListParams = {
  search?: string;
  vendorId?: string;
  tab?: "all" | "draft" | "pending" | "partially_paid" | "paid" | "cancelled" | "deleted";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

function buildPurchaseFilter(
  businessId: string,
  params: Omit<PurchaseListParams, "page" | "pageSize">,
  options: { forAggregate?: boolean } = {},
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    businessId: options.forAggregate ? new mongoose.Types.ObjectId(businessId) : businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.vendorId) {
    filter.vendorId = options.forAggregate ? new mongoose.Types.ObjectId(params.vendorId) : params.vendorId;
  }
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [
      { docNumber: pattern },
      { referenceNumber: pattern },
      { vendorInvoiceNumber: pattern },
      { "vendorSnapshot.displayName": pattern },
    ];
  }
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.purchaseDate = range;
  }
  return filter;
}

export async function listPurchases(businessId: string, params: PurchaseListParams = {}) {
  await connectToDatabase();
  const filter = buildPurchaseFilter(businessId, params);
  return paginate(Purchase, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { purchaseDate: -1, createdAt: -1 },
  });
}

export type PurchaseTotalsSummary = { totalMinor: number; paidMinor: number; pendingMinor: number };

/** Footer totals over the WHOLE filtered set, not just the current page. */
export async function sumPurchaseTotals(
  businessId: string,
  params: Omit<PurchaseListParams, "page" | "pageSize"> = {},
): Promise<PurchaseTotalsSummary> {
  await connectToDatabase();
  const filter = buildPurchaseFilter(businessId, params, { forAggregate: true });
  const [agg] = await Purchase.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" }, paidMinor: { $sum: "$amountPaidMinor" } } },
  ]);
  const totalMinor: number = agg?.totalMinor ?? 0;
  const paidMinor: number = agg?.paidMinor ?? 0;
  return { totalMinor, paidMinor, pendingMinor: totalMinor - paidMinor };
}
