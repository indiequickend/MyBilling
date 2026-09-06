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
import { proformaInvoiceRowSchema, type ProformaInvoiceRowInput } from "@/lib/validation/proformaInvoices";
import { parseCsvDate } from "@/lib/validation/shared";
import { findOrCreateCustomerByName } from "@/lib/db/queries/customers";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  importProformaInvoice,
  type ImportProformaInvoiceFailureReason,
} from "@/lib/db/queries/proformaInvoices";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["docNumber", "proformaDate", "customerName", "subtotalMinor", "totalAmountMinor"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function importErrorMessage(reason: ImportProformaInvoiceFailureReason): string {
  switch (reason) {
    case "customer_not_found":
      return "Customer could not be found or created.";
    case "business_not_found":
      return "Business not found.";
    case "duplicate_doc_number":
      return "A proforma invoice with this number already exists.";
    case "missing_place_of_supply":
      return "Could not determine place of supply — set your business's billing state in Settings, or fill in the placeOfSupplyState column for this row.";
  }
}

type ResolvedProformaInvoiceRow = ProformaInvoiceRowInput & {
  customerId: string;
  placeOfSupplyState: string;
  lineItemDescription: string;
  proformaDateParsed: Date;
  dueDateParsed?: Date;
};

export async function bulkUploadProformaInvoicesAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "proforma_invoices", "create");

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

  const result = await runBulkImport<ProformaInvoiceRowInput, ResolvedProformaInvoiceRow>({
    rows: parsedCsv.rows,
    rowSchema: proformaInvoiceRowSchema,
    resolveRow: async (data) => {
      const proformaDateParsed = parseCsvDate(data.proformaDate);
      if (!proformaDateParsed) {
        return { ok: false, message: `proformaDate: Enter a valid date (got "${data.proformaDate}")` };
      }
      let dueDateParsed: Date | undefined;
      if (data.dueDate) {
        dueDateParsed = parseCsvDate(data.dueDate);
        if (!dueDateParsed) {
          return { ok: false, message: `dueDate: Enter a valid date (got "${data.dueDate}")` };
        }
      }

      const customer = await findOrCreateCustomerByName(context.activeBusinessId, data.customerName, {
        phone: data.customerPhone,
        gstin: data.customerGstin,
      });

      return {
        ok: true,
        resolved: {
          ...data,
          customerId: String(customer._id),
          placeOfSupplyState: data.placeOfSupplyState || businessState,
          lineItemDescription: data.lineItemDescription || "Imported proforma invoice",
          proformaDateParsed,
          dueDateParsed,
        },
      };
    },
    insertRow: async (resolved) => {
      const created = await importProformaInvoice({
        businessId: context.activeBusinessId,
        customerId: resolved.customerId,
        docNumber: resolved.docNumber,
        proformaDate: resolved.proformaDateParsed,
        dueDate: resolved.dueDateParsed,
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

  revalidatePath("/sales/proforma-invoices");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} proforma invoice(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
