import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { productSchema, productListQuerySchema } from "@/lib/validation/products";
import { createProduct, listProducts } from "@/lib/db/queries/products";

/** productSchema's batches carry expiryDate as a raw date string (from the request body); the
 * query layer stores it as a real Date — same conversion the dashboard's product form does. */
function batchesWithDates(batches: { batchNumber: string; expiryDate?: string }[]) {
  return batches.map((b) => ({
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
  }));
}

export async function GET(request: Request) {
  try {
    const context = await requireApiV1Context(request, "products", "view");
    const { searchParams } = new URL(request.url);
    const parsed = productListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { q, categoryId, groupId, type, tab, page } = parsed.data;
    const result = await listProducts(context.businessId, { search: q, categoryId, groupId, type, tab, page });
    return NextResponse.json(result);
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiV1Context(request, "products", "create");
    const body = await request.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await createProduct({
      businessId: context.businessId,
      ...parsed.data,
      batches: batchesWithDates(parsed.data.batches),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ product: result.product }, { status: 201 });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
