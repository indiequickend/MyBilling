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
      // A product with variants contributes one search result per variant (e.g.
      // "Darjeeling Homestay MAP") instead of one result for the bare product, since
      // the bare product has no sellable price/HSN of its own in that case.
      products: products.flatMap((p) => {
        const stockTracking = {
          enabled: p.stockTracking?.enabled ?? false,
          batchTracked: p.stockTracking?.batchTracked ?? false,
          serialTracked: p.stockTracking?.serialTracked ?? false,
        };
        const batches = (p.batches ?? [])
          .filter((b) => !b.deletedAt)
          .map((b) => ({
            id: String(b._id),
            label: b.expiryDate
              ? `${b.batchNumber} (exp. ${new Date(b.expiryDate).toLocaleDateString()})`
              : b.batchNumber,
          }));
        if (p.variants.length === 0) {
          return [
            {
              id: String(p._id),
              variantId: "",
              name: p.name,
              type: p.type,
              hsnOrSac: p.hsnOrSac ?? "",
              unit: p.unit ?? "PCS",
              sellingPriceMinor: p.sellingPriceMinor ?? 0,
              priceIsTaxInclusive: p.priceIsTaxInclusive,
              taxRatePercent: p.taxRatePercent,
              barcode: p.barcode ?? "",
              stockTracking,
              batches,
            },
          ];
        }
        return p.variants.map((v) => ({
          id: String(p._id),
          variantId: String(v._id),
          name: `${p.name} ${v.name}`,
          type: p.type,
          hsnOrSac: p.hsnOrSac ?? "",
          unit: p.unit ?? "PCS",
          sellingPriceMinor: v.sellingPriceOverrideMinor ?? p.sellingPriceMinor ?? 0,
          priceIsTaxInclusive: p.priceIsTaxInclusive,
          taxRatePercent: p.taxRatePercent,
          barcode: v.barcode ?? p.barcode ?? "",
          stockTracking,
          batches,
        }));
      }),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
