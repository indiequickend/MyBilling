import mongoose, { type PipelineStage } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import type { DateRangeParams } from "@/lib/db/queries/reports";

export type ItemReportRow = {
  productId?: string;
  description: string;
  hsnOrSac?: string;
  quantity: number;
  taxableAmountMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export type ItemReportParams = DateRangeParams & { productId?: string };

/** Shared by getItemSalesReport/getItemPurchaseReport — $unwind + $group over line items, grouped
 * by product (falling back to description for non-catalog line items, which have no productId). */
async function getItemReport(
  model: typeof Invoice | typeof Purchase,
  dateField: string,
  businessId: string,
  params: ItemReportParams,
): Promise<ItemReportRow[]> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    status: { $ne: "draft" },
  };
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    match[dateField] = range;
  }

  const pipeline: PipelineStage[] = [{ $match: match }, { $unwind: "$lineItems" }];
  if (params.productId) {
    pipeline.push({ $match: { "lineItems.productId": new mongoose.Types.ObjectId(params.productId) } });
  }
  pipeline.push(
    {
      $group: {
        _id: { $ifNull: ["$lineItems.productId", "$lineItems.description"] },
        productId: { $first: "$lineItems.productId" },
        description: { $first: "$lineItems.description" },
        hsnOrSac: { $first: "$lineItems.hsnOrSac" },
        quantity: { $sum: "$lineItems.quantity" },
        taxableAmountMinor: { $sum: "$lineItems.taxableAmountMinor" },
        taxMinor: { $sum: { $add: ["$lineItems.cgstMinor", "$lineItems.sgstMinor", "$lineItems.igstMinor"] } },
        totalMinor: { $sum: "$lineItems.totalMinor" },
      },
    },
    { $sort: { totalMinor: -1 } },
  );

  const rows = await model.aggregate(pipeline);
  return rows.map((r) => ({
    productId: r.productId ? String(r.productId) : undefined,
    description: r.description as string,
    hsnOrSac: r.hsnOrSac as string | undefined,
    quantity: r.quantity as number,
    taxableAmountMinor: r.taxableAmountMinor as number,
    taxMinor: r.taxMinor as number,
    totalMinor: r.totalMinor as number,
  }));
}

export function getItemSalesReport(businessId: string, params: ItemReportParams = {}): Promise<ItemReportRow[]> {
  return getItemReport(Invoice, "invoiceDate", businessId, params);
}

export function getItemPurchaseReport(businessId: string, params: ItemReportParams = {}): Promise<ItemReportRow[]> {
  return getItemReport(Purchase, "purchaseDate", businessId, params);
}
