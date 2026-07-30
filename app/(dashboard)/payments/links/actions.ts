"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { paymentLinkSchema } from "@/lib/validation/paymentLinks";
import { absoluteUrl } from "@/lib/auth/urls";
import {
  createPaymentLink,
  revokePaymentLink,
  type CreatePaymentLinkResult,
} from "@/lib/db/queries/paymentLinks";

export type PaymentLinkFormState = { error?: string; fieldErrors?: Record<string, string>; url?: string };
export type PaymentLinkActionState = { error?: string };

async function requirePaymentsPermission(action: "create" | "edit") {
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

const REASON_MESSAGES: Record<Exclude<CreatePaymentLinkResult, { ok: true }>["reason"], string> = {
  invoice_not_found: "Select a valid invoice.",
};

export async function createPaymentLinkAction(
  _prev: PaymentLinkFormState,
  formData: FormData,
): Promise<PaymentLinkFormState> {
  const context = await requirePaymentsPermission("create");

  const parsed = paymentLinkSchema.safeParse({
    amountMinor: formData.get("amountMinor"),
    linkedInvoiceId: formData.get("linkedInvoiceId"),
    note: formData.get("note"),
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(parsed.data.expiresInDays));

  const result = await createPaymentLink({
    businessId: context.activeBusinessId,
    amountMinor: parsed.data.amountMinor,
    linkedInvoiceId: parsed.data.linkedInvoiceId,
    note: parsed.data.note,
    expiresAt,
    createdByUserId: context.userId,
  });
  if (!result.ok) return { error: REASON_MESSAGES[result.reason] };

  revalidatePath("/payments/links");
  return { url: absoluteUrl(`/pay/${result.token}`) };
}

export async function revokePaymentLinkAction(formData: FormData): Promise<void> {
  const context = await requirePaymentsPermission("edit");
  const paymentLinkId = String(formData.get("paymentLinkId") ?? "");
  if (!paymentLinkId) return;
  await revokePaymentLink(paymentLinkId, context.activeBusinessId);
  revalidatePath("/payments/links");
}
