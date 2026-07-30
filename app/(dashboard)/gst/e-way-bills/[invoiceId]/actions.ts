"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import { transportDetailsSchema } from "@/lib/validation/gst";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { upsertEwayBillData } from "@/lib/db/queries/ewayBillData";
import {
  buildEwayBillPayload,
  validateEwayBillPayload,
  type EwayBillInvoiceInput,
  type EwayBillBusinessInput,
  type EwayBillTransportInput,
} from "@/lib/gst/ewayBillPayload";
import type { EwayBillTransportDetailsDoc } from "@/lib/db/models/EwayBillData";
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

function toEwayBillInvoiceInput(invoice: InvoiceDoc): EwayBillInvoiceInput {
  const address = invoice.customerSnapshot.billingAddress;
  return {
    docNumber: invoice.docNumber ?? "",
    invoiceDate: invoice.invoiceDate,
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
      taxableAmountMinor: li.taxableAmountMinor,
      taxRatePercent: li.taxRatePercent,
      cgstMinor: li.cgstMinor,
      sgstMinor: li.sgstMinor,
      igstMinor: li.igstMinor,
    })),
    subtotalMinor: invoice.subtotalMinor,
    totalCgstMinor: invoice.totalCgstMinor,
    totalSgstMinor: invoice.totalSgstMinor,
    totalIgstMinor: invoice.totalIgstMinor,
    grandTotalMinor: invoice.grandTotalMinor,
  };
}

function toEwayBillBusinessInput(business: BusinessDoc): EwayBillBusinessInput {
  const address = business.addresses?.billing;
  return {
    gstin: business.gstin,
    displayName: business.brandName || business.name,
    address: address
      ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode }
      : undefined,
  };
}

export async function generateEwayBillDataAction(
  _prev: GstActionState,
  formData: FormData,
): Promise<GstActionState> {
  const { businessId, userId } = await requireGstEdit();
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const parsed = transportDetailsSchema.safeParse({
    transporterId: formData.get("transporterId"),
    transporterName: formData.get("transporterName"),
    transDocNo: formData.get("transDocNo"),
    transDocDate: formData.get("transDocDate"),
    transMode: formData.get("transMode"),
    transDistanceKm: formData.get("transDistanceKm"),
    vehicleNumber: formData.get("vehicleNumber"),
    vehicleType: formData.get("vehicleType"),
    subSupplyType: formData.get("subSupplyType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid transport details" };

  const invoice = await findInvoiceById(invoiceId, businessId);
  if (!invoice) return { error: "Invoice not found" };
  if (!invoice.eWayBillFlag) return { error: "E-way bill generation is not enabled for this invoice" };

  const business = await findBusinessById(businessId);
  if (!business) return { error: "Business not found" };

  const transportInput: EwayBillTransportInput = {
    transporterId: parsed.data.transporterId,
    transporterName: parsed.data.transporterName,
    transDocNo: parsed.data.transDocNo,
    transDocDate: parsed.data.transDocDate ? new Date(parsed.data.transDocDate) : undefined,
    transMode: parsed.data.transMode,
    transDistanceKm: parsed.data.transDistanceKm,
    vehicleNumber: parsed.data.vehicleNumber,
    vehicleType: parsed.data.vehicleType,
    subSupplyType: parsed.data.subSupplyType,
  };

  const payload = buildEwayBillPayload(toEwayBillInvoiceInput(invoice), toEwayBillBusinessInput(business), transportInput);
  const validation = validateEwayBillPayload(payload);
  if (!validation.valid) return { error: validation.errors.join("; ") };

  const transportDoc: EwayBillTransportDetailsDoc = transportInput;
  await upsertEwayBillData(businessId, invoiceId, transportDoc, payload, userId);
  revalidatePath(`/gst/e-way-bills/${invoiceId}`);
  revalidatePath("/gst/e-way-bills");
  return {};
}
