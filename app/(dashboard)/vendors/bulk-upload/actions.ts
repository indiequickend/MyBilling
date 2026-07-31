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
import { vendorRowSchema, type VendorRowInput } from "@/lib/validation/vendors";
import { findOrCreatePartyGroupByName } from "@/lib/db/queries/partyGroups";
import { createVendor } from "@/lib/db/queries/vendors";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["displayName"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

type ResolvedVendorRow = VendorRowInput & { groupIds: string[] };

function splitGroupNames(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export async function bulkUploadVendorsAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "vendors", "create");

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

  const result = await runBulkImport<VendorRowInput, ResolvedVendorRow>({
    rows: parsedCsv.rows,
    rowSchema: vendorRowSchema,
    resolveRow: async (data) => {
      const names = splitGroupNames(data.groupNames);
      const groups = await Promise.all(
        names.map((name) => findOrCreatePartyGroupByName(context.activeBusinessId, "vendor", name)),
      );
      return { ok: true, resolved: { ...data, groupIds: groups.map((g) => String(g._id)) } };
    },
    insertRow: async (resolved) => {
      const created = await createVendor({
        businessId: context.activeBusinessId,
        displayName: resolved.displayName,
        companyName: resolved.companyName,
        gstin: resolved.gstin,
        email: resolved.email,
        phone: resolved.phone,
        groupIds: resolved.groupIds,
        notes: resolved.notes,
      });
      if (!created.ok) return { ok: false, message: "One or more groups are invalid." };
      return { ok: true };
    },
  });

  revalidatePath("/vendors");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} vendor(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
