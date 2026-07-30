"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { paymentGatewayAccountSchema } from "@/lib/validation/paymentGateway";
import { upsertPaymentGatewayAccount, setPaymentGatewayEnabled } from "@/lib/db/queries/paymentGateway";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";

export type PaymentGatewayFormState = { error?: string; fieldErrors?: Record<string, string>; success?: string };

async function requireIntegrationsPermission() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "settings", "manage_integrations");
  return { activeBusinessId: context.activeBusinessId };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

export async function savePaymentGatewayAction(
  _prev: PaymentGatewayFormState,
  formData: FormData,
): Promise<PaymentGatewayFormState> {
  const context = await requireIntegrationsPermission();

  const parsed = paymentGatewayAccountSchema.safeParse({
    keyId: formData.get("keyId"),
    keySecret: formData.get("keySecret"),
    webhookSecret: formData.get("webhookSecret"),
    accountId: formData.get("accountId"),
    settlementBankAccountId: formData.get("settlementBankAccountId"),
  });
  if (!parsed.success) {
    return { error: "Fix the errors below and try again.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (!(await isOwnedBankAccount(parsed.data.settlementBankAccountId, context.activeBusinessId))) {
    return {
      error: "Select a valid settlement account.",
      fieldErrors: { settlementBankAccountId: "Select a valid settlement account." },
    };
  }

  await upsertPaymentGatewayAccount({ businessId: context.activeBusinessId, ...parsed.data });

  revalidatePath("/settings/payment-gateway");
  return { success: "Payment gateway connected." };
}

export async function togglePaymentGatewayEnabledAction(formData: FormData): Promise<void> {
  const context = await requireIntegrationsPermission();
  const isEnabled = formData.get("isEnabled") === "true";
  await setPaymentGatewayEnabled(context.activeBusinessId, !isEnabled);
  revalidatePath("/settings/payment-gateway");
}
