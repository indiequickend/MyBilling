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
  hsnOrSacOverride?: string;
};

export type ProductPriceOverrideInput = { priceListId: string; priceMinor: number };

export type ProductInput = {
  businessId: string;
  name: string;
  type: "product" | "service";
  hsnOrSac?: string;
  unit?: string;
  categoryId?: string;
  groupId?: string;
  purchasePriceMinor?: number;
  sellingPriceMinor: number;
  priceIsTaxInclusive: boolean;
  taxRatePercent: number;
  barcode?: string;
  images?: Array<{ publicId: string; url: string }>;
  variants?: ProductVariantInput[];
  priceOverrides?: ProductPriceOverrideInput[];
};

export type ProductWriteResult =
  | { ok: true; product: InstanceType<typeof Product> }
  | { ok: false; reason: "invalid_category" }
  | { ok: false; reason: "invalid_group" }
  | { ok: false; reason: "invalid_price_lists" }
  | { ok: false; reason: "not_found" };

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

  const product = await Product.create(input);
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

  const product = await Product.findOneAndUpdate(
    { _id: productId, businessId },
    { $set: updates },
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
