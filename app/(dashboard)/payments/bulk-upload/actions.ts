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
import { paymentImportRowSchema, type PaymentImportRowInput } from "@/lib/validation/payments";
import { parseCsvDate } from "@/lib/validation/shared";
import { findOrCreateCustomerByName } from "@/lib/db/queries/customers";
import { findOrCreateVendorByName } from "@/lib/db/queries/vendors";
import { findOrCreateImportBankAccount } from "@/lib/db/queries/bankAccounts";
import {
  importStandalonePayment,
  type ImportStandalonePaymentFailureReason,
} from "@/lib/db/queries/payments";
import type { BulkUploadState } from "@/components/importExport/BulkUploadForm";

const REQUIRED_COLUMNS = ["voucherNumber", "direction", "amountMinor", "mode", "paymentDate"] as const;

async function requireDashboardContext() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  return context as typeof context & {
    activeBusinessId: string;
    membership: NonNullable<typeof context.membership>;
  };
}

function importErrorMessage(reason: ImportStandalonePaymentFailureReason): string {
  switch (reason) {
    case "party_not_found":
      return "Customer/vendor could not be found or created.";
    case "invalid_bank_account":
      return "Could not resolve a bank/cash account for this payment.";
    case "duplicate_voucher_number":
      return "A payment with this voucher number already exists.";
    case "already_recorded_on_document":
      return "Skipped: this payment (same party, amount and date) is already recorded on an imported invoice/purchase.";
  }
}

type ResolvedPaymentRow = PaymentImportRowInput & {
  partyId?: string;
  bankAccountId: string;
  paymentDateParsed: Date;
};

export async function bulkUploadPaymentsAction(
  _prev: BulkUploadState,
  formData: FormData,
): Promise<BulkUploadState> {
  const context = await requireDashboardContext();
  requirePermission(context.membership, "payments", "create");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload." };
  }
  if (file.size > BULK_IMPORT_MAX_FILE_BYTES) {
    return { error: "File is too large — the limit is 5 MB." };
  }

  const text = await file.text();
  const parsedCsv = parseCsvRows(text, REQUIRED_COLUMNS);
  if (!parsedCsv.ok) return { error: parsedCsv.error };

  const result = await runBulkImport<PaymentImportRowInput, ResolvedPaymentRow>({
    rows: parsedCsv.rows,
    rowSchema: paymentImportRowSchema,
    resolveRow: async (data) => {
      const paymentDateParsed = parseCsvDate(data.paymentDate);
      if (!paymentDateParsed) {
        return { ok: false, message: `paymentDate: Enter a valid date (got "${data.paymentDate}")` };
      }

      let partyId: string | undefined;
      if (data.partyType === "customer" && data.partyName) {
        const customer = await findOrCreateCustomerByName(context.activeBusinessId, data.partyName);
        partyId = String(customer._id);
      } else if (data.partyType === "vendor" && data.partyName) {
        const vendor = await findOrCreateVendorByName(context.activeBusinessId, data.partyName);
        partyId = String(vendor._id);
      }

      const bankAccount =
        data.mode === "cash"
          ? await findOrCreateImportBankAccount(context.activeBusinessId, { mode: "cash" })
          : await findOrCreateImportBankAccount(context.activeBusinessId, {
              mode: "bank",
              accountNumber: data.bankAccountNumber,
              ifsc: data.bankIfsc,
              bankName: data.bankName,
            });

      return {
        ok: true,
        resolved: {
          ...data,
          partyId,
          bankAccountId: String(bankAccount._id),
          paymentDateParsed,
        },
      };
    },
    insertRow: async (resolved) => {
      const created = await importStandalonePayment({
        businessId: context.activeBusinessId,
        voucherNumber: resolved.voucherNumber,
        partyType: resolved.partyId ? resolved.partyType : undefined,
        partyId: resolved.partyId,
        direction: resolved.direction,
        amountMinor: resolved.amountMinor,
        mode: resolved.mode,
        bankAccountId: resolved.bankAccountId,
        paymentDate: resolved.paymentDateParsed,
        referenceNote: resolved.referenceNote,
        createdByUserId: context.membership.userId,
      });
      if (!created.ok) return { ok: false, message: importErrorMessage(created.reason) };
      return { ok: true };
    },
  });

  revalidatePath("/payments");
  return {
    success: `Imported ${result.insertedCount} of ${result.totalRows} payment(s)${
      result.skippedCount ? `; ${result.skippedCount} skipped` : ""
    }.`,
    rowErrors: result.rowErrors.length > 0 ? result.rowErrors : undefined,
  };
}
