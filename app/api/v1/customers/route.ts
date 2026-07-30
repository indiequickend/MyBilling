import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { customerSchema, customerListQuerySchema } from "@/lib/validation/customers";
import { createCustomer, listCustomers } from "@/lib/db/queries/customers";

export async function GET(request: Request) {
  try {
    const context = await requireApiV1Context(request, "customers", "view");
    const { searchParams } = new URL(request.url);
    const parsed = customerListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { q, groupId, tab, page } = parsed.data;
    const result = await listCustomers(context.businessId, { search: q, groupId, tab, page });
    return NextResponse.json(result);
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiV1Context(request, "customers", "create");
    const body = await request.json();
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await createCustomer({ businessId: context.businessId, ...parsed.data });
    if (!result.ok) {
      return NextResponse.json({ error: "One or more group ids are invalid" }, { status: 400 });
    }
    return NextResponse.json({ customer: result.customer }, { status: 201 });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
