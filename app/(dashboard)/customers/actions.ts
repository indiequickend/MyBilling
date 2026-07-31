"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, can, type MembershipContext } from "@/lib/rbac/can";
import { customerSchema, customerAddressesSchema } from "@/lib/validation/customers";
import { partyPaymentSchema } from "@/lib/validation/payments";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  restoreCustomer,
  findCustomerById,
} from "@/lib/db/queries/customers";
import { recordPartyPayment } from "@/lib/db/queries/payments";
import { recordAuditLog } from "@/lib/db/queries/auditLog";
import type { ActionKey } from "@/lib/rbac/permissions";

export type CustomerFormState = { error?: string; fieldErrors?: Record<string, string> };
export type CustomerPaymentActionState = { error?: string };
export type RevealResult = { ok: true; value: string } | { ok: false; error: string };

export async function requireCustomersPermission(action: ActionKey): Promise<{
  activeBusinessId: string;
  membership: MembershipContext;
}> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "customers", action);
  return { activeBusinessId: context.activeBusinessId, membership: context.membership };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages[0]) out[key] = messages[0];
  }
  return out;
}

function customerInputFromFormData(formData: FormData) {
  return {
    displayName: formData.get("displayName"),
    companyName: formData.get("companyName"),
    gstin: formData.get("gstin"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    groupIds: formData.getAll("groupIds").map(String),
    notes: formData.get("notes"),
  };
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const context = await requireCustomersPermission("create");

  const parsed = customerSchema.safeParse(customerInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const addressesParsed = customerAddressesSchema.safeParse({
    billing: parseAddressFromFormData(formData, "billing"),
    shipping: parseAddressFromFormData(formData, "shipping"),
  });
  if (!addressesParsed.success) {
    return { error: "Fix the address fields and try again." };
  }

  const result = await createCustomer({
    businessId: context.activeBusinessId,
    ...parsed.data,
    billingAddress: addressesParsed.data.billing,
    shippingAddress: addressesParsed.data.shipping,
  });
  if (!result.ok) {
    return { error: "One or more selected groups belong to a different business." };
  }

  revalidatePath("/customers");
  redirect(`/customers/${String(result.customer._id)}/ledger`);
}

export async function updateCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const context = await requireCustomersPermission("edit");
  const customerId = String(formData.get("customerId") ?? "");

  const parsed = customerSchema.safeParse(customerInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const addressesParsed = customerAddressesSchema.safeParse({
    billing: parseAddressFromFormData(formData, "billing"),
    shipping: parseAddressFromFormData(formData, "shipping"),
  });
  if (!addressesParsed.success) {
    return { error: "Fix the address fields and try again." };
  }

  const result = await updateCustomer(customerId, context.activeBusinessId, {
    ...parsed.data,
    billingAddress: addressesParsed.data.billing,
    shippingAddress: addressesParsed.data.shipping,
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "invalid_group_ids"
          ? "One or more selected groups belong to a different business."
          : "Customer not found.",
    };
  }

  revalidatePath("/customers");
  redirect(`/customers/${customerId}/ledger`);
}

export async function softDeleteCustomerAction(formData: FormData): Promise<void> {
  const context = await requireCustomersPermission("delete");
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const customer = await softDeleteCustomer(customerId, context.activeBusinessId);
  if (customer) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "customer.deleted",
      target: { type: "customer", id: customerId, label: customer.displayName },
    });
  }
  revalidatePath("/customers");
}

export async function restoreCustomerAction(formData: FormData): Promise<void> {
  const context = await requireCustomersPermission("edit");
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const customer = await restoreCustomer(customerId, context.activeBusinessId);
  if (customer) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "customer.restored",
      target: { type: "customer", id: customerId, label: customer.displayName },
    });
  }
  revalidatePath("/customers");
}

/** The Customer Ledger's "You Got"/"You Gave" quick payment entry — records an advance/on-account
 * payment with no invoice attached (see recordPartyPayment). */
export async function recordCustomerPaymentAction(
  _prev: CustomerPaymentActionState,
  formData: FormData,
): Promise<CustomerPaymentActionState> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "payments", "create")) {
    return { error: "You don't have permission to record payments." };
  }
  const customerId = String(formData.get("customerId") ?? "");

  const parsed = partyPaymentSchema.safeParse({
    direction: formData.get("direction"),
    amountMinor: formData.get("amountMinor"),
    mode: formData.get("mode"),
    bankAccountId: formData.get("bankAccountId"),
    paymentDate: formData.get("paymentDate"),
    referenceNote: formData.get("referenceNote"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Fix the payment." };

  const result = await recordPartyPayment({
    businessId: context.activeBusinessId,
    partyType: "customer",
    partyId: customerId,
    direction: parsed.data.direction,
    amountMinor: parsed.data.amountMinor,
    mode: parsed.data.mode,
    bankAccountId: parsed.data.bankAccountId,
    paymentDate: new Date(parsed.data.paymentDate),
    referenceNote: parsed.data.referenceNote,
    createdByUserId: context.membership.userId,
  });
  if (!result.ok) {
    return {
      error: result.reason === "party_not_found" ? "Customer not found." : "Select a valid bank account.",
    };
  }

  revalidatePath(`/customers/${customerId}/ledger`);
  revalidatePath("/payments");
  return {};
}

/** Reveals a customer's unmasked GSTIN (list page shows it masked by default) — audit-logged so
 * every reveal is traceable to a user. */
export async function revealCustomerGstinAction(customerId: string): Promise<RevealResult> {
  const context = await requireCustomersPermission("view");
  const customer = await findCustomerById(customerId, context.activeBusinessId);
  if (!customer?.gstin) return { ok: false, error: "Not available." };

  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "sensitive_field.revealed",
    target: { type: "customer", id: customerId, label: customer.displayName },
    after: { field: "gstin" },
  });

  return { ok: true, value: customer.gstin };
}
