import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Invoice, type InvoiceLineItemDoc } from "@/lib/db/models/Invoice";
import { Business } from "@/lib/db/models/Business";
import { Customer } from "@/lib/db/models/Customer";
import { Payment } from "@/lib/db/models/Payment";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedSignature } from "@/lib/db/queries/signatures";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { isOwnedNoteTermTemplate } from "@/lib/db/queries/noteTermTemplates";
import { createPayment, type CreatePaymentInput } from "@/lib/db/queries/payments";
import {
  writeDocumentStockMovements,
  InsufficientStockError,
  type DocumentStockLineItem,
} from "@/lib/db/queries/stockLedger";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";
import { computeDocumentTotals, derivePaymentStatus, type LineItemCalcInput } from "@/lib/documents/calc";
import type { DiscountTarget, InvoiceStatus } from "@/lib/constants/invoices";
import type { PaymentMode } from "@/lib/constants/payments";

export type InvoiceLineItemWriteInput = {
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
   * stock-tracked product — see writeDocumentStockMovements. */
  warehouseId?: string;
  batchId?: string;
  serialNumbers?: string[];
};

export type InvoicePaymentSplitWriteInput = {
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  paymentDate: Date;
  referenceNote?: string;
};

export type InvoiceWriteInput = {
  businessId: string;
  customerId: string;
  invoiceDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  tcsApplicable?: boolean;
  tcsSectionCode?: string;
  tcsRatePercent?: number;
  tcsAmountMinor?: number;
  lineItems: InvoiceLineItemWriteInput[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  customFieldValues?: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
  signatureId?: string;
  bankAccountId?: string;
  sourceQuotationId?: string;
  sourceSalesOrderId?: string;
};

export type CreateInvoiceInput = InvoiceWriteInput & {
  createdByUserId: string;
  finalize: boolean;
  payments?: InvoicePaymentSplitWriteInput[];
};

export type InvoiceWriteFailureReason =
  | "customer_not_found"
  | "invalid_signature"
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
  | "no_payments"
  | "insufficient_stock";

export type InvoiceWriteResult =
  | { ok: true; invoice: InstanceType<typeof Invoice>; payments: InstanceType<typeof Payment>[] }
  | { ok: false; reason: InvoiceWriteFailureReason };

const EDITABLE_STATUSES: InvoiceStatus[] = ["draft", "pending", "partially_paid"];
const CANCELLABLE_STATUSES: InvoiceStatus[] = ["draft", "pending", "partially_paid"];
const DELETABLE_STATUSES: InvoiceStatus[] = ["draft", "cancelled"];
const PAYABLE_STATUSES: InvoiceStatus[] = ["pending", "partially_paid"];

function buildCustomerSnapshot(customer: InstanceType<typeof Customer>) {
  return {
    displayName: customer.displayName,
    gstin: customer.gstin ?? undefined,
    billingAddress: toPlainAddress(customer.billingAddress) ?? undefined,
    shippingAddress: toPlainAddress(customer.shippingAddress) ?? undefined,
  };
}

/**
 * Verifies every cross-collection reference on an invoice write (customer, signature, bank
 * account, note/term templates) actually belongs to this business — the same defense-in-depth
 * pattern as customers.ts/products.ts's assertOwned* helpers, just spanning more collections
 * since an invoice touches more of the app than any document before it.
 */
async function assertOwnedInvoiceReferences(params: {
  businessId: string;
  customerId: string;
  signatureId?: string;
  bankAccountId?: string;
  noteTemplateId?: string;
  termTemplateId?: string;
}): Promise<
  | { ok: true; customer: InstanceType<typeof Customer> }
  | { ok: false; reason: InvoiceWriteFailureReason }
> {
  const customer = await Customer.findOne({
    _id: params.customerId,
    businessId: params.businessId,
    deletedAt: { $exists: false },
  });
  if (!customer) return { ok: false, reason: "customer_not_found" };

  if (params.signatureId && !(await isOwnedSignature(params.signatureId, params.businessId))) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (params.bankAccountId && !(await isOwnedBankAccount(params.bankAccountId, params.businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (params.noteTemplateId && !(await isOwnedNoteTermTemplate(params.noteTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_note_template" };
  }
  if (params.termTemplateId && !(await isOwnedNoteTermTemplate(params.termTemplateId, params.businessId))) {
    return { ok: false, reason: "invalid_term_template" };
  }
  return { ok: true, customer };
}

type PreparedInvoiceWrite = {
  ok: true;
  customer: InstanceType<typeof Customer>;
  business: InstanceType<typeof Business>;
  totals: ReturnType<typeof computeDocumentTotals>;
  lineItemDocs: InvoiceLineItemDoc[];
};

/** Shared by createInvoice/updateInvoice/finalizeInvoiceDraft: validate references, then compute totals. */
async function prepareInvoiceWrite(
  input: InvoiceWriteInput,
): Promise<PreparedInvoiceWrite | { ok: false; reason: InvoiceWriteFailureReason }> {
  const ownership = await assertOwnedInvoiceReferences(input);
  if (!ownership.ok) return ownership;

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

  const lineItemDocs: InvoiceLineItemDoc[] = input.lineItems.map((li, i) => ({
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
  })) as InvoiceLineItemDoc[];

  return { ok: true, customer: ownership.customer, business, totals, lineItemDocs };
}

function buildInvoiceSetFields(input: InvoiceWriteInput, prepared: PreparedInvoiceWrite) {
  return {
    customerId: prepared.customer._id,
    customerSnapshot: buildCustomerSnapshot(prepared.customer),
    sourceQuotationId: input.sourceQuotationId,
    sourceSalesOrderId: input.sourceSalesOrderId,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    referenceNumber: input.referenceNumber,
    placeOfSupplyState: input.placeOfSupplyState,
    reverseCharge: input.reverseCharge,
    tcsApplicable: input.tcsApplicable ?? false,
    tcsSectionCode: input.tcsSectionCode,
    tcsRatePercent: input.tcsRatePercent,
    tcsAmountMinor: input.tcsAmountMinor ?? 0,
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
    signatureId: input.signatureId,
    bankAccountId: input.bankAccountId,
  };
}

function toCreatePaymentInput(
  businessId: string,
  customerId: mongoose.Types.ObjectId,
  invoiceId: mongoose.Types.ObjectId,
  split: InvoicePaymentSplitWriteInput,
  createdByUserId: string,
): CreatePaymentInput {
  return {
    businessId,
    partyType: "customer",
    partyId: String(customerId),
    direction: "in",
    amountMinor: split.amountMinor,
    mode: split.mode,
    bankAccountId: split.bankAccountId,
    paymentDate: split.paymentDate,
    linkedDocumentType: "invoice",
    linkedDocumentId: String(invoiceId),
    referenceNote: split.referenceNote,
    createdByUserId,
  };
}

async function assertOwnedPaymentBankAccounts(
  businessId: string,
  payments: InvoicePaymentSplitWriteInput[] | undefined,
): Promise<boolean> {
  if (!payments?.length) return true;
  for (const p of payments) {
    if (!(await isOwnedBankAccount(p.bankAccountId, businessId))) return false;
  }
  return true;
}

class InvoiceNoLongerDraftError extends Error {}

export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceWriteResult> {
  await connectToDatabase();

  const prepared = await prepareInvoiceWrite(input);
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
    let result!: InvoiceWriteResult;
    try {
      await session.withTransaction(async () => {
        let docNumber: string | undefined;
        let seriesKey: string | undefined;
        if (input.finalize) {
          const numbering = prepared.business.preferences?.documentNumbering;
          const config = resolveNumberingConfig(numbering, "invoice");
          seriesKey = resolveSeriesKey(input.invoiceDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
          const number = await reserveNextDocumentNumber(input.businessId, "invoice", seriesKey, session);
          docNumber = formatDocumentNumber(config, seriesKey, number);
        }

        const [invoiceDoc] = await Invoice.create(
          [
            {
              businessId: input.businessId,
              ...buildInvoiceSetFields(input, prepared),
              docNumber,
              seriesKey,
              status: input.finalize ? "pending" : "draft",
              amountPaidMinor: 0,
              createdByUserId: input.createdByUserId,
            },
          ],
          { session },
        );

        if (input.finalize) {
          await writeDocumentStockMovements(session, {
            businessId: input.businessId,
            lineItems: invoiceDoc.lineItems as DocumentStockLineItem[],
            direction: "out",
            reason: "invoice",
            refDocumentType: "invoice",
            refDocumentId: String(invoiceDoc._id),
            refDocumentNumber: docNumber,
            createdByUserId: input.createdByUserId,
          });
        }

        const createdPayments = [];
        if (input.finalize && input.payments?.length) {
          for (const split of input.payments) {
            const payment = await createPayment(
              toCreatePaymentInput(
                input.businessId,
                prepared.customer._id,
                invoiceDoc._id,
                split,
                input.createdByUserId,
              ),
              session,
            );
            createdPayments.push(payment);
          }
          const paidMinor = createdPayments.reduce((s, p) => s + p.amountMinor, 0);
          invoiceDoc.amountPaidMinor = paidMinor;
          invoiceDoc.status = derivePaymentStatus(invoiceDoc.grandTotalMinor, paidMinor);
          await invoiceDoc.save({ session });
        }

        result = { ok: true, invoice: invoiceDoc, payments: createdPayments };
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

/** Edits a draft/pending/partially_paid invoice's header and line items; paid/cancelled invoices
 * are immutable (see project_spec.md — editing a settled financial record would corrupt ledger
 * math). Not transactional: a single document update, no numbering, no Payment writes. */
export async function updateInvoice(
  invoiceId: string,
  businessId: string,
  input: InvoiceWriteInput,
): Promise<InvoiceWriteResult> {
  await connectToDatabase();
  const existing = await Invoice.findOne({ _id: invoiceId, businessId, deletedAt: { $exists: false } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (!EDITABLE_STATUSES.includes(existing.status)) return { ok: false, reason: "not_editable" };

  const prepared = await prepareInvoiceWrite(input);
  if (!prepared.ok) return prepared;

  const status: InvoiceStatus =
    existing.status === "draft"
      ? "draft"
      : derivePaymentStatus(prepared.totals.grandTotalMinor, existing.amountPaidMinor);

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, businessId },
    { $set: { ...buildInvoiceSetFields(input, prepared), status } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true, invoice: updated, payments: [] };
}

/** Turns a draft into a numbered, finalized invoice — the only place a draft ever gets a docNumber. */
export async function finalizeInvoiceDraft(
  invoiceId: string,
  businessId: string,
  input: InvoiceWriteInput,
  payments: InvoicePaymentSplitWriteInput[] | undefined,
  createdByUserId: string,
): Promise<InvoiceWriteResult> {
  await connectToDatabase();
  const existing = await Invoice.findOne({ _id: invoiceId, businessId, deletedAt: { $exists: false } });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status !== "draft") return { ok: false, reason: "not_editable" };

  const prepared = await prepareInvoiceWrite(input);
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
    let result!: InvoiceWriteResult;
    try {
      await session.withTransaction(async () => {
        const numbering = prepared.business.preferences?.documentNumbering;
        const config = resolveNumberingConfig(numbering, "invoice");
        const seriesKey = resolveSeriesKey(input.invoiceDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        const number = await reserveNextDocumentNumber(businessId, "invoice", seriesKey, session);
        const docNumber = formatDocumentNumber(config, seriesKey, number);

        const updated = await Invoice.findOneAndUpdate(
          { _id: invoiceId, businessId, status: "draft" },
          { $set: { ...buildInvoiceSetFields(input, prepared), docNumber, seriesKey, status: "pending" } },
          { returnDocument: "after", session },
        );
        // The draft was finalized/edited/deleted by a concurrent request between our read above
        // and this write — abort so the just-reserved document number rolls back with it,
        // rather than being silently burned.
        if (!updated) throw new InvoiceNoLongerDraftError();

        await writeDocumentStockMovements(session, {
          businessId,
          lineItems: updated.lineItems as DocumentStockLineItem[],
          direction: "out",
          reason: "invoice",
          refDocumentType: "invoice",
          refDocumentId: String(updated._id),
          refDocumentNumber: docNumber,
          createdByUserId,
        });

        const createdPayments = [];
        if (payments?.length) {
          for (const split of payments) {
            const payment = await createPayment(
              toCreatePaymentInput(businessId, prepared.customer._id, updated._id, split, createdByUserId),
              session,
            );
            createdPayments.push(payment);
          }
          const paidMinor = createdPayments.reduce((s, p) => s + p.amountMinor, 0);
          updated.amountPaidMinor = paidMinor;
          updated.status = derivePaymentStatus(updated.grandTotalMinor, paidMinor);
          await updated.save({ session });
        }

        result = { ok: true, invoice: updated, payments: createdPayments };
      });
    } catch (err) {
      if (err instanceof InvoiceNoLongerDraftError) return { ok: false, reason: "not_editable" };
      if (err instanceof InsufficientStockError) return { ok: false, reason: "insufficient_stock" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

/** Adds payment(s) to an already-finalized invoice (as opposed to inline recording at create/finalize time). */
export async function recordInvoicePayment(
  invoiceId: string,
  businessId: string,
  payments: InvoicePaymentSplitWriteInput[],
  createdByUserId: string,
): Promise<InvoiceWriteResult> {
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
    let result: InvoiceWriteResult = { ok: false, reason: "not_found" };
    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({ _id: invoiceId, businessId, deletedAt: { $exists: false } }).session(
        session,
      );
      if (!invoice) {
        result = { ok: false, reason: "not_found" };
        return;
      }
      if (!PAYABLE_STATUSES.includes(invoice.status)) {
        result = { ok: false, reason: "not_payable" };
        return;
      }
      const paidSum = payments.reduce((s, p) => s + p.amountMinor, 0);
      if (invoice.amountPaidMinor + paidSum > invoice.grandTotalMinor) {
        result = { ok: false, reason: "payments_exceed_total" };
        return;
      }

      const createdPayments = [];
      for (const split of payments) {
        const payment = await createPayment(
          toCreatePaymentInput(businessId, invoice.customerId, invoice._id, split, createdByUserId),
          session,
        );
        createdPayments.push(payment);
      }
      invoice.amountPaidMinor += paidSum;
      invoice.status = derivePaymentStatus(invoice.grandTotalMinor, invoice.amountPaidMinor);
      await invoice.save({ session });

      result = { ok: true, invoice, payments: createdPayments };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Cancelling reverses any stock the invoice originally moved (product line items only — service
 * lines never moved stock in the first place) so a mistaken invoice doesn't permanently corrupt
 * on-hand counts. Transactional so the status flip and the reversal always land together. */
export async function cancelInvoice(invoiceId: string, businessId: string): Promise<InvoiceWriteResult> {
  await connectToDatabase();
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: InvoiceWriteResult = { ok: false, reason: "not_cancellable" };
    await session.withTransaction(async () => {
      const updated = await Invoice.findOneAndUpdate(
        { _id: invoiceId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
        { $set: { status: "cancelled" } },
        { returnDocument: "after", session },
      );
      if (!updated) {
        result = { ok: false, reason: "not_cancellable" };
        return;
      }

      await writeDocumentStockMovements(session, {
        businessId,
        lineItems: updated.lineItems as DocumentStockLineItem[],
        direction: "in",
        reason: "invoice_cancelled",
        refDocumentType: "invoice",
        refDocumentId: String(updated._id),
        refDocumentNumber: updated.docNumber,
        createdByUserId: String(updated.createdByUserId),
      });

      result = { ok: true, invoice: updated, payments: [] };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Deleting a pending/partially_paid/paid invoice would corrupt a legal financial record and its
 * ledger math — only draft/cancelled documents may be soft-deleted. */
export async function softDeleteInvoice(invoiceId: string, businessId: string): Promise<InvoiceWriteResult> {
  await connectToDatabase();
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, invoice: updated, payments: [] };
}

export async function restoreInvoice(invoiceId: string, businessId: string) {
  await connectToDatabase();
  return Invoice.findOneAndUpdate(
    { _id: invoiceId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findInvoiceById(invoiceId: string, businessId: string) {
  await connectToDatabase();
  return Invoice.findOne({ _id: invoiceId, businessId });
}

export type InvoiceListParams = {
  search?: string;
  customerId?: string;
  tab?: "all" | "draft" | "pending" | "partially_paid" | "paid" | "cancelled" | "deleted";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

function buildInvoiceFilter(
  businessId: string,
  params: Omit<InvoiceListParams, "page" | "pageSize">,
  options: { forAggregate?: boolean } = {},
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    businessId: options.forAggregate ? new mongoose.Types.ObjectId(businessId) : businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.customerId) {
    filter.customerId = options.forAggregate
      ? new mongoose.Types.ObjectId(params.customerId)
      : params.customerId;
  }
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ docNumber: pattern }, { referenceNumber: pattern }, { "customerSnapshot.displayName": pattern }];
  }
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.invoiceDate = range;
  }
  return filter;
}

export async function listInvoices(businessId: string, params: InvoiceListParams = {}) {
  await connectToDatabase();
  const filter = buildInvoiceFilter(businessId, params);
  return paginate(Invoice, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { invoiceDate: -1, createdAt: -1 },
  });
}

export type InvoiceTotalsSummary = { totalMinor: number; paidMinor: number; pendingMinor: number };

/** Footer totals over the WHOLE filtered set, not just the current page. */
export async function sumInvoiceTotals(
  businessId: string,
  params: Omit<InvoiceListParams, "page" | "pageSize"> = {},
): Promise<InvoiceTotalsSummary> {
  await connectToDatabase();
  const filter = buildInvoiceFilter(businessId, params, { forAggregate: true });
  const [agg] = await Invoice.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" }, paidMinor: { $sum: "$amountPaidMinor" } } },
  ]);
  const totalMinor: number = agg?.totalMinor ?? 0;
  const paidMinor: number = agg?.paidMinor ?? 0;
  return { totalMinor, paidMinor, pendingMinor: totalMinor - paidMinor };
}

export type GstEligibleInvoiceRow = {
  invoiceId: string;
  docNumber?: string;
  invoiceDate: Date;
  status: InvoiceStatus;
  customerDisplayName: string;
  grandTotalMinor: number;
};

/** Finalized (non-draft) invoices flagged for e-way bill/e-invoice generation — feeds the GST
 * module's e-way bill and e-invoice list pages. */
export async function listGstFlaggedInvoices(
  businessId: string,
  flag: "eWayBillFlag" | "eInvoiceFlag",
): Promise<GstEligibleInvoiceRow[]> {
  await connectToDatabase();
  const docs = await Invoice.find({
    businessId,
    [flag]: true,
    status: { $ne: "draft" },
    deletedAt: { $exists: false },
  })
    .select("docNumber invoiceDate status customerSnapshot grandTotalMinor")
    .sort({ invoiceDate: -1 })
    .lean();

  return docs.map((inv) => ({
    invoiceId: String(inv._id),
    docNumber: inv.docNumber,
    invoiceDate: inv.invoiceDate,
    status: inv.status,
    customerDisplayName: inv.customerSnapshot?.displayName ?? "—",
    grandTotalMinor: inv.grandTotalMinor,
  }));
}
