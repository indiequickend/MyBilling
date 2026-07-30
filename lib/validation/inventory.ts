import { z } from "zod";
import { objectId, optionalTrimmed } from "@/lib/validation/shared";

const optionalObjectId = objectId.optional().or(z.literal("").transform(() => undefined));

/** Splits a newline/comma-separated textarea into a trimmed, non-empty list of serial numbers. */
export function parseSerialNumbersText(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Batch/serial requirements depend on the target product's stockTracking config, which this
// schema can't see — that cross-check happens in recordManualStockMovement (the query layer),
// not here. This schema only shapes the raw form input.
export const stockAdjustmentSchema = z.object({
  productId: objectId,
  variantId: optionalObjectId,
  warehouseId: objectId,
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  batchId: optionalObjectId,
  newBatchNumber: optionalTrimmed(100),
  newBatchExpiryDate: optionalTrimmed(30),
  serialNumbersText: optionalTrimmed(5000),
  note: optionalTrimmed(500),
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const stockLedgerListQuerySchema = z.object({
  productId: optionalObjectId,
  warehouseId: optionalObjectId,
  dateFrom: optionalTrimmed(30),
  dateTo: optionalTrimmed(30),
  page: z.coerce.number().int().min(1).default(1),
});
