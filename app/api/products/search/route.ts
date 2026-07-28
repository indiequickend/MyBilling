import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { searchProductsForInvoice } from "@/lib/db/queries/products";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** Client-side autocomplete for the invoice line-item editor — GET, no CSRF needed (read-only). */
export async function GET(request: Request) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "products", "view");

    const query = new URL(request.url).searchParams.get("q") ?? "";
    const products = await searchProductsForInvoice(context.businessId, query, 20);
    return NextResponse.json({
      products: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        hsnOrSac: p.hsnOrSac ?? "",
        unit: p.unit ?? "PCS",
        sellingPriceMinor: p.sellingPriceMinor,
        priceIsTaxInclusive: p.priceIsTaxInclusive,
        taxRatePercent: p.taxRatePercent,
        barcode: p.barcode ?? "",
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
