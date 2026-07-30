import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { productSchema } from "@/lib/validation/products";
import { findProductById, updateProduct } from "@/lib/db/queries/products";

/** productSchema's batches carry expiryDate as a raw date string (from the request body); the
 * query layer stores it as a real Date — same conversion the dashboard's product form does. */
function batchesWithDates(batches: { batchNumber: string; expiryDate?: string }[]) {
  return batches.map((b) => ({
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
  }));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "products", "view");
    const { id } = await params;
    const product = await findProductById(id, context.businessId);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "products", "edit");
    const { id } = await params;
    const body = await request.json();
    const parsed = productSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await updateProduct(id, context.businessId, {
      ...parsed.data,
      batches: parsed.data.batches ? batchesWithDates(parsed.data.batches) : undefined,
    });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ product: result.product });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
