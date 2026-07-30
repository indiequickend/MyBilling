"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { gstr2bImportSchema } from "@/lib/validation/gst";
import { computeLocalItcSummary, getLocalPurchaseDocumentsForReconciliation } from "@/lib/db/queries/gstReports";
import { storeGstr2bImport } from "@/lib/db/queries/gstReportSnapshots";
import { parseGstr2bExport, reconcileGstr2b, Gstr2bParseError } from "@/lib/gst/gstr2bReconciliation";

export type Gstr2bImportState = { error?: string };

const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

async function requireGstEdit(): Promise<{ businessId: string; userId: string }> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "gst", "edit");
  return { businessId: context.activeBusinessId, userId: context.membership.userId };
}

export async function importGstr2bAction(
  _prev: Gstr2bImportState,
  formData: FormData,
): Promise<Gstr2bImportState> {
  const { businessId, userId } = await requireGstEdit();

  const parsedInput = gstr2bImportSchema.safeParse({ period: formData.get("period") });
  if (!parsedInput.success) return { error: "Select a valid period" };
  const { period } = parsedInput.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a GSTR-2B JSON export file to upload." };
  }
  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    return { error: "This file is too large — GSTR-2B exports are accepted up to 10MB." };
  }
  // MIME type isn't reliably set by browsers for .json file pickers, so this only rejects an
  // obviously-wrong upload (e.g. an image); the real validation is the JSON.parse + schema check
  // below, which is what actually protects against a malformed/malicious payload.
  if (file.type && file.type !== "application/json" && file.type !== "text/plain") {
    return { error: "Upload the GSTR-2B JSON export file, not another file type." };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(await file.text());
  } catch {
    return { error: "Couldn't parse this file as JSON." };
  }

  let importedRows;
  try {
    importedRows = parseGstr2bExport(rawJson);
  } catch (err) {
    if (err instanceof Gstr2bParseError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Couldn't read this GSTR-2B file." };
  }

  const [localItcSummary, localPurchases] = await Promise.all([
    computeLocalItcSummary(businessId, period),
    getLocalPurchaseDocumentsForReconciliation(businessId, period),
  ]);
  const diffResults = reconcileGstr2b(localPurchases, importedRows);

  await storeGstr2bImport(businessId, period, file.name, localItcSummary, importedRows, diffResults, userId);
  revalidatePath("/gst/gstr2b");
  return {};
}
