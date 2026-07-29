"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, type MembershipContext } from "@/lib/rbac/can";
import { productSchema } from "@/lib/validation/products";
import { parseIndexedRows } from "@/lib/validation/shared";
import {
  createProduct,
  updateProduct,
  findProductById,
  softDeleteProduct,
  restoreProduct,
} from "@/lib/db/queries/products";
import { uploadFile } from "@/lib/storage/cloudinary";
import { detectImageMimeType } from "@/lib/storage/imageMime";
import type { ActionKey } from "@/lib/rbac/permissions";

export type ProductFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function requireProductsPermission(action: ActionKey): Promise<{
  activeBusinessId: string;
  membership: MembershipContext;
}> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "products", action);
  return { activeBusinessId: context.activeBusinessId, membership: context.membership };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

function productErrorMessage(
  reason: "invalid_category" | "invalid_group" | "invalid_price_lists" | "not_found",
): string {
  switch (reason) {
    case "invalid_category":
      return "Selected category belongs to a different business.";
    case "invalid_group":
      return "Selected group belongs to a different business.";
    case "invalid_price_lists":
      return "One or more selected price lists are invalid.";
    case "not_found":
      return "Product not found.";
  }
}

function productInputFromFormData(formData: FormData) {
  const variants = parseIndexedRows(formData, "variant").map((row) => ({
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    sellingPriceOverrideMinor: row.sellingPriceOverrideMinor,
    purchasePriceOverrideMinor: row.purchasePriceOverrideMinor,
  }));
  const priceOverrides = parseIndexedRows(formData, "priceOverride").map((row) => ({
    priceListId: row.priceListId,
    priceMinor: row.priceMinor,
  }));

  return {
    name: formData.get("name"),
    type: formData.get("type"),
    hsnOrSac: formData.get("hsnOrSac"),
    unit: formData.get("unit"),
    categoryId: formData.get("categoryId"),
    groupId: formData.get("groupId"),
    purchasePriceMinor: formData.get("purchasePriceMinor"),
    sellingPriceMinor: formData.get("sellingPriceMinor"),
    priceIsTaxInclusive: formData.get("priceIsTaxInclusive") != null,
    taxRatePercent: formData.get("taxRatePercent"),
    barcode: formData.get("barcode"),
    variants,
    priceOverrides,
  };
}

async function uploadProductImages(formData: FormData, businessId: string) {
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const images: Array<{ publicId: string; url: string }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageMimeType(buffer);
    if (!mimeType) continue;
    const uploaded = await uploadFile(buffer, mimeType, {
      folder: `businesses/${businessId}/products`,
    });
    images.push({ publicId: uploaded.publicId, url: uploaded.url });
  }
  return images;
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const context = await requireProductsPermission("create");

  const parsed = productSchema.safeParse(productInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const images = await uploadProductImages(formData, context.activeBusinessId);

  const result = await createProduct({
    businessId: context.activeBusinessId,
    ...parsed.data,
    images,
  });
  if (!result.ok) {
    return { error: productErrorMessage(result.reason) };
  }

  revalidatePath("/products");
  redirect(`/products/${String(result.product._id)}`);
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const context = await requireProductsPermission("edit");
  const productId = String(formData.get("productId") ?? "");

  const parsed = productSchema.safeParse(productInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const newImages = await uploadProductImages(formData, context.activeBusinessId);
  let images: Array<{ publicId: string; url: string }> | undefined;
  if (newImages.length > 0) {
    const current = await findProductById(productId, context.activeBusinessId);
    images = [...(current?.images ?? []), ...newImages];
  }

  const result = await updateProduct(productId, context.activeBusinessId, {
    ...parsed.data,
    ...(images ? { images } : {}),
  });
  if (!result.ok) {
    return { error: productErrorMessage(result.reason) };
  }

  revalidatePath("/products");
  redirect(`/products/${productId}`);
}

export async function softDeleteProductAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission("delete");
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  await softDeleteProduct(productId, context.activeBusinessId);
  revalidatePath("/products");
}

export async function restoreProductAction(formData: FormData): Promise<void> {
  const context = await requireProductsPermission("edit");
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  await restoreProduct(productId, context.activeBusinessId);
  revalidatePath("/products");
}
