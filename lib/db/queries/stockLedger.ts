import mongoose, { type ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { StockLedgerEntry, type StockLedgerReason } from "@/lib/db/models/StockLedgerEntry";
import { Product } from "@/lib/db/models/Product";
import { isOwnedWarehouse } from "@/lib/db/queries/warehouses";
import { paginate } from "@/lib/db/queryHelpers";
import type { DocumentType } from "@/lib/constants/documentTypes";

export type StockScope = {
  businessId: string;
  productId: string;
  variantId?: string;
  batchId?: string;
  warehouseId: string;
};

function scopeFilter(scope: StockScope) {
  return {
    businessId: scope.businessId,
    productId: scope.productId,
    variantId: scope.variantId ?? { $exists: false },
    batchId: scope.batchId ?? { $exists: false },
    warehouseId: scope.warehouseId,
  };
}

/** Current on-hand quantity for an exact scope — the latest ledger entry's snapshot, or 0. */
export async function getCurrentBalance(scope: StockScope, session?: ClientSession): Promise<number> {
  await connectToDatabase();
  const latest = await StockLedgerEntry.findOne(scopeFilter(scope))
    .sort({ createdAt: -1, _id: -1 })
    .session(session ?? null)
    .lean<{ balanceAfter: number } | null>();
  return latest?.balanceAfter ?? 0;
}

export type WriteStockLedgerEntryInput = StockScope & {
  direction: "in" | "out";
  quantity: number;
  serialNumbers?: string[];
  reason: StockLedgerReason;
  note?: string;
  refDocumentType?: DocumentType;
  refDocumentId?: string;
  refDocumentNumber?: string;
  createdByUserId: string;
};

export class InsufficientStockError extends Error {
  constructor() {
    super("Stock Out would take the balance below zero");
    this.name = "InsufficientStockError";
  }
}

/**
 * Writes one ledger entry inside the caller's transaction `session`, computing `balanceAfter`
 * from the current balance for this exact scope. Throws (aborting the transaction) rather than
 * ever writing a negative balance — no negative stock, no exceptions for "just this once".
 */
export async function writeStockLedgerEntry(
  session: ClientSession,
  input: WriteStockLedgerEntryInput,
): Promise<InstanceType<typeof StockLedgerEntry>> {
  await connectToDatabase();
  const current = await getCurrentBalance(input, session);
  const signed = input.direction === "in" ? input.quantity : -input.quantity;
  const balanceAfter = current + signed;
  if (balanceAfter < 0) throw new InsufficientStockError();

  const [entry] = await StockLedgerEntry.create(
    [
      {
        businessId: input.businessId,
        productId: input.productId,
        variantId: input.variantId,
        batchId: input.batchId,
        warehouseId: input.warehouseId,
        direction: input.direction,
        quantity: input.quantity,
        balanceAfter,
        serialNumbers: input.serialNumbers,
        reason: input.reason,
        note: input.note,
        refDocumentType: input.refDocumentType,
        refDocumentId: input.refDocumentId,
        refDocumentNumber: input.refDocumentNumber,
        createdByUserId: input.createdByUserId,
      },
    ],
    { session },
  );
  return entry;
}

export type ManualStockMovementInput = {
  businessId: string;
  productId: string;
  variantId?: string;
  warehouseId: string;
  direction: "in" | "out";
  quantity: number;
  batchId?: string;
  newBatch?: { batchNumber: string; expiryDate?: Date };
  serialNumbers?: string[];
  note?: string;
  createdByUserId: string;
};

export type ManualStockMovementResult =
  | { ok: true; entry: InstanceType<typeof StockLedgerEntry> }
  | {
      ok: false;
      reason:
        | "product_not_found"
        | "invalid_warehouse"
        | "not_stock_tracked"
        | "batch_required"
        | "invalid_batch"
        | "serials_required"
        | "serial_count_mismatch"
        | "insufficient_stock";
    };

/** The Stock In/Out entry point — validates against the product's stockTracking config, then
 * writes a single ledger entry inside its own transaction. */
export async function recordManualStockMovement(
  input: ManualStockMovementInput,
): Promise<ManualStockMovementResult> {
  await connectToDatabase();

  const product = await Product.findOne({
    _id: input.productId,
    businessId: input.businessId,
    deletedAt: { $exists: false },
  });
  if (!product) return { ok: false, reason: "product_not_found" };
  if (!product.stockTracking?.enabled) return { ok: false, reason: "not_stock_tracked" };
  if (!(await isOwnedWarehouse(input.warehouseId, input.businessId))) {
    return { ok: false, reason: "invalid_warehouse" };
  }

  let batchId: string | undefined;
  if (product.stockTracking.batchTracked) {
    if (input.batchId) {
      const match = product.batches.find(
        (b) => String(b._id) === input.batchId && !b.deletedAt,
      );
      if (!match) return { ok: false, reason: "invalid_batch" };
      batchId = input.batchId;
    } else if (input.newBatch?.batchNumber.trim()) {
      product.batches.push({
        batchNumber: input.newBatch.batchNumber.trim(),
        expiryDate: input.newBatch.expiryDate,
      } as (typeof product.batches)[number]);
      await product.save();
      batchId = String(product.batches[product.batches.length - 1]._id);
    } else {
      return { ok: false, reason: "batch_required" };
    }
  }

  let serialNumbers: string[] | undefined;
  if (product.stockTracking.serialTracked) {
    if (!input.serialNumbers?.length) return { ok: false, reason: "serials_required" };
    if (input.serialNumbers.length !== input.quantity) return { ok: false, reason: "serial_count_mismatch" };
    serialNumbers = input.serialNumbers;
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: ManualStockMovementResult;
    await session.withTransaction(async () => {
      try {
        const entry = await writeStockLedgerEntry(session, {
          businessId: input.businessId,
          productId: input.productId,
          variantId: input.variantId,
          batchId,
          warehouseId: input.warehouseId,
          direction: input.direction,
          quantity: input.quantity,
          serialNumbers,
          reason: input.direction === "in" ? "manual_in" : "manual_out",
          note: input.note,
          createdByUserId: input.createdByUserId,
        });
        result = { ok: true, entry };
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          result = { ok: false, reason: "insufficient_stock" };
          return;
        }
        throw err;
      }
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export type DocumentStockLineItem = {
  productId?: mongoose.Types.ObjectId | string;
  variantId?: mongoose.Types.ObjectId | string;
  warehouseId?: mongoose.Types.ObjectId | string;
  batchId?: mongoose.Types.ObjectId | string;
  serialNumbers?: string[];
  quantity: number;
};

/**
 * Shared by createInvoice/createPurchase/createCreditNote/createDebitNote (and their cancel-
 * reversal paths): for every line item whose product is a stock-tracked `type: "product"`, writes
 * one ledger entry inside the caller's transaction `session`. Line items without a productId, or
 * whose product isn't stock-tracked (including all services), are silently skipped — never an
 * error, since most documents mix trackable and non-trackable lines freely.
 */
export async function writeDocumentStockMovements(
  session: ClientSession,
  params: {
    businessId: string;
    lineItems: DocumentStockLineItem[];
    direction: "in" | "out";
    reason: StockLedgerReason;
    refDocumentType: DocumentType;
    refDocumentId: string;
    refDocumentNumber?: string;
    createdByUserId: string;
  },
): Promise<void> {
  for (const li of params.lineItems) {
    if (!li.productId || !li.warehouseId) continue;
    const product = await Product.findOne({ _id: li.productId, businessId: params.businessId })
      .session(session)
      .lean<{ type: string; stockTracking?: { enabled: boolean } } | null>();
    if (!product || product.type !== "product" || !product.stockTracking?.enabled) continue;

    await writeStockLedgerEntry(session, {
      businessId: params.businessId,
      productId: String(li.productId),
      variantId: li.variantId ? String(li.variantId) : undefined,
      batchId: li.batchId ? String(li.batchId) : undefined,
      warehouseId: String(li.warehouseId),
      direction: params.direction,
      quantity: li.quantity,
      serialNumbers: li.serialNumbers,
      reason: params.reason,
      refDocumentType: params.refDocumentType,
      refDocumentId: params.refDocumentId,
      refDocumentNumber: params.refDocumentNumber,
      createdByUserId: params.createdByUserId,
    });
  }
}

export type StockLedgerListParams = {
  productId?: string;
  warehouseId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

export async function listStockLedger(businessId: string, params: StockLedgerListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = { businessId };
  if (params.productId) filter.productId = params.productId;
  if (params.warehouseId) filter.warehouseId = params.warehouseId;
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.createdAt = range;
  }
  return paginate(StockLedgerEntry, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { createdAt: -1 },
  });
}

export type InventoryDashboardTiles = {
  lowStockCount: number;
  positiveStockCount: number;
  stockValueAtSaleMinor: number;
  stockValueAtPurchaseMinor: number;
};

/**
 * Computed synchronously per request (no background job, no cached balance collection — see
 * CLAUDE.md's "no background job infrastructure" rule): one aggregation finds each scope's latest
 * balance, sums per product across warehouses/batches, then joins against Product for pricing and
 * the reorder threshold.
 */
export async function getInventoryDashboardTiles(businessId: string): Promise<InventoryDashboardTiles> {
  await connectToDatabase();
  const businessObjectId = new mongoose.Types.ObjectId(businessId);

  const rows = await StockLedgerEntry.aggregate([
    { $match: { businessId: businessObjectId } },
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: { productId: "$productId", variantId: "$variantId", batchId: "$batchId", warehouseId: "$warehouseId" },
        balanceAfter: { $first: "$balanceAfter" },
      },
    },
    { $group: { _id: "$_id.productId", totalBalance: { $sum: "$balanceAfter" } } },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $project: {
        totalBalance: 1,
        sellingPriceMinor: { $ifNull: ["$product.sellingPriceMinor", 0] },
        purchasePriceMinor: { $ifNull: ["$product.purchasePriceMinor", 0] },
        reorderLevel: "$product.stockTracking.reorderLevel",
      },
    },
  ]);

  let lowStockCount = 0;
  let positiveStockCount = 0;
  let stockValueAtSaleMinor = 0;
  let stockValueAtPurchaseMinor = 0;
  for (const row of rows) {
    if (row.totalBalance > 0) positiveStockCount += 1;
    if (typeof row.reorderLevel === "number" && row.totalBalance <= row.reorderLevel) {
      lowStockCount += 1;
    }
    stockValueAtSaleMinor += row.totalBalance * row.sellingPriceMinor;
    stockValueAtPurchaseMinor += row.totalBalance * row.purchasePriceMinor;
  }
  return { lowStockCount, positiveStockCount, stockValueAtSaleMinor, stockValueAtPurchaseMinor };
}
