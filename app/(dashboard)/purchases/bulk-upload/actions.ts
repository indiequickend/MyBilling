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
import {
  purchaseGroupRowSchema,
  groupPurchaseCsvRows,
  type PurchaseGroupRowInput,
  type PurchaseCsvRawGroup,
} from "@/lib/validation/purchases";
import { parseCsvDate } from "@/lib/validation/shared";
import { findOrCreateVendorByName } from "@/lib/db/queries/vendors";
import { findOrCreateImportBankAccount } from "@/lib/db/queries/bankAccounts";
import { findBusinessById } from "@/lib/db/queries/businesses";
import {
  importPurchase,
  type ImportPurchaseFailureReason,
  type ImportPurchasePaymentInput,
} from "@/lib/db/queries/purchases";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["docNumber", "purchaseDate", "vendorName", "subtotalMinor", "totalAmountMinor"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function importErrorMessage(reason: ImportPurchaseFailureReason): string {
  switch (reason) {
    case "vendor_not_found":
      return "Vendor could not be found or created.";
    case "business_not_found":
      return "Business not found.";
    case "invalid_bank_account":
      return "Could not resolve a bank/cash account for one of the payments.";
    case "duplicate_doc_number":
      return "A purchase with this number already exists.";
    case "missing_place_of_supply":
      return "Could not determine place of supply — set your business's billing state in Settings, or fill in the placeOfSupplyState column for this row.";
  }
}

type ResolvedPurchaseRow = PurchaseGroupRowInput & {
  vendorId: string;
  placeOfSupplyState: string;
  lineItemDescription: string;
  purchaseDateParsed: Date;
  dueDateParsed?: Date;
  resolvedPayments: ImportPurchasePaymentInput[];
};

export async function bulkUploadPurchasesAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "purchases", "create");

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

  const groups = groupPurchaseCsvRows(parsedCsv.rows);

  const result = await runBulkImport<PurchaseGroupRowInput, ResolvedPurchaseRow, PurchaseCsvRawGroup>({
    rows: groups,
    rowSchema: purchaseGroupRowSchema,
    rowNumberOf: (group) => group.rowNumber,
    resolveRow: async (data) => {
      const purchaseDateParsed = parseCsvDate(data.purchaseDate);
      if (!purchaseDateParsed) {
        return { ok: false, message: `purchaseDate: Enter a valid date (got "${data.purchaseDate}")` };
      }
      let dueDateParsed: Date | undefined;
      if (data.dueDate) {
        dueDateParsed = parseCsvDate(data.dueDate);
        if (!dueDateParsed) {
          return { ok: false, message: `dueDate: Enter a valid date (got "${data.dueDate}")` };
        }
      }

      const vendor = await findOrCreateVendorByName(context.activeBusinessId, data.vendorName, {
        phone: data.vendorPhone,
        gstin: data.vendorGstin,
      });

      const resolvedPayments: ImportPurchasePaymentInput[] = [];
      for (const payment of data.payments) {
        const paymentDate = parseCsvDate(payment.date);
        if (!paymentDate) {
          return { ok: false, message: `payments: Enter a valid payment date (got "${payment.date}")` };
        }
        const bankAccount =
          payment.mode === "cash"
            ? await findOrCreateImportBankAccount(context.activeBusinessId, { mode: "cash" })
            : await findOrCreateImportBankAccount(context.activeBusinessId, {
                mode: "bank",
                accountNumber: payment.bankAccountNumber,
                ifsc: payment.bankIfsc,
                bankName: payment.bankName,
              });
        resolvedPayments.push({
          amountMinor: payment.amountMinor,
          mode: payment.mode,
          bankAccountId: String(bankAccount._id),
          paymentDate,
          referenceNote: payment.referenceNote,
        });
      }

      return {
        ok: true,
        resolved: {
          ...data,
          vendorId: String(vendor._id),
          placeOfSupplyState: data.placeOfSupplyState || businessState,
          lineItemDescription: data.lineItemDescription || "Imported purchase",
          purchaseDateParsed,
          dueDateParsed,
          resolvedPayments,
        },
      };
    },
    insertRow: async (resolved) => {
      const created = await importPurchase({
        businessId: context.activeBusinessId,
        vendorId: resolved.vendorId,
        docNumber: resolved.docNumber,
        purchaseDate: resolved.purchaseDateParsed,
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
        payments: resolved.resolvedPayments,
        createdByUserId: context.membership.userId,
      });
      if (!created.ok) return { ok: false, message: importErrorMessage(created.reason) };
      return { ok: true };
    },
  });

  revalidatePath("/purchases");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} purchase(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
