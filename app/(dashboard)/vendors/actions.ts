"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission, can, type MembershipContext } from "@/lib/rbac/can";
import { vendorSchema, vendorAddressesSchema } from "@/lib/validation/vendors";
import { partyPaymentSchema } from "@/lib/validation/payments";
import { parseAddressFromFormData } from "@/lib/validation/shared";
import {
  createVendor,
  updateVendor,
  softDeleteVendor,
  restoreVendor,
  findVendorById,
} from "@/lib/db/queries/vendors";
import { recordPartyPayment } from "@/lib/db/queries/payments";
import { recordAuditLog } from "@/lib/db/queries/auditLog";
import type { ActionKey } from "@/lib/rbac/permissions";

export type VendorFormState = { error?: string; fieldErrors?: Record<string, string> };
export type VendorPaymentActionState = { error?: string };
export type RevealResult = { ok: true; value: string } | { ok: false; error: string };

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
  const vendor = await softDeleteVendor(vendorId, context.activeBusinessId);
  if (vendor) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "vendor.deleted",
      target: { type: "vendor", id: vendorId, label: vendor.displayName },
    });
  }
  revalidatePath("/vendors");
}

export async function restoreVendorAction(formData: FormData): Promise<void> {
  const context = await requireVendorsPermission("edit");
  const vendorId = String(formData.get("vendorId") ?? "");
  if (!vendorId) return;
  const vendor = await restoreVendor(vendorId, context.activeBusinessId);
  if (vendor) {
    await recordAuditLog({
      businessId: context.activeBusinessId,
      userId: context.membership.userId,
      action: "vendor.restored",
      target: { type: "vendor", id: vendorId, label: vendor.displayName },
    });
  }
  revalidatePath("/vendors");
}

/** The Vendor Ledger's "You Got"/"You Gave" quick payment entry — records an advance/on-account
 * payment with no purchase attached (see recordPartyPayment). */
export async function recordVendorPaymentAction(
  _prev: VendorPaymentActionState,
  formData: FormData,
): Promise<VendorPaymentActionState> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "payments", "create")) {
    return { error: "You don't have permission to record payments." };
  }
  const vendorId = String(formData.get("vendorId") ?? "");

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
    partyType: "vendor",
    partyId: vendorId,
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
      error: result.reason === "party_not_found" ? "Vendor not found." : "Select a valid bank account.",
    };
  }

  revalidatePath(`/vendors/${vendorId}/ledger`);
  revalidatePath("/payments");
  return {};
}

/** Reveals a vendor's unmasked GSTIN (list page shows it masked by default) — audit-logged so
 * every reveal is traceable to a user. */
export async function revealVendorGstinAction(vendorId: string): Promise<RevealResult> {
  const context = await requireVendorsPermission("view");
  const vendor = await findVendorById(vendorId, context.activeBusinessId);
  if (!vendor?.gstin) return { ok: false, error: "Not available." };

  await recordAuditLog({
    businessId: context.activeBusinessId,
    userId: context.membership.userId,
    action: "sensitive_field.revealed",
    target: { type: "vendor", id: vendorId, label: vendor.displayName },
    after: { field: "gstin" },
  });

  return { ok: true, value: vendor.gstin };
}
