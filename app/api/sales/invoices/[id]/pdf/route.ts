import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { findSignatureById } from "@/lib/db/queries/signatures";
import { InvoiceDocument } from "@/lib/pdf/invoiceTemplate";
import { renderPdf } from "@/lib/pdf/render";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "sales_invoices", "view");

    const { id } = await params;
    const invoice = await findInvoiceById(id, context.businessId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const [bankAccount, signature] = await Promise.all([
      invoice.bankAccountId
        ? findBankAccountById(String(invoice.bankAccountId), context.businessId)
        : null,
      invoice.signatureId ? findSignatureById(String(invoice.signatureId), context.businessId) : null,
    ]);

    const document = await InvoiceDocument({
      invoice,
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
            upiId: bankAccount.upiId ?? undefined,
          }
        : null,
      signature: signature ? { imageUrl: signature.imageUrl, name: signature.name } : null,
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.docNumber ?? "invoice-draft"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
