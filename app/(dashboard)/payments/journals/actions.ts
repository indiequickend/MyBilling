"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { journalHeaderSchema, journalLinesSchema } from "@/lib/validation/journals";
import { parseIndexedRows } from "@/lib/validation/shared";
import { createJournal, softDeleteJournal, type JournalWriteFailureReason } from "@/lib/db/queries/journals";
import { recordAuditLog } from "@/lib/db/queries/auditLog";

export type JournalFormState = { error?: string; fieldErrors?: Record<string, string> };

async function requirePaymentsPermission(action: "create" | "delete") {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "payments", action);
  return { activeBusinessId: context.activeBusinessId, userId: context.membership.userId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

const REASON_MESSAGES: Record<JournalWriteFailureReason, string> = {
  business_not_found: "Business not found.",
  invalid_line_count: "A journal needs at least two lines.",
  invalid_account_ref: "One of the selected accounts is invalid.",
  unbalanced: "Debits and credits must balance.",
  empty_entry: "Enter at least one amount.",
};

function parseLineRows(formData: FormData) {
  return parseIndexedRows(formData, "line").map((row) => ({
    accountType: row.accountType,
    accountRefId: row.accountRefId || undefined,
    accountLabel: row.accountLabel || undefined,
    side: row.side,
    amountMinor: row.amountMinor,
    note: row.note || undefined,
  }));
}

export async function createJournalAction(
  _prev: JournalFormState,
  formData: FormData,
): Promise<JournalFormState> {
  const context = await requirePaymentsPermission("create");

  const headerParsed = journalHeaderSchema.safeParse({
    journalDate: formData.get("journalDate"),
    narration: formData.get("narration"),
  });
  if (!headerParsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(headerParsed.error) };
  }

  const linesParsed = journalLinesSchema.safeParse(parseLineRows(formData));
  if (!linesParsed.success) {
    return { error: linesParsed.error.issues[0]?.message ?? "Fix the journal lines." };
  }

  const result = await createJournal({
    businessId: context.activeBusinessId,
    journalDate: new Date(headerParsed.data.journalDate),
    narration: headerParsed.data.narration,
    lines: linesParsed.data,
    createdByUserId: context.userId,
  });
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/payments/journals");
  redirect(`/payments/journals/${String(result.journal._id)}`);
}

export async function softDeleteJournalAction(formData: FormData): Promise<void> {
  const context = await requirePaymentsPermission("delete");
  const journalId = String(formData.get("journalId") ?? "");
  if (!journalId) return;
  const journal = await softDeleteJournal(journalId, context.activeBusinessId);
  if (journal) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.userId,
      action: "journal.deleted",
      target: { type: "journal", id: journalId, label: journal.narration },
    });
  }
  revalidatePath("/payments/journals");
  redirect("/payments/journals");
}
