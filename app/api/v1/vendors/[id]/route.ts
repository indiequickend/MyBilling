import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { vendorSchema } from "@/lib/validation/vendors";
import { findVendorById, updateVendor } from "@/lib/db/queries/vendors";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "vendors", "view");
    const { id } = await params;
    const vendor = await findVendorById(id, context.businessId);
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "vendors", "edit");
    const { id } = await params;
    const body = await request.json();
    const parsed = vendorSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await updateVendor(id, context.businessId, parsed.data);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ vendor: result.vendor });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
