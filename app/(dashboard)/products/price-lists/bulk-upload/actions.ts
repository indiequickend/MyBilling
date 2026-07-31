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
import { priceListRowSchema, type PriceListRowInput } from "@/lib/validation/priceLists";
import { createPriceList } from "@/lib/db/queries/priceLists";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["name"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

export async function bulkUploadPriceListsAction(
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

  const result = await runBulkImport<PriceListRowInput, PriceListRowInput>({
    rows: parsedCsv.rows,
    rowSchema: priceListRowSchema,
    resolveRow: async (data) => ({ ok: true, resolved: data }),
    insertRow: async (resolved) => {
      try {
        await createPriceList({
          businessId: context.activeBusinessId,
          name: resolved.name,
          description: resolved.description,
        });
        return { ok: true };
      } catch {
        return { ok: false, message: `A price list named "${resolved.name}" already exists.` };
      }
    },
  });

  revalidatePath("/products/price-lists");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} price list(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
