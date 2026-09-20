import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findPurchaseOrderById } from "@/lib/db/queries/purchaseOrders";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { PurchaseOrderDocument } from "@/lib/pdf/purchaseOrderTemplate";
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
    requirePermission(context.membership, "purchase_orders", "view");

    const { id } = await params;
    const purchaseOrder = await findPurchaseOrderById(id, context.businessId);
    if (!purchaseOrder) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const document = await PurchaseOrderDocument({
      purchaseOrder,
      customFields: resolveCustomFieldEntries(business.documentCustomFieldDefs?.purchase_order, purchaseOrder.customFieldValues),
      business: {
        name: business.name,
        brandName: business.brandName,
        logoUrl: business.logoUrl,
        gstin: business.gstin,
        addresses: business.addresses,
      },
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition("inline", purchaseOrder.docNumber ?? "purchase-order-draft"),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
