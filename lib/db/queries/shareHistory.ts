import { connectToDatabase } from "@/lib/db/connect";
import { PaymentLink } from "@/lib/db/models/PaymentLink";
import { Invoice } from "@/lib/db/models/Invoice";
import { paginate, type PaginatedResult } from "@/lib/db/queryHelpers";

export type ShareHistoryEntry = {
  paymentLinkId: string;
  createdAt: Date;
  amountMinor: number;
  linkedInvoiceId?: string;
  linkedInvoiceNumber?: string;
  note?: string;
  expiresAt: Date;
  status: "active" | "expired" | "revoked";
  createdByUserId: string;
};

export type ShareHistoryParams = { dateFrom?: Date; dateTo?: Date; page?: number; pageSize?: number };

/**
 * "Share History" scoped to Payment Link creation events — the only document-sharing mechanism
 * this app has built so far (project_spec.md's broader Share History concept extends to Customer
 * Portal/Online Store links once Phase 11 lands; this reads PaymentLink only, no new writes).
 */
export async function listShareHistory(
  businessId: string,
  params: ShareHistoryParams = {},
): Promise<PaginatedResult<ShareHistoryEntry>> {
  await connectToDatabase();
  const filter: Record<string, unknown> = { businessId };
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.createdAt = range;
  }
  const result = await paginate(PaymentLink, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { createdAt: -1 },
  });

  const invoiceIds = [
    ...new Set(result.items.filter((l) => l.linkedInvoiceId).map((l) => String(l.linkedInvoiceId))),
  ];
  const invoices = invoiceIds.length
    ? await Invoice.find({ _id: { $in: invoiceIds } }).select("docNumber").lean()
    : [];
  const invoiceNumber = new Map(invoices.map((i) => [String(i._id), i.docNumber as string | undefined]));

  const now = new Date();
  const items: ShareHistoryEntry[] = result.items.map((l) => ({
    paymentLinkId: String(l._id),
    createdAt: l.createdAt,
    amountMinor: l.amountMinor,
    linkedInvoiceId: l.linkedInvoiceId ? String(l.linkedInvoiceId) : undefined,
    linkedInvoiceNumber: l.linkedInvoiceId ? invoiceNumber.get(String(l.linkedInvoiceId)) : undefined,
    note: l.note ?? undefined,
    expiresAt: l.expiresAt,
    status: l.revokedAt ? "revoked" : l.expiresAt < now ? "expired" : "active",
    createdByUserId: String(l.createdByUserId),
  }));

  return { ...result, items };
}
