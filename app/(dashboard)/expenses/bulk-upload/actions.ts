"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { expenseRowSchema, EXPENSE_BULK_UPLOAD_MAX_ROWS } from "@/lib/validation/expenses";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { findOrCreateExpenseCategoryByName } from "@/lib/db/queries/expenseCategories";
import { createExpense } from "@/lib/db/queries/expenses";

export type BulkUploadRowError = { row: number; message: string };
export type BulkUploadState = {
  error?: string;
  rowErrors?: BulkUploadRowError[];
  success?: string;
};

const REQUIRED_COLUMNS = [
  "categoryName",
  "amountMinor",
  "mode",
  "bankAccountName",
  "expenseDate",
] as const;

export async function bulkUploadExpensesAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "expenses", "create");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    return {
      error: "Couldn't parse this file as CSV.",
      rowErrors: parsed.errors.slice(0, 20).map((e) => ({ row: (e.row ?? 0) + 2, message: e.message })),
    };
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    return { error: "The file has no data rows." };
  }
  if (rows.length > EXPENSE_BULK_UPLOAD_MAX_ROWS) {
    return {
      error: `This file has ${rows.length} rows — bulk upload accepts at most ${EXPENSE_BULK_UPLOAD_MAX_ROWS} rows per file. Split it into smaller files.`,
    };
  }

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !(col in (rows[0] ?? {})));
  if (missingColumns.length > 0) {
    return { error: `Missing required column(s): ${missingColumns.join(", ")}.` };
  }

  // Validate every row before touching the database at all — an upload either fully succeeds
  // or nothing is inserted, per the phase's bulk-upload requirement.
  const rowErrors: BulkUploadRowError[] = [];
  const validatedRows: { rowNumber: number; data: ReturnType<typeof expenseRowSchema.parse> }[] = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const result = expenseRowSchema.safeParse(row);
    if (!result.success) {
      rowErrors.push({ row: rowNumber, message: result.error.issues[0]?.message ?? "Invalid row" });
      return;
    }
    validatedRows.push({ rowNumber, data: result.data });
  });

  // Second validation pass: every referenced bank/cash account must actually exist for this
  // business — caught here (before any insert) rather than surfacing as a partial mid-batch
  // failure once createExpense() starts running.
  const bankAccounts = await listBankAccounts(context.activeBusinessId, "active");
  const bankAccountByName = new Map(bankAccounts.map((a) => [a.name.trim().toLowerCase(), a]));
  for (const { rowNumber, data } of validatedRows) {
    if (!bankAccountByName.has(data.bankAccountName.trim().toLowerCase())) {
      rowErrors.push({ row: rowNumber, message: `Unknown bank/cash account: "${data.bankAccountName}"` });
    }
  }

  if (rowErrors.length > 0) {
    return {
      error: `${rowErrors.length} row(s) failed validation — nothing was imported. Fix these rows and re-upload.`,
      rowErrors: rowErrors.slice(0, 50),
    };
  }

  // All rows validated — insert sequentially (not Promise.all) so category auto-creation for a
  // brand-new category name shared by multiple rows doesn't race against the collection's unique
  // {businessId, name} index.
  let inserted = 0;
  for (const { data } of validatedRows) {
    const category = await findOrCreateExpenseCategoryByName(context.activeBusinessId, data.categoryName);
    const bankAccount = bankAccountByName.get(data.bankAccountName.trim().toLowerCase())!;
    const result = await createExpense({
      businessId: context.activeBusinessId,
      categoryId: String(category._id),
      amountMinor: data.amountMinor,
      mode: data.mode,
      bankAccountId: String(bankAccount._id),
      supplierName: data.supplierName,
      supplierGstin: data.supplierGstin,
      description: data.description,
      expenseDate: new Date(data.expenseDate),
      createdByUserId: context.membership.userId,
    });
    if (result.ok) inserted += 1;
  }

  revalidatePath("/expenses");
  return { success: `Imported ${inserted} of ${validatedRows.length} expense(s).` };
}
