import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { PurchaseDocument } from "@/lib/pdf/purchaseTemplate";
import { resolveCustomFieldEntries } from "@/lib/documents/customFields";
import { renderPdf } from "@/lib/pdf/render";
import { pdfContentDisposition } from "@/lib/pdf/filename";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "purchases", "view");

    const { id } = await params;
    const purchase = await findPurchaseById(id, context.businessId);
    if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const bankAccount = purchase.bankAccountId
      ? await findBankAccountById(String(purchase.bankAccountId), context.businessId)
      : null;

    const document = await PurchaseDocument({
      purchase,
      customFields: resolveCustomFieldEntries(business.documentCustomFieldDefs?.purchase, purchase.customFieldValues),
      business: {
        name: business.name,
        brandName: business.brandName,
        logoUrl: business.logoUrl,
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
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition("inline", purchase.docNumber ?? "purchase-draft"),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
