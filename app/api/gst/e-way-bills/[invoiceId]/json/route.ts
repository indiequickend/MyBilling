import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { findEwayBillDataByInvoice } from "@/lib/db/queries/ewayBillData";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { jsonDownloadResponse } from "@/lib/api/jsonDownload";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

/** GET-only — returns the cached e-way bill JSON payload as a downloadable file, for manual
 * upload to the NIC portal (no outbound call is ever made from this app). */
export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "gst", "export");

    const { invoiceId } = await params;
    const [ewayBillData, invoice] = await Promise.all([
      findEwayBillDataByInvoice(invoiceId, context.businessId),
      findInvoiceById(invoiceId, context.businessId),
    ]);
    if (!ewayBillData?.generatedPayload) {
      return NextResponse.json({ error: "No e-way bill has been generated for this invoice" }, { status: 404 });
    }

    return jsonDownloadResponse(ewayBillData.generatedPayload, `ewb-${invoice?.docNumber ?? invoiceId}.json`);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
