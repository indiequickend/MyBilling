import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findPaymentById } from "@/lib/db/queries/payments";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { findCustomerById } from "@/lib/db/queries/customers";
import { findVendorById } from "@/lib/db/queries/vendors";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { PaymentReceiptDocument } from "@/lib/pdf/paymentReceiptTemplate";
import { renderPdf } from "@/lib/pdf/render";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "payments", "view");

    const { id } = await params;
    const payment = await findPaymentById(id, context.businessId);
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const [bankAccount, party, linkedDocument] = await Promise.all([
      findBankAccountById(String(payment.bankAccountId), context.businessId),
      payment.partyType === "customer"
        ? findCustomerById(String(payment.partyId), context.businessId)
        : payment.partyType === "vendor"
          ? findVendorById(String(payment.partyId), context.businessId)
          : null,
      payment.linkedDocumentType === "invoice"
        ? findInvoiceById(String(payment.linkedDocumentId), context.businessId)
        : payment.linkedDocumentType === "purchase"
          ? findPurchaseById(String(payment.linkedDocumentId), context.businessId)
          : null,
    ]);

    const document = await PaymentReceiptDocument({
      payment,
      business: {
        name: business.name,
        brandName: business.brandName,
        gstin: business.gstin,
        addresses: business.addresses,
      },
      bankAccount: bankAccount
        ? {
            name: bankAccount.name,
            accountNumber: bankAccount.accountNumber ?? undefined,
            ifsc: bankAccount.ifsc ?? undefined,
          }
        : null,
      partyName: party?.displayName ?? undefined,
      linkedDocumentNumber: linkedDocument?.docNumber ?? undefined,
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${payment.docNumber ?? "payment-receipt"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
