import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { requireApiV1Context, apiV1ErrorResponse } from "@/lib/api/v1Context";
import { parseV1InvoiceWriteBody } from "@/lib/api/v1InvoiceBody";
import { findInvoiceById, updateInvoice } from "@/lib/db/queries/invoices";

/**
 * GET   /api/v1/invoices/:id — fetch one invoice.
 * PATCH /api/v1/invoices/:id — edit an invoice. Takes the same body as POST /api/v1/invoices
 *                              (full header + lineItems + discount; it replaces them, it isn't a
 *                              field-level merge). Never finalizes a draft or records payments —
 *                              `finalize`/`payments` are ignored here. Fields the REST API doesn't
 *                              expose (custom header fields, project) keep their current values.
 *                              Same rules as the dashboard edit: draft/pending/partially_paid/paid
 *                              only, stock re-synced, total ≥ amount paid, customer locked once
 *                              paid, date stays in the same numbering period.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "sales_invoices", "view");
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const invoice = await findInvoiceById(id, context.businessId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}

const NOT_FOUND_REASONS = new Set(["not_found"]);
const CONFLICT_REASONS = new Set([
  "not_editable",
  "total_below_paid",
  "customer_locked_by_payments",
  "date_changes_series",
  "insufficient_stock",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireApiV1Context(request, "sales_invoices", "edit");
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const existing = await findInvoiceById(id, context.businessId);
    if (!existing || existing.deletedAt) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = parseV1InvoiceWriteBody(body, context.businessId);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await updateInvoice(
      id,
      context.businessId,
      {
        ...parsed.input,
        customFieldValues: (existing.customFieldValues as Record<string, unknown> | undefined) ?? {},
        projectId: existing.projectId ? String(existing.projectId) : undefined,
      },
      context.createdByUserId,
    );
    if (!result.ok) {
      const status = NOT_FOUND_REASONS.has(result.reason) ? 404 : CONFLICT_REASONS.has(result.reason) ? 409 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ invoice: result.invoice });
  } catch (err) {
    return apiV1ErrorResponse(err);
  }
}
