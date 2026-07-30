import mongoose, { type ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Payment } from "@/lib/db/models/Payment";
import { Invoice, type InvoiceStatus } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { DebitNote } from "@/lib/db/models/DebitNote";
import { CreditNote } from "@/lib/db/models/CreditNote";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { derivePaymentStatus } from "@/lib/documents/calc";
import type { DocumentStatus } from "@/lib/constants/documents";
import { clampPageParams, paginate, type PaginatedResult } from "@/lib/db/queryHelpers";
import type { PaymentMode } from "@/lib/constants/payments";

export type PaymentsTimelineParams = {
  bankAccountId?: string;
  direction?: "in" | "out";
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
};

function buildPaymentsTimelineFilter(
  businessId: string,
  params: Omit<PaymentsTimelineParams, "page" | "pageSize">,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { businessId, voidedAt: { $exists: false } };
  if (params.bankAccountId) filter.bankAccountId = params.bankAccountId;
  if (params.direction) filter.direction = params.direction;
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.paymentDate = range;
  }
  if (params.search) filter.referenceNote = { $regex: params.search.trim(), $options: "i" };
  return filter;
}

export type PaymentTimelineEntry = {
  _id: mongoose.Types.ObjectId;
  direction: "in" | "out";
  amountMinor: number;
  mode: PaymentMode;
  paymentDate: Date;
  referenceNote?: string;
  bankAccountId: mongoose.Types.ObjectId;
  bankAccountName: string;
  partyType?: "customer" | "vendor";
  partyId?: mongoose.Types.ObjectId;
  partyName?: string;
  linkedDocumentType: string;
  linkedDocumentId: mongoose.Types.ObjectId;
  linkedDocumentNumber?: string;
  createdByUserId: mongoose.Types.ObjectId;
};

/**
 * Unified cross-account view (project_spec.md's Payments "Timeline") — unlike getPartyLedger
 * (single party, merges in Invoice/Purchase/Note rows too), this is Payment rows only, across
 * every bank/cash/personal account for the business. Party/bank-account/document names are
 * resolved in one batched pass per page (not per row) to avoid N+1 queries.
 */
export async function listPaymentsTimeline(
  businessId: string,
  params: PaymentsTimelineParams = {},
): Promise<PaginatedResult<PaymentTimelineEntry>> {
  await connectToDatabase();
  const filter = buildPaymentsTimelineFilter(businessId, params);
  const result = await paginate(Payment, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { paymentDate: -1, createdAt: -1 },
  });

  const bankAccountIds = [...new Set(result.items.map((p) => String(p.bankAccountId)))];
  const customerIds = [...new Set(result.items.filter((p) => p.partyType === "customer").map((p) => String(p.partyId)))];
  const vendorIds = [...new Set(result.items.filter((p) => p.partyType === "vendor").map((p) => String(p.partyId)))];
  const invoiceIds = [
    ...new Set(result.items.filter((p) => p.linkedDocumentType === "invoice").map((p) => String(p.linkedDocumentId))),
  ];
  const purchaseIds = [
    ...new Set(result.items.filter((p) => p.linkedDocumentType === "purchase").map((p) => String(p.linkedDocumentId))),
  ];

  const [bankAccounts, customers, vendors, invoices, purchases] = await Promise.all([
    bankAccountIds.length ? BankAccount.find({ _id: { $in: bankAccountIds } }).select("name").lean() : [],
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select("displayName").lean() : [],
    vendorIds.length ? Vendor.find({ _id: { $in: vendorIds } }).select("displayName").lean() : [],
    invoiceIds.length ? Invoice.find({ _id: { $in: invoiceIds } }).select("docNumber").lean() : [],
    purchaseIds.length ? Purchase.find({ _id: { $in: purchaseIds } }).select("docNumber").lean() : [],
  ]);

  const bankAccountName = new Map(bankAccounts.map((a) => [String(a._id), a.name as string]));
  const customerName = new Map(customers.map((c) => [String(c._id), (c as { displayName: string }).displayName]));
  const vendorName = new Map(vendors.map((v) => [String(v._id), (v as { displayName: string }).displayName]));
  const invoiceNumber = new Map(invoices.map((i) => [String(i._id), i.docNumber as string | undefined]));
  const purchaseNumber = new Map(purchases.map((p) => [String(p._id), p.docNumber as string | undefined]));

  const items: PaymentTimelineEntry[] = result.items.map((p) => {
    const referenceNote = p.referenceNote ?? undefined;
    const partyName =
      p.partyType === "customer"
        ? customerName.get(String(p.partyId))
        : p.partyType === "vendor"
          ? vendorName.get(String(p.partyId))
          : undefined;
    const linkedDocumentNumber =
      p.linkedDocumentType === "invoice"
        ? invoiceNumber.get(String(p.linkedDocumentId))
        : p.linkedDocumentType === "purchase"
          ? purchaseNumber.get(String(p.linkedDocumentId))
          : undefined;
    return {
      _id: p._id,
      direction: p.direction,
      amountMinor: p.amountMinor,
      mode: p.mode,
      paymentDate: p.paymentDate,
      referenceNote,
      bankAccountId: p.bankAccountId,
      bankAccountName: bankAccountName.get(String(p.bankAccountId)) ?? "—",
      partyType: p.partyType ?? undefined,
      partyId: p.partyId ?? undefined,
      partyName,
      linkedDocumentType: p.linkedDocumentType,
      linkedDocumentId: p.linkedDocumentId,
      linkedDocumentNumber,
      createdByUserId: p.createdByUserId,
    };
  });

  return { ...result, items };
}

export type PaymentsTimelineTotals = { netBalanceMinor: number; receivedMinor: number; givenMinor: number };

/** Footer totals over the WHOLE filtered set, not just the current page — same pattern as
 * sumInvoiceTotals/sumPurchaseTotals. */
export async function sumPaymentsTimeline(
  businessId: string,
  params: Omit<PaymentsTimelineParams, "page" | "pageSize"> = {},
): Promise<PaymentsTimelineTotals> {
  await connectToDatabase();
  const filter = buildPaymentsTimelineFilter(businessId, params);
  const rows = await Payment.aggregate([
    { $match: { ...filter, businessId: new mongoose.Types.ObjectId(businessId) } },
    { $group: { _id: "$direction", total: { $sum: "$amountMinor" } } },
  ]);
  const receivedMinor = rows.find((r) => r._id === "in")?.total ?? 0;
  const givenMinor = rows.find((r) => r._id === "out")?.total ?? 0;
  return { netBalanceMinor: receivedMinor - givenMinor, receivedMinor, givenMinor };
}

export async function listPaymentsForDocument(
  linkedDocumentType: "invoice" | "purchase" | "expense" | "indirect_income",
  linkedDocumentId: string,
  businessId: string,
) {
  await connectToDatabase();
  return Payment.find({ businessId, linkedDocumentType, linkedDocumentId }).sort({ paymentDate: 1 }).lean();
}

export type CreatePaymentInput = {
  businessId: string;
  partyType?: "customer" | "vendor";
  partyId?: string;
  direction: "in" | "out";
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  paymentDate: Date;
  linkedDocumentType: "invoice" | "purchase" | "expense" | "indirect_income";
  linkedDocumentId: string;
  referenceNote?: string;
  createdByUserId: string;
};

/** Callable standalone (Phase 7) or inside another write's transaction by passing `session`. */
export async function createPayment(input: CreatePaymentInput, session?: ClientSession) {
  await connectToDatabase();
  const [payment] = await Payment.create([input], { session });
  return payment;
}

class PaymentAlreadyVoidedError extends Error {}
class LinkedInvoiceNotFoundError extends Error {}

export type PaymentWriteResult =
  | { ok: true; payment: InstanceType<typeof Payment> }
  | { ok: false; reason: "not_found" | "already_voided" | "linked_document_not_found" };

/**
 * Money movement is voided, never hard-deleted. Transactional because it must atomically
 * decrement the linked Invoice/Purchase's amountPaidMinor and re-derive its status alongside
 * marking the payment voided — a lost-update race here would silently corrupt the paid amount.
 */
export async function voidPayment(paymentId: string, businessId: string): Promise<PaymentWriteResult> {
  await connectToDatabase();
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: PaymentWriteResult = { ok: false, reason: "not_found" };
    try {
      await session.withTransaction(async () => {
        const payment = await Payment.findOne({ _id: paymentId, businessId }).session(session);
        if (!payment) return; // result stays "not_found"; nothing was written, safe to just commit a no-op
        if (payment.voidedAt) throw new PaymentAlreadyVoidedError();

        payment.voidedAt = new Date();
        await payment.save({ session });

        if (payment.linkedDocumentType === "invoice") {
          const invoice = await Invoice.findOne({ _id: payment.linkedDocumentId, businessId }).session(
            session,
          );
          if (!invoice) throw new LinkedInvoiceNotFoundError();
          invoice.amountPaidMinor = Math.max(0, invoice.amountPaidMinor - payment.amountMinor);
          // A manual "cancelled" status is never overwritten by the automatic pending/
          // partially_paid/paid derivation.
          if ((invoice.status as InvoiceStatus) !== "cancelled") {
            invoice.status = derivePaymentStatus(invoice.grandTotalMinor, invoice.amountPaidMinor);
          }
          await invoice.save({ session });
        } else if (payment.linkedDocumentType === "purchase") {
          const purchase = await Purchase.findOne({ _id: payment.linkedDocumentId, businessId }).session(
            session,
          );
          if (!purchase) throw new LinkedInvoiceNotFoundError();
          purchase.amountPaidMinor = Math.max(0, purchase.amountPaidMinor - payment.amountMinor);
          if ((purchase.status as DocumentStatus) !== "cancelled") {
            purchase.status = derivePaymentStatus(purchase.grandTotalMinor, purchase.amountPaidMinor);
          }
          await purchase.save({ session });
        }

        result = { ok: true, payment };
      });
    } catch (err) {
      if (err instanceof PaymentAlreadyVoidedError) return { ok: false, reason: "already_voided" };
      if (err instanceof LinkedInvoiceNotFoundError) return { ok: false, reason: "linked_document_not_found" };
      throw err;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export type LedgerEntry = {
  date: Date;
  type: "invoice" | "purchase" | "payment" | "debit_note" | "credit_note";
  description: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
  linkedDocumentId: string;
};

/**
 * Merges Invoice/Purchase + Payment + DebitNote/CreditNote into a single running-balance ledger.
 * Fetches the full (typically modest-sized) history for the party and
 * paginates in memory — simpler than a cross-collection paginated aggregation, and fine at the
 * data volumes this app targets; revisit with a real aggregation pipeline if a single party ever
 * accumulates an unusually large history.
 *
 * Debit/credit polarity depends on partyType, since a receivable and a payable move opposite
 * directions for the same kind of event:
 * - Customer ledger (receivable): Invoice increases what they owe us -> debit. A Payment "in"
 *   reduces it -> credit. A Credit Note (sales return) also reduces it -> credit, same polarity
 *   as a payment.
 * - Vendor ledger (payable): Purchase increases what we owe them -> debit, same polarity
 *   treatment as Invoice does for customers. A Payment "out" reduces it -> credit. A Debit Note
 *   (purchase return) also reduces it -> credit, same polarity as a payment.
 */
export async function getPartyLedger(
  partyType: "customer" | "vendor",
  partyId: string,
  businessId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<LedgerEntry>> {
  await connectToDatabase();

  const invoices =
    partyType === "customer"
      ? await Invoice.find({
          businessId,
          customerId: partyId,
          deletedAt: { $exists: false },
          status: { $ne: "draft" },
        })
          .select("docNumber invoiceDate grandTotalMinor")
          .sort({ invoiceDate: 1, _id: 1 })
          .lean()
      : [];

  const purchases =
    partyType === "vendor"
      ? await Purchase.find({
          businessId,
          vendorId: partyId,
          deletedAt: { $exists: false },
          status: { $ne: "draft" },
        })
          .select("docNumber purchaseDate grandTotalMinor")
          .sort({ purchaseDate: 1, _id: 1 })
          .lean()
      : [];

  const debitNotes =
    partyType === "vendor"
      ? await DebitNote.find({
          businessId,
          vendorId: partyId,
          deletedAt: { $exists: false },
          status: "issued",
        })
          .select("docNumber debitNoteDate grandTotalMinor")
          .sort({ debitNoteDate: 1, _id: 1 })
          .lean()
      : [];

  const creditNotes =
    partyType === "customer"
      ? await CreditNote.find({
          businessId,
          customerId: partyId,
          deletedAt: { $exists: false },
          status: "issued",
        })
          .select("docNumber creditNoteDate grandTotalMinor")
          .sort({ creditNoteDate: 1, _id: 1 })
          .lean()
      : [];

  // `_id` is a secondary sort key so same-day entries get a deterministic order (ObjectIds embed
  // a creation timestamp) instead of whatever arbitrary order Mongo returns ties in — the final
  // merge below relies on Array.sort's stability to preserve this ordering across same-date ties.
  const payments = await Payment.find({ businessId, partyType, partyId, voidedAt: { $exists: false } })
    .select("paymentDate amountMinor direction linkedDocumentId")
    .sort({ paymentDate: 1, _id: 1 })
    .lean();

  type RawEntry = Omit<LedgerEntry, "balanceMinor">;
  const rawEntries: RawEntry[] = [
    ...invoices.map((inv) => ({
      date: inv.invoiceDate,
      type: "invoice" as const,
      description: inv.docNumber ? `Invoice ${inv.docNumber}` : "Invoice (draft number pending)",
      debitMinor: inv.grandTotalMinor,
      creditMinor: 0,
      linkedDocumentId: String(inv._id),
    })),
    ...purchases.map((p) => ({
      date: p.purchaseDate,
      type: "purchase" as const,
      description: p.docNumber ? `Purchase ${p.docNumber}` : "Purchase (draft number pending)",
      debitMinor: p.grandTotalMinor,
      creditMinor: 0,
      linkedDocumentId: String(p._id),
    })),
    ...debitNotes.map((dn) => ({
      date: dn.debitNoteDate,
      type: "debit_note" as const,
      description: dn.docNumber ? `Debit Note ${dn.docNumber}` : "Debit Note",
      debitMinor: 0,
      creditMinor: dn.grandTotalMinor,
      linkedDocumentId: String(dn._id),
    })),
    ...creditNotes.map((cn) => ({
      date: cn.creditNoteDate,
      type: "credit_note" as const,
      description: cn.docNumber ? `Credit Note ${cn.docNumber}` : "Credit Note",
      debitMinor: 0,
      creditMinor: cn.grandTotalMinor,
      linkedDocumentId: String(cn._id),
    })),
    ...payments.map((p) => {
      // Customer ledger: the normal flow is direction "in" (customer pays us) -> credit; an "out"
      // (a refund to the customer) -> debit. Vendor ledger is the mirror image: "out" (we pay the
      // vendor) -> credit; "in" (a refund from the vendor) -> debit.
      const reducesBalance = partyType === "customer" ? p.direction === "in" : p.direction === "out";
      return {
        date: p.paymentDate,
        type: "payment" as const,
        description: "Payment",
        debitMinor: reducesBalance ? 0 : p.amountMinor,
        creditMinor: reducesBalance ? p.amountMinor : 0,
        linkedDocumentId: String(p.linkedDocumentId),
      };
    }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  const entries: LedgerEntry[] = rawEntries.map((e) => {
    runningBalance += e.debitMinor - e.creditMinor;
    return { ...e, balanceMinor: runningBalance };
  });

  const { page, pageSize } = clampPageParams(params);
  const start = (page - 1) * pageSize;
  const items = entries.slice(start, start + pageSize);
  return {
    items,
    total: entries.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(entries.length / pageSize)),
  };
}

export type BillWiseEntry = {
  documentId: string;
  docNumber?: string;
  date: Date;
  grandTotalMinor: number;
  amountPaidMinor: number;
  balanceMinor: number;
  status: DocumentStatus;
  payments: { paymentId: string; date: Date; amountMinor: number; mode: PaymentMode }[];
};

export async function getBillWiseForParty(
  partyType: "customer" | "vendor",
  partyId: string,
  businessId: string,
): Promise<BillWiseEntry[]> {
  await connectToDatabase();

  const documents =
    partyType === "customer"
      ? await Invoice.find({
          businessId,
          customerId: partyId,
          deletedAt: { $exists: false },
          status: { $ne: "draft" },
        })
          .sort({ invoiceDate: -1 })
          .lean()
          .then((rows) => rows.map((inv) => ({ ...inv, date: inv.invoiceDate })))
      : await Purchase.find({
          businessId,
          vendorId: partyId,
          deletedAt: { $exists: false },
          status: { $ne: "draft" },
        })
          .sort({ purchaseDate: -1 })
          .lean()
          .then((rows) => rows.map((p) => ({ ...p, date: p.purchaseDate })));
  if (documents.length === 0) return [];

  const documentIds = documents.map((d) => d._id);
  const payments = await Payment.find({
    businessId,
    linkedDocumentType: partyType === "customer" ? "invoice" : "purchase",
    linkedDocumentId: { $in: documentIds },
    voidedAt: { $exists: false },
  })
    .sort({ paymentDate: 1 })
    .lean();

  const paymentsByDocument = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = String(p.linkedDocumentId);
    if (!paymentsByDocument.has(key)) paymentsByDocument.set(key, []);
    paymentsByDocument.get(key)!.push(p);
  }

  return documents.map((doc) => ({
    documentId: String(doc._id),
    docNumber: doc.docNumber,
    date: doc.date,
    grandTotalMinor: doc.grandTotalMinor,
    amountPaidMinor: doc.amountPaidMinor,
    balanceMinor: doc.grandTotalMinor - doc.amountPaidMinor,
    status: doc.status,
    payments: (paymentsByDocument.get(String(doc._id)) ?? []).map((p) => ({
      paymentId: String(p._id),
      date: p.paymentDate,
      amountMinor: p.amountMinor,
      mode: p.mode,
    })),
  }));
}
