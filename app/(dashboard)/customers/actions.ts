"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, type MembershipContext } from "@/lib/rbac/can";
import { customerSchema, customerAddressesSchema } from "@/lib/validation/customers";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  restoreCustomer,
} from "@/lib/db/queries/customers";
import type { ActionKey } from "@/lib/rbac/permissions";

export type CustomerFormState = { error?: string; fieldErrors?: Record<string, string> };

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
  await softDeleteCustomer(customerId, context.activeBusinessId);
  revalidatePath("/customers");
}

export async function restoreCustomerAction(formData: FormData): Promise<void> {
  const context = await requireCustomersPermission("edit");
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  await restoreCustomer(customerId, context.activeBusinessId);
  revalidatePath("/customers");
}
