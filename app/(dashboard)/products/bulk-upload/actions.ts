"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  parseCsvRows,
  runBulkImport,
  BULK_IMPORT_MAX_FILE_BYTES,
} from "@/lib/importExport/bulkImport";
import { productRowSchema, type ProductRowInput } from "@/lib/validation/products";
import { findOrCreateProductCategoryByName } from "@/lib/db/queries/productCategories";
import { findOrCreateProductGroupByName } from "@/lib/db/queries/productGroups";
import { createProduct, type ProductWriteResult } from "@/lib/db/queries/products";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["name", "sellingPriceMinor", "taxRatePercent"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function productErrorMessage(reason: Exclude<ProductWriteResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "invalid_category":
      return "Category belongs to a different business.";
    case "invalid_group":
      return "Group belongs to a different business.";
    case "invalid_price_lists":
      return "One or more price lists are invalid.";
    case "invalid_stock_tracking":
      return "A product can be batch-tracked or serial-tracked, not both.";
    case "not_found":
      return "Product not found.";
  }
}

type ResolvedProductRow = ProductRowInput & { categoryId?: string; groupId?: string };

export async function bulkUploadProductsAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "products", "create");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > BULK_IMPORT_MAX_FILE_BYTES) {
    return { error: "File is too large — the limit is 5 MB." };
  }

  const text = await file.text();
  const parsedCsv = parseCsvRows(text, REQUIRED_COLUMNS);
  if (!parsedCsv.ok) return { error: parsedCsv.error };

  const result = await runBulkImport<ProductRowInput, ResolvedProductRow>({
    rows: parsedCsv.rows,
    rowSchema: productRowSchema,
    resolveRow: async (data) => {
      const [category, group] = await Promise.all([
        data.categoryName
          ? findOrCreateProductCategoryByName(context.activeBusinessId, data.categoryName)
          : null,
        data.groupName ? findOrCreateProductGroupByName(context.activeBusinessId, data.groupName) : null,
      ]);
      return {
        ok: true,
        resolved: {
          ...data,
          categoryId: category ? String(category._id) : undefined,
          groupId: group ? String(group._id) : undefined,
        },
      };
    },
    insertRow: async (resolved) => {
      const created = await createProduct({
        businessId: context.activeBusinessId,
        name: resolved.name,
        type: resolved.type,
        hsnOrSac: resolved.hsnOrSac,
        unit: resolved.unit,
        categoryId: resolved.categoryId,
        groupId: resolved.groupId,
        purchasePriceMinor: resolved.purchasePriceMinor,
        sellingPriceMinor: resolved.sellingPriceMinor,
        priceIsTaxInclusive: resolved.priceIsTaxInclusive,
        taxRatePercent: resolved.taxRatePercent,
        barcode: resolved.barcode,
      });
      if (!created.ok) return { ok: false, message: productErrorMessage(created.reason) };
      return { ok: true };
    },
  });

  revalidatePath("/products");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} product(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
