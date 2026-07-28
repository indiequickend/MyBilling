"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, type MembershipContext } from "@/lib/rbac/can";
import { vendorSchema, vendorAddressesSchema } from "@/lib/validation/vendors";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import {
  createVendor,
  updateVendor,
  softDeleteVendor,
  restoreVendor,
} from "@/lib/db/queries/vendors";
import type { ActionKey } from "@/lib/rbac/permissions";

export type VendorFormState = { error?: string; fieldErrors?: Record<string, string> };

export async function requireVendorsPermission(action: ActionKey): Promise<{
  activeBusinessId: string;
  membership: MembershipContext;
}> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "vendors", action);
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

function vendorInputFromFormData(formData: FormData) {
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

export async function createVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const context = await requireVendorsPermission("create");

  const parsed = vendorSchema.safeParse(vendorInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const addressesParsed = vendorAddressesSchema.safeParse({
    billing: parseAddressFromFormData(formData, "billing"),
    shipping: parseAddressFromFormData(formData, "shipping"),
  });
  if (!addressesParsed.success) {
    return { error: "Fix the address fields and try again." };
  }

  const result = await createVendor({
    businessId: context.activeBusinessId,
    ...parsed.data,
    billingAddress: addressesParsed.data.billing,
    shippingAddress: addressesParsed.data.shipping,
  });
  if (!result.ok) {
    return { error: "One or more selected groups belong to a different business." };
  }

  revalidatePath("/vendors");
  redirect(`/vendors/${String(result.vendor._id)}/ledger`);
}

export async function updateVendorAction(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  const context = await requireVendorsPermission("edit");
  const vendorId = String(formData.get("vendorId") ?? "");

  const parsed = vendorSchema.safeParse(vendorInputFromFormData(formData));
  if (!parsed.success) {
    return {
      error: "Fix the errors below and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const addressesParsed = vendorAddressesSchema.safeParse({
    billing: parseAddressFromFormData(formData, "billing"),
    shipping: parseAddressFromFormData(formData, "shipping"),
  });
  if (!addressesParsed.success) {
    return { error: "Fix the address fields and try again." };
  }

  const result = await updateVendor(vendorId, context.activeBusinessId, {
    ...parsed.data,
    billingAddress: addressesParsed.data.billing,
    shippingAddress: addressesParsed.data.shipping,
  });
  if (!result.ok) {
    return {
      error:
        result.reason === "invalid_group_ids"
          ? "One or more selected groups belong to a different business."
          : "Vendor not found.",
    };
  }

  revalidatePath("/vendors");
  redirect(`/vendors/${vendorId}/ledger`);
}

export async function softDeleteVendorAction(formData: FormData): Promise<void> {
  const context = await requireVendorsPermission("delete");
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!vendorId) return;
  await softDeleteVendor(vendorId, context.activeBusinessId);
  revalidatePath("/vendors");
}

export async function restoreVendorAction(formData: FormData): Promise<void> {
  const context = await requireVendorsPermission("edit");
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!vendorId) return;
  await restoreVendor(vendorId, context.activeBusinessId);
  revalidatePath("/vendors");
}
