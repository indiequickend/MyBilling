import { connectToDatabase } from "@/lib/db/connect";
import { Product, type ProductDoc } from "@/lib/db/models/Product";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import { isOwnedProductCategory } from "@/lib/db/queries/productCategories";
import { isOwnedProductGroup } from "@/lib/db/queries/productGroups";
import { findOwnedPriceListIds } from "@/lib/db/queries/priceLists";

export type ProductListParams = {
  search?: string;
  categoryId?: string;
  groupId?: string;
  type?: "product" | "service";
  tab?: "active" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listProducts(businessId: string, params: ProductListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ name: pattern }, { barcode: pattern }, { hsnOrSac: pattern }];
  }
  if (params.categoryId) filter.categoryId = params.categoryId;
  if (params.groupId) filter.groupId = params.groupId;
  if (params.type) filter.type = params.type;
  return paginate(Product, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { name: 1 },
  });
}

export async function findProductById(productId: string, businessId: string) {
  await connectToDatabase();
  return Product.findOne({ _id: productId, businessId });
}

/** Unpaginated variant of listProducts for bulk export — "everything matching this search/tab
 * filter," not one page of it. */
export async function listAllProducts(
  businessId: string,
  params: { search?: string; tab?: "active" | "deleted" } = {},
) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ name: pattern }, { barcode: pattern }, { hsnOrSac: pattern }];
  }
  return Product.find(filter).sort({ name: 1 }).lean();
}

/** Thin, active-only wrapper around listProducts for the invoice line-item autocomplete. */
export async function searchProductsForInvoice(businessId: string, query: string, limit = 20) {
  await connectToDatabase();
  const filter: Record<string, unknown> = { businessId, deletedAt: { $exists: false } };
  if (query.trim()) {
    const pattern = new RegExp(escapeRegex(query.trim()), "i");
    filter.$or = [
      { name: pattern },
      { barcode: pattern },
      { hsnOrSac: pattern },
      { "variants.name": pattern },
      { "variants.sku": pattern },
      { "variants.barcode": pattern },
    ];
  }
  return Product.find(filter).sort({ name: 1 }).limit(limit).lean();
}

/** Batch lookup for hydrating a document's existing line items with stock-tracking metadata
 * (warehouse/batch/serial pickers) when loading an edit form — e.g. Invoice/Purchase edit pages. */
export async function findProductsByIds(productIds: string[], businessId: string) {
  await connectToDatabase();
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return [];
  return Product.find({ _id: { $in: unique }, businessId }).lean();
}

/** Ownership check: is `productId` a non-deleted product belonging to `businessId`? */
export async function isOwnedProduct(productId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await Product.countDocuments({
    _id: productId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export type ProductVariantInput = {
  name: string;
  sku?: string;
  barcode?: string;
  sellingPriceOverrideMinor?: number;
  purchasePriceOverrideMinor?: number;
};

export type ProductPriceOverrideInput = { priceListId: string; priceMinor: number };

export type ProductBatchInput = { batchNumber: string; expiryDate?: Date };

export type ProductStockTrackingInput = {
  enabled: boolean;
  batchTracked: boolean;
  serialTracked: boolean;
  reorderLevel?: number;
};

export type ProductInput = {
  businessId: string;
  name: string;
  type: "product" | "service";
  hsnOrSac?: string;
  unit?: string;
  categoryId?: string;
  groupId?: string;
  purchasePriceMinor?: number;
  sellingPriceMinor?: number;
  priceIsTaxInclusive: boolean;
  taxRatePercent: number;
  barcode?: string;
  images?: Array<{ publicId: string; url: string }>;
  variants?: ProductVariantInput[];
  priceOverrides?: ProductPriceOverrideInput[];
  stockTracking?: ProductStockTrackingInput;
  batches?: ProductBatchInput[];
};

export type ProductWriteResult =
  | { ok: true; product: InstanceType<typeof Product> }
  | { ok: false; reason: "invalid_category" }
  | { ok: false; reason: "invalid_group" }
  | { ok: false; reason: "invalid_price_lists" }
  | { ok: false; reason: "invalid_stock_tracking" }
  | { ok: false; reason: "not_found" };

/**
 * A product is either batch-tracked or serial-tracked, never both, and service items never track
 * stock at all — enforced here (not in the schema) since it depends on the sibling `type` field,
 * which a schema-level rule can't see during a partial `$set` update.
 */
function normalizeStockTracking(
  type: "product" | "service",
  stockTracking?: ProductStockTrackingInput,
  batches?: ProductBatchInput[],
): { ok: true; stockTracking?: ProductStockTrackingInput; batches?: ProductBatchInput[] } | { ok: false } {
  if (type === "service") {
    return { ok: true, stockTracking: { enabled: false, batchTracked: false, serialTracked: false }, batches: [] };
  }
  if (stockTracking?.batchTracked && stockTracking?.serialTracked) {
    return { ok: false };
  }
  return {
    ok: true,
    stockTracking,
    // Only force-clear batches when stockTracking was actually part of this write and says
    // batch-tracking is off; if stockTracking wasn't touched at all, leave batches as given.
    batches: stockTracking && !stockTracking.batchTracked ? [] : batches,
  };
}

/**
 * Verifies categoryId/groupId/priceOverrides[].priceListId all belong to this
 * business before a write — a second, easy-to-miss leak vector distinct from
 * plain businessId-scoped reads.
 */
async function assertOwnedReferences(input: {
  businessId: string;
  categoryId?: string;
  groupId?: string;
  priceOverrides?: ProductPriceOverrideInput[];
}): Promise<
  { ok: true } | { ok: false; reason: "invalid_category" | "invalid_group" | "invalid_price_lists" }
> {
  if (input.categoryId && !(await isOwnedProductCategory(input.categoryId, input.businessId))) {
    return { ok: false, reason: "invalid_category" };
  }
  if (input.groupId && !(await isOwnedProductGroup(input.groupId, input.businessId))) {
    return { ok: false, reason: "invalid_group" };
  }
  const priceListIds = input.priceOverrides?.map((p) => p.priceListId) ?? [];
  if (priceListIds.length > 0) {
    const uniqueIds = [...new Set(priceListIds)];
    if (uniqueIds.length !== priceListIds.length) {
      return { ok: false, reason: "invalid_price_lists" };
    }
    const owned = await findOwnedPriceListIds(uniqueIds, input.businessId);
    if (owned.length !== uniqueIds.length) {
      return { ok: false, reason: "invalid_price_lists" };
    }
  }
  return { ok: true };
}

export async function createProduct(input: ProductInput): Promise<ProductWriteResult> {
  await connectToDatabase();
  const check = await assertOwnedReferences(input);
  if (!check.ok) return check;

  const normalized = normalizeStockTracking(input.type, input.stockTracking, input.batches);
  if (!normalized.ok) return { ok: false, reason: "invalid_stock_tracking" };

  const product = await Product.create({
    ...input,
    stockTracking: normalized.stockTracking,
    batches: normalized.batches,
  });
  return { ok: true, product };
}

export async function updateProduct(
  productId: string,
  businessId: string,
  updates: Partial<Omit<ProductInput, "businessId">>,
): Promise<ProductWriteResult> {
  await connectToDatabase();
  const check = await assertOwnedReferences({ businessId, ...updates });
  if (!check.ok) return check;

  let normalizedUpdates: Partial<Omit<ProductInput, "businessId">> = updates;
  if (updates.type || updates.stockTracking || updates.batches) {
    const existing = await Product.findOne({ _id: productId, businessId }).lean();
    if (!existing) return { ok: false, reason: "not_found" };
    const type = updates.type ?? existing.type;
    const normalized = normalizeStockTracking(type, updates.stockTracking, updates.batches);
    if (!normalized.ok) return { ok: false, reason: "invalid_stock_tracking" };
    normalizedUpdates = { ...updates, stockTracking: normalized.stockTracking, batches: normalized.batches };
  }

  const product = await Product.findOneAndUpdate(
    { _id: productId, businessId },
    { $set: normalizedUpdates },
    { returnDocument: "after" },
  );
  if (!product) return { ok: false, reason: "not_found" };
  return { ok: true, product };
}

export async function softDeleteProduct(productId: string, businessId: string) {
  await connectToDatabase();
  return Product.findOneAndUpdate(
    { _id: productId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreProduct(productId: string, businessId: string) {
  await connectToDatabase();
  return Product.findOneAndUpdate(
    { _id: productId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type { ProductDoc };
