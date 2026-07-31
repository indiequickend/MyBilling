import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findDebitNoteById } from "@/lib/db/queries/debitNotes";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { DebitNoteDocument } from "@/lib/pdf/debitNoteTemplate";
import { renderPdf } from "@/lib/pdf/render";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "debit_notes", "view");

    const { id } = await params;
    const debitNote = await findDebitNoteById(id, context.businessId);
    if (!debitNote) return NextResponse.json({ error: "Debit note not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const linkedPurchase = await findPurchaseById(String(debitNote.linkedPurchaseId), context.businessId);

    const document = await DebitNoteDocument({
      debitNote,
      business: {
        name: business.name,
        brandName: business.brandName,
        gstin: business.gstin,
        addresses: business.addresses,
      },
      linkedPurchaseDocNumber: linkedPurchase?.docNumber ?? undefined,
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${debitNote.docNumber ?? "debit-note-draft"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
