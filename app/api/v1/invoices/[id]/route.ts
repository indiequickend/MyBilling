import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { findInvoiceById } from "@/lib/db/queries/invoices";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "sales_invoices", "view");
    const { id } = await params;
    const invoice = await findInvoiceById(id, context.businessId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
