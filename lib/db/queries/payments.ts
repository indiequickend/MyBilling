import type { ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Payment } from "@/lib/db/models/Payment";
import { Invoice, type InvoiceStatus } from "@/lib/db/models/Invoice";
import { deriveInvoiceStatus } from "@/lib/invoices/calc";
import { clampPageParams, type PaginatedResult } from "@/lib/db/queryHelpers";
import type { PaymentMode } from "@/lib/constants/payments";

export async function listPaymentsForDocument(
  linkedDocumentType: "invoice",
  linkedDocumentId: string,
  businessId: string,
) {
  await connectToDatabase();
  return Payment.find({ businessId, linkedDocumentType, linkedDocumentId }).sort({ paymentDate: 1 }).lean();
}

export type CreatePaymentInput = {
  businessId: string;
  partyType: "customer" | "vendor";
  partyId: string;
  direction: "in" | "out";
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  paymentDate: Date;
  linkedDocumentType: "invoice";
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
 * decrement the linked Invoice's amountPaidMinor and re-derive its status alongside marking the
 * payment voided — a lost-update race here would silently corrupt the invoice's paid amount.
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
            invoice.status = deriveInvoiceStatus(invoice.grandTotalMinor, invoice.amountPaidMinor);
          }
          await invoice.save({ session });
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
  type: "invoice" | "payment";
  description: string;
  debitMinor: number;
  creditMinor: number;
  balanceMinor: number;
  linkedDocumentId: string;
};

/**
 * Merges Invoice + Payment into a single running-balance ledger. Fetches the full (typically
 * modest-sized) history for the party and paginates in memory — simpler than a cross-collection
 * paginated aggregation, and fine at the data volumes this app targets; revisit with a real
 * aggregation pipeline if a single party ever accumulates an unusually large history.
 */
export async function getPartyLedger(
  partyType: "customer" | "vendor",
  partyId: string,
  businessId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<PaginatedResult<LedgerEntry>> {
  await connectToDatabase();

  // Vendor-side ledger entries come from Purchases, which land in Phase 4.
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
    ...payments.map((p) => ({
      date: p.paymentDate,
      type: "payment" as const,
      description: "Payment",
      debitMinor: p.direction === "out" ? p.amountMinor : 0,
      creditMinor: p.direction === "in" ? p.amountMinor : 0,
      linkedDocumentId: String(p.linkedDocumentId),
    })),
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
  invoiceId: string;
  docNumber?: string;
  invoiceDate: Date;
  grandTotalMinor: number;
  amountPaidMinor: number;
  balanceMinor: number;
  status: InvoiceStatus;
  payments: { paymentId: string; date: Date; amountMinor: number; mode: PaymentMode }[];
};

export async function getBillWiseForParty(
  partyType: "customer" | "vendor",
  partyId: string,
  businessId: string,
): Promise<BillWiseEntry[]> {
  await connectToDatabase();
  if (partyType !== "customer") return []; // Vendor-side (Purchases) lands in Phase 4.

  const invoices = await Invoice.find({
    businessId,
    customerId: partyId,
    deletedAt: { $exists: false },
    status: { $ne: "draft" },
  })
    .sort({ invoiceDate: -1 })
    .lean();
  if (invoices.length === 0) return [];

  const invoiceIds = invoices.map((inv) => inv._id);
  const payments = await Payment.find({
    businessId,
    linkedDocumentType: "invoice",
    linkedDocumentId: { $in: invoiceIds },
    voidedAt: { $exists: false },
  })
    .sort({ paymentDate: 1 })
    .lean();

  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = String(p.linkedDocumentId);
    if (!paymentsByInvoice.has(key)) paymentsByInvoice.set(key, []);
    paymentsByInvoice.get(key)!.push(p);
  }

  return invoices.map((inv) => ({
    invoiceId: String(inv._id),
    docNumber: inv.docNumber,
    invoiceDate: inv.invoiceDate,
    grandTotalMinor: inv.grandTotalMinor,
    amountPaidMinor: inv.amountPaidMinor,
    balanceMinor: inv.grandTotalMinor - inv.amountPaidMinor,
    status: inv.status,
    payments: (paymentsByInvoice.get(String(inv._id)) ?? []).map((p) => ({
      paymentId: String(p._id),
      date: p.paymentDate,
      amountMinor: p.amountMinor,
      mode: p.mode,
    })),
  }));
}
