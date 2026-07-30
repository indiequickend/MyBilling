import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findEInvoiceDataByInvoice } from "@/lib/db/queries/eInvoiceData";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { jsonDownloadResponse } from "@/lib/api/jsonDownload";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET-only — returns the cached e-invoice IRP JSON payload as a downloadable file, for manual
 * upload to an IRP (no outbound call is ever made from this app — no real IRN is ever generated). */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "gst", "export");

    const { invoiceId } = await params;
    const [eInvoiceData, invoice] = await Promise.all([
      findEInvoiceDataByInvoice(invoiceId, context.businessId),
      findInvoiceById(invoiceId, context.businessId),
    ]);
    if (!eInvoiceData?.generatedPayload) {
      return NextResponse.json({ error: "No e-invoice payload has been generated for this invoice" }, { status: 404 });
    }

    return jsonDownloadResponse(eInvoiceData.generatedPayload, `einv-${invoice?.docNumber ?? invoiceId}.json`);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
