import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { invoicePaymentSplitSchema, invoiceListQuerySchema } from "@/lib/validation/invoices";
import { parseV1InvoiceWriteBody } from "@/lib/api/v1InvoiceBody";
import {
  createInvoice,
  listInvoices,
  type InvoiceWriteInput,
  type InvoicePaymentSplitWriteInput,
} from "@/lib/db/queries/invoices";

/**
 * GET  /api/v1/invoices    — list, same filters as the dashboard's invoice list.
 * POST /api/v1/invoices    — create (draft by default; pass finalize:true to number+finalize it,
 *                            same as the dashboard's "Save"). No CSRF check: Bearer-token auth
 *                            isn't cookie-based, so it isn't CSRF-vulnerable by construction.
 */
export async function GET(request: Request) {
  try {
    const context = await requireApiV1Context(request, "sales_invoices", "view");
    const { searchParams } = new URL(request.url);
    const parsed = invoiceListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { q, customerId, tab, dateFrom, dateTo, page } = parsed.data;
    const result = await listInvoices(context.businessId, {
      search: q,
      customerId,
      tab,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiV1Context(request, "sales_invoices", "create");
    const body: unknown = await request.json();
    const parsed = parseV1InvoiceWriteBody(body, context.businessId);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input: InvoiceWriteInput = parsed.input;
    const paymentsParsed = z
      .array(invoicePaymentSplitSchema)
      .safeParse((body as { payments?: unknown }).payments ?? []);
    if (!paymentsParsed.success) {
      return NextResponse.json(
        { error: paymentsParsed.error.issues[0]?.message ?? "Invalid payments" },
        { status: 400 },
      );
    }
    const finalize = Boolean((body as { finalize?: unknown }).finalize);

    const payments: InvoicePaymentSplitWriteInput[] = paymentsParsed.data.map((p) => ({
      amountMinor: p.amountMinor,
      mode: p.mode,
      bankAccountId: p.bankAccountId,
      paymentDate: new Date(p.paymentDate),
      referenceNote: p.referenceNote,
    }));

    const result = await createInvoice({
      ...input,
      createdByUserId: context.createdByUserId,
      finalize,
      payments: finalize ? payments : undefined,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ invoice: result.invoice }, { status: 201 });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
