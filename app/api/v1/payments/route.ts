import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { objectId } from "@/lib/validation/shared";
import { invoicePaymentSplitSchema } from "@/lib/validation/invoices";
import { listPaymentsTimeline } from "@/lib/db/queries/payments";
import { recordInvoicePayment } from "@/lib/db/queries/invoices";

const paymentsListQuerySchema = z.object({
  bankAccountId: objectId.optional(),
  direction: z.enum(["in", "out"]).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: Request) {
  try {
    const context = await requireApiV1Context(request, "payments", "view");
    const { searchParams } = new URL(request.url);
    const parsed = paymentsListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }
    const { bankAccountId, direction, dateFrom, dateTo, page } = parsed.data;
    const result = await listPaymentsTimeline(context.businessId, {
      bankAccountId,
      direction,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

/** Records payment(s) against an already-finalized invoice — the same operation the dashboard's
 * "Record Payment" action performs (recordInvoicePayment). Recording payments against other
 * document types isn't exposed via the API in this phase. */
const recordPaymentBodySchema = z.object({
  invoiceId: objectId,
  payments: z.array(invoicePaymentSplitSchema).min(1, "At least one payment is required"),
});

export async function POST(request: Request) {
  try {
    const context = await requireApiV1Context(request, "payments", "create");
    const body = await request.json();
    const parsed = recordPaymentBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const result = await recordInvoicePayment(
      parsed.data.invoiceId,
      context.businessId,
      parsed.data.payments.map((p) => ({
        amountMinor: p.amountMinor,
        mode: p.mode,
        bankAccountId: p.bankAccountId,
        paymentDate: new Date(p.paymentDate),
        referenceNote: p.referenceNote,
      })),
      context.createdByUserId,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ invoice: result.invoice, payments: result.payments }, { status: 201 });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
