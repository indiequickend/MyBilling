import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findSalesOrderById } from "@/lib/db/queries/salesOrders";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { SalesOrderDocument } from "@/lib/pdf/salesOrderTemplate";
import { renderPdf } from "@/lib/pdf/render";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET, no CSRF needed (read-only) — returns a binary application/pdf response, which a Server
 * Action can't do, hence a Route Handler here instead of the usual action pattern. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "sales_orders", "view");

    const { id } = await params;
    const salesOrder = await findSalesOrderById(id, context.businessId);
    if (!salesOrder) return NextResponse.json({ error: "Sales order not found" }, { status: 404 });

    const business = await findBusinessById(context.businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const document = await SalesOrderDocument({
      salesOrder,
      business: {
        name: business.name,
        brandName: business.brandName,
        gstin: business.gstin,
        addresses: business.addresses,
      },
    });

    const pdf = await renderPdf(document);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${salesOrder.docNumber ?? "sales-order-draft"}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
