import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findCreditNoteById } from "@/lib/db/queries/creditNotes";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { CreditNoteDocument } from "@/lib/pdf/creditNoteTemplate";
import { renderPdf } from "@/lib/pdf/render";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "sales_credit_notes", "view");

    const { id } = await params;
    const creditNote = await findCreditNoteById(id, context.businessId);
    if (!creditNote) return NextResponse.json({ error: "Credit note not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const linkedInvoice = await findInvoiceById(String(creditNote.linkedInvoiceId), context.businessId);

    const document = await CreditNoteDocument({
      creditNote,
      business: {
        name: business.name,
        brandName: business.brandName,
        gstin: business.gstin,
        addresses: business.addresses,
      },
      linkedInvoiceDocNumber: linkedInvoice?.docNumber ?? null,
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${creditNote.docNumber ?? "credit-note-draft"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
