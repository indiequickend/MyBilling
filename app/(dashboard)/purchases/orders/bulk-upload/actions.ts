"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { requirePermission } from "@/lib/rbac/can";
import {
  parseCsvRows,
  runBulkImport,
  BULK_IMPORT_MAX_FILE_BYTES,
} from "@/lib/importExport/bulkImport";
import { purchaseOrderRowSchema, type PurchaseOrderRowInput } from "@/lib/validation/purchaseOrders";
import { parseCsvDate } from "@/lib/validation/shared";
import { findOrCreateVendorByName } from "@/lib/db/queries/vendors";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  importPurchaseOrder,
  type ImportPurchaseOrderFailureReason,
} from "@/lib/db/queries/purchaseOrders";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["docNumber", "orderDate", "vendorName", "subtotalMinor", "totalAmountMinor"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function importErrorMessage(reason: ImportPurchaseOrderFailureReason): string {
  switch (reason) {
    case "vendor_not_found":
      return "Vendor could not be found or created.";
    case "business_not_found":
      return "Business not found.";
    case "duplicate_doc_number":
      return "A purchase order with this number already exists.";
    case "missing_place_of_supply":
      return "Could not determine place of supply — set your business's billing state in Settings, or fill in the placeOfSupplyState column for this row.";
  }
}

type ResolvedPurchaseOrderRow = PurchaseOrderRowInput & {
  vendorId: string;
  placeOfSupplyState: string;
  lineItemDescription: string;
  orderDateParsed: Date;
  expectedDeliveryDateParsed?: Date;
};

export async function bulkUploadPurchaseOrdersAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchase_orders", "create");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > BULK_IMPORT_MAX_FILE_BYTES) {
    return { error: "File is too large — the limit is 5 MB." };
  }

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) return { error: "Business not found." };
  const businessState = business.addresses?.billing?.state ?? "";

  const text = await file.text();
  const parsedCsv = parseCsvRows(text, REQUIRED_COLUMNS);
  if (!parsedCsv.ok) return { error: parsedCsv.error };

  const result = await runBulkImport<PurchaseOrderRowInput, ResolvedPurchaseOrderRow>({
    rows: parsedCsv.rows,
    rowSchema: purchaseOrderRowSchema,
    resolveRow: async (data) => {
      const orderDateParsed = parseCsvDate(data.orderDate);
      if (!orderDateParsed) {
        return { ok: false, message: `orderDate: Enter a valid date (got "${data.orderDate}")` };
      }
      let expectedDeliveryDateParsed: Date | undefined;
      if (data.expectedDeliveryDate) {
        expectedDeliveryDateParsed = parseCsvDate(data.expectedDeliveryDate);
        if (!expectedDeliveryDateParsed) {
          return {
            ok: false,
            message: `expectedDeliveryDate: Enter a valid date (got "${data.expectedDeliveryDate}")`,
          };
        }
      }

      const vendor = await findOrCreateVendorByName(context.activeBusinessId, data.vendorName, {
        phone: data.vendorPhone,
        gstin: data.vendorGstin,
      });

      return {
        ok: true,
        resolved: {
          ...data,
          vendorId: String(vendor._id),
          placeOfSupplyState: data.placeOfSupplyState || businessState,
          lineItemDescription: data.lineItemDescription || "Imported purchase order",
          orderDateParsed,
          expectedDeliveryDateParsed,
        },
      };
    },
    insertRow: async (resolved) => {
      const created = await importPurchaseOrder({
        businessId: context.activeBusinessId,
        vendorId: resolved.vendorId,
        docNumber: resolved.docNumber,
        orderDate: resolved.orderDateParsed,
        expectedDeliveryDate: resolved.expectedDeliveryDateParsed,
        referenceNumber: resolved.referenceNumber,
        placeOfSupplyState: resolved.placeOfSupplyState,
        notes: resolved.notes,
        terms: resolved.terms,
        lineItemDescription: resolved.lineItemDescription,
        subtotalMinor: resolved.subtotalMinor,
        discountAmountMinor: resolved.discountAmountMinor,
        totalTaxMinor: resolved.taxAmountMinor,
        grandTotalMinor: resolved.totalAmountMinor,
        createdByUserId: context.membership.userId,
      });
      if (!created.ok) return { ok: false, message: importErrorMessage(created.reason) };
      return { ok: true };
    },
  });

  revalidatePath("/purchases/orders");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} purchase order(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
