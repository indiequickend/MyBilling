"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { setDocumentCustomFieldDefs } from "@/lib/db/queries/businesses";
import { documentCustomFieldDefsSchema } from "@/lib/validation/documentCustomFields";
import { parseIndexedRows } from "@/lib/validation/shared";

export type DocumentFieldsPageState = { error?: string; success?: string };

async function requireDocumentSettingsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_document_settings");
  return { activeBusinessId: context.activeBusinessId };
}

export async function updateDocumentCustomFieldDefsAction(
  _prev: DocumentFieldsPageState,
  formData: FormData,
): Promise<DocumentFieldsPageState> {
  const context = await requireDocumentSettingsPermission();

  const rows = parseIndexedRows(formData, "documentField").map((row) => ({
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.options
      ? row.options
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    required: row.required === "on",
  }));

  const parsed = documentCustomFieldDefsSchema.safeParse(rows);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await setDocumentCustomFieldDefs(context.activeBusinessId, "invoice", parsed.data);
  revalidatePath("/settings/document-fields");
  return { success: "Document custom fields updated." };
}
