import type { Types } from "mongoose";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";
import type { ProductDoc } from "@/lib/db/models/Product";
import type { WithId } from "@/lib/db/queryHelpers";

/**
 * Hydrates a document's already-persisted line items (Invoice/Purchase edit forms) with the
 * client-only stock-tracking display metadata LineItemsEditor needs to render the warehouse/
 * batch/serial pickers correctly — the persisted warehouseId/batchId/serialNumbers travel with
 * the line item itself, but whether to *show* those pickers depends on the product's current
 * stockTracking config, which has to be loaded separately.
 */
export function hydrateLineItemsStockInfo<
  T extends { productId?: Types.ObjectId | null; warehouseId?: Types.ObjectId | null; batchId?: Types.ObjectId | null; serialNumbers?: string[] | null },
>(rows: LineItemRow[], sourceLineItems: T[], products: WithId<ProductDoc>[]): LineItemRow[] {
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  return rows.map((row, i) => {
    const source = sourceLineItems[i];
    const product = source?.productId ? productMap.get(String(source.productId)) : undefined;
    if (!product?.stockTracking?.enabled) return row;
    return {
      ...row,
      warehouseId: source?.warehouseId ? String(source.warehouseId) : "",
      batchId: source?.batchId ? String(source.batchId) : "",
      serialNumbersText: source?.serialNumbers?.join("\n") ?? "",
      stockTrackingEnabled: true,
      batchTracked: product.stockTracking.batchTracked,
      serialTracked: product.stockTracking.serialTracked,
      availableBatches: (product.batches ?? [])
        .filter((b) => !b.deletedAt)
        .map((b) => ({
          id: String(b._id),
          label: b.expiryDate
            ? `${b.batchNumber} (exp. ${new Date(b.expiryDate).toLocaleDateString()})`
            : b.batchNumber,
        })),
    };
  });
}
