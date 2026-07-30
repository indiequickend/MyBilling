import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { customerSchema } from "@/lib/validation/customers";
import { findCustomerById, updateCustomer } from "@/lib/db/queries/customers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "customers", "view");
    const { id } = await params;
    const customer = await findCustomerById(id, context.businessId);
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ customer });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "customers", "edit");
    const { id } = await params;
    const body = await request.json();
    const parsed = customerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await updateCustomer(id, context.businessId, parsed.data);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ customer: result.customer });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
