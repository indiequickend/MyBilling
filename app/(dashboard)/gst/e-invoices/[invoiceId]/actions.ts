"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { eInvoiceStatusOverrideSchema } from "@/lib/validation/gst";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { upsertEInvoiceData, overrideEInvoiceStatus } from "@/lib/db/queries/eInvoiceData";
import {
  buildEInvoicePayload,
  validateEInvoicePayload,
  type EInvoiceInvoiceInput,
  type EInvoiceBusinessInput,
} from "@/lib/gst/eInvoicePayload";
import type { InvoiceDoc } from "@/lib/db/models/Invoice";
import type { BusinessDoc } from "@/lib/db/models/Business";

export type GstActionState = { error?: string };

async function requireGstEdit(): Promise<{ businessId: string; userId: string }> {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  requirePermission(context.membership, "gst", "edit");
  return { businessId: context.activeBusinessId, userId: context.membership.userId };
}

function toEInvoiceInvoiceInput(invoice: InvoiceDoc): EInvoiceInvoiceInput {
  const address = invoice.customerSnapshot.billingAddress;
  return {
    docNumber: invoice.docNumber ?? "",
    invoiceDate: invoice.invoiceDate,
    reverseCharge: invoice.reverseCharge,
    placeOfSupplyState: invoice.placeOfSupplyState,
    customerGstin: invoice.customerSnapshot.gstin,
    customerDisplayName: invoice.customerSnapshot.displayName,
    customerAddress: address
      ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode }
      : undefined,
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      hsnOrSac: li.hsnOrSac ?? undefined,
      unit: li.unit ?? undefined,
      quantity: li.quantity,
      unitPriceMinor: li.unitPriceMinor,
      taxableAmountMinor: li.taxableAmountMinor,
      taxRatePercent: li.taxRatePercent,
      cgstMinor: li.cgstMinor,
      sgstMinor: li.sgstMinor,
      igstMinor: li.igstMinor,
      totalMinor: li.totalMinor,
    })),
    subtotalMinor: invoice.subtotalMinor,
    totalCgstMinor: invoice.totalCgstMinor,
    totalSgstMinor: invoice.totalSgstMinor,
    totalIgstMinor: invoice.totalIgstMinor,
    discountAmountMinor: invoice.discountAmountMinor,
    roundOffAmountMinor: invoice.roundOffAmountMinor,
    grandTotalMinor: invoice.grandTotalMinor,
  };
}

function toEInvoiceBusinessInput(business: BusinessDoc): EInvoiceBusinessInput {
  const address = business.addresses?.billing;
  return {
    gstin: business.gstin,
    displayName: business.brandName || business.name,
    phone: business.phone,
    email: business.email,
    address: address
      ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode }
      : undefined,
  };
}

export async function generateEInvoiceDataAction(
  _prev: GstActionState,
  formData: FormData,
): Promise<GstActionState> {
  const { businessId, userId } = await requireGstEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) return { error: "Invoice not found" };
  if (!invoice.eInvoiceFlag) return { error: "E-invoicing is not enabled for this invoice" };

  const business = await findBusinessById(businessId);
  if (!business) return { error: "Business not found" };

  const payload = buildEInvoicePayload(toEInvoiceInvoiceInput(invoice), toEInvoiceBusinessInput(business));
  const validation = validateEInvoicePayload(payload);

  await upsertEInvoiceData(businessId, invoiceId, payload, validation, userId);
  revalidatePath(`/gst/e-invoices/${invoiceId}`);
  revalidatePath("/gst/e-invoices");
  return validation.valid ? {} : { error: validation.errors.join("; ") };
}

export async function overrideEInvoiceStatusAction(
  _prev: GstActionState,
  formData: FormData,
): Promise<GstActionState> {
  const { businessId } = await requireGstEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const parsed = eInvoiceStatusOverrideSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) return { error: "Invalid status" };

  await overrideEInvoiceStatus(businessId, invoiceId, parsed.data.status);
  revalidatePath(`/gst/e-invoices/${invoiceId}`);
  revalidatePath("/gst/e-invoices");
  return {};
}
