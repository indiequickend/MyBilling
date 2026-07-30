"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { bankStatementRowSchema, BANK_STATEMENT_MAX_ROWS } from "@/lib/validation/bankReconciliation";
import {
  importBankStatement,
  matchStatementLine,
  unmatchStatementLine,
} from "@/lib/db/queries/bankReconciliation";

export type ImportState = {
  error?: string;
  rowErrors?: { row: number; message: string }[];
  success?: string;
};

async function requirePaymentsPermission(action: "create" | "edit") {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "payments", action);
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

const REQUIRED_COLUMNS = ["statementDate", "amountMinor", "direction"] as const;

export async function importBankStatementAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const context = await requirePaymentsPermission("edit");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");

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
  if (rows.length === 0) return { error: "The file has no data rows." };
  if (rows.length > BANK_STATEMENT_MAX_ROWS) {
    return {
      error: `This file has ${rows.length} rows — import accepts at most ${BANK_STATEMENT_MAX_ROWS} rows per file. Split it into smaller files.`,
    };
  }

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !(col in (rows[0] ?? {})));
  if (missingColumns.length > 0) {
    return { error: `Missing required column(s): ${missingColumns.join(", ")}.` };
  }

  const rowErrors: { row: number; message: string }[] = [];
  const validatedRows: ReturnType<typeof bankStatementRowSchema.parse>[] = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const result = bankStatementRowSchema.safeParse(row);
    if (!result.success) {
      rowErrors.push({ row: rowNumber, message: result.error.issues[0]?.message ?? "Invalid row" });
      return;
    }
    validatedRows.push(result.data);
  });
  if (rowErrors.length > 0) {
    return {
      error: `${rowErrors.length} row(s) failed validation — nothing was imported. Fix these rows and re-upload.`,
      rowErrors: rowErrors.slice(0, 50),
    };
  }

  const result = await importBankStatement(
    context.activeBusinessId,
    bankAccountId,
    validatedRows.map((r) => ({
      statementDate: new Date(r.statementDate),
      description: r.description,
      amountMinor: r.amountMinor,
      direction: r.direction,
    })),
    context.userId,
  );
  if (!result.ok) return { error: "Select a valid bank account." };

  revalidatePath(`/payments/reconciliation/${bankAccountId}`);
  return {
    success: `Imported ${result.imported} line(s) — ${result.autoMatched} automatically matched to existing payments.`,
  };
}

export async function matchStatementLineAction(formData: FormData): Promise<void> {
  const context = await requirePaymentsPermission("edit");
  const lineId = String(formData.get("lineId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!lineId || !paymentId) return;
  await matchStatementLine(lineId, paymentId, context.activeBusinessId);
  revalidatePath(`/payments/reconciliation/${bankAccountId}`);
}

export async function unmatchStatementLineAction(formData: FormData): Promise<void> {
  const context = await requirePaymentsPermission("edit");
  const lineId = String(formData.get("lineId") ?? "");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!lineId) return;
  await unmatchStatementLine(lineId, context.activeBusinessId);
  revalidatePath(`/payments/reconciliation/${bankAccountId}`);
}
