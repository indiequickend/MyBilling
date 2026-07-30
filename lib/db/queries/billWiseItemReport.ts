import { connectToDatabase } from "@/lib/db/connect";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import type { DateRangeParams } from "@/lib/db/queries/reports";

export type BillWiseItemRow = {
  documentId: string;
  docNumber?: string;
  date: Date;
  partyName: string;
  description: string;
  hsnOrSac?: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
};

export type BillWiseItemReportParams = DateRangeParams & { partyId?: string };

/**
 * Per-document, per-line breakdown ("Bill-wise Item Report") — a flatter shape than
 * getBillWiseForParty (which totals per document, not per line). Flattens in application code
 * rather than an aggregation pipeline since row counts for a date-ranged report are modest.
 */
export async function getBillWiseItemReport(
  businessId: string,
  docType: "invoice" | "purchase",
  params: BillWiseItemReportParams = {},
): Promise<BillWiseItemRow[]> {
  await connectToDatabase();
  const dateField = docType === "invoice" ? "invoiceDate" : "purchaseDate";
  const filter: Record<string, unknown> = { businessId, deletedAt: { $exists: false }, status: { $ne: "draft" } };
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter[dateField] = range;
  }
  if (params.partyId) {
    filter[docType === "invoice" ? "customerId" : "vendorId"] = params.partyId;
  }

  if (docType === "invoice") {
    const invoices = await Invoice.find(filter)
      .select("docNumber invoiceDate customerSnapshot lineItems")
      .sort({ invoiceDate: -1 })
      .lean();
    return invoices.flatMap((inv) =>
      inv.lineItems.map((li) => ({
        documentId: String(inv._id),
        docNumber: inv.docNumber,
        date: inv.invoiceDate,
        partyName: inv.customerSnapshot?.displayName ?? "—",
        description: li.description,
        hsnOrSac: li.hsnOrSac ?? undefined,
        quantity: li.quantity,
        unitPriceMinor: li.unitPriceMinor,
        totalMinor: li.totalMinor,
      })),
    );
  }

  const purchases = await Purchase.find(filter)
    .select("docNumber purchaseDate vendorSnapshot lineItems")
    .sort({ purchaseDate: -1 })
    .lean();
  return purchases.flatMap((p) =>
    p.lineItems.map((li) => ({
      documentId: String(p._id),
      docNumber: p.docNumber,
      date: p.purchaseDate,
      partyName: p.vendorSnapshot?.displayName ?? "—",
      description: li.description,
      hsnOrSac: li.hsnOrSac ?? undefined,
      quantity: li.quantity,
      unitPriceMinor: li.unitPriceMinor,
      totalMinor: li.totalMinor,
    })),
  );
}
