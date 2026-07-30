import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { computeGstr1 } from "@/lib/db/queries/gstReports";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { toCsv, toExcelBuffer, type ExportColumn } from "@/lib/reports/export";
import { renderPdf } from "@/lib/pdf/render";
import { TabularReportDocument } from "@/lib/pdf/tabularReportTemplate";
import { minorToRupeesString } from "@/lib/utils/money";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

type FlatRow = {
  section: string;
  reference: string;
  taxRatePercent?: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

/** Flattens every GSTR-1 section into one exportable table (a "Section" column distinguishes
 * them) — CSV/Excel/PDF export needs a single row shape, not the page's per-section tables. */
function flattenGstr1(data: Awaited<ReturnType<typeof computeGstr1>>): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const r of data.b2b) {
    rows.push({
      section: "B2B",
      reference: `${r.docNumber ?? "—"} (${r.customerGstin})`,
      taxRatePercent: r.taxRatePercent,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  for (const r of data.b2cl) {
    rows.push({
      section: "B2C Large",
      reference: r.docNumber ?? "—",
      taxRatePercent: r.taxRatePercent,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  for (const r of data.b2cs) {
    rows.push({
      section: "B2C Small",
      reference: r.placeOfSupplyState,
      taxRatePercent: r.taxRatePercent,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  for (const r of data.exports) {
    rows.push({
      section: "Exports",
      reference: r.docNumber ?? "—",
      taxRatePercent: r.taxRatePercent,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  for (const r of data.nilRated) {
    rows.push({
      section: "Nil Rated",
      reference: r.placeOfSupplyState,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalMinor: r.taxableAmountMinor,
    });
  }
  for (const r of data.creditDebitNotes) {
    rows.push({
      section: "Credit/Debit Notes",
      reference: r.docNumber ?? "—",
      taxRatePercent: r.taxRatePercent,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  for (const r of data.hsnSummary) {
    rows.push({
      section: "HSN Summary",
      reference: r.hsnOrSac,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: r.cgstMinor,
      sgstMinor: r.sgstMinor,
      igstMinor: r.igstMinor,
      totalMinor: r.totalMinor,
    });
  }
  return rows;
}

const columns: ExportColumn<FlatRow>[] = [
  { key: "section", header: "Section", value: (r) => r.section },
  { key: "reference", header: "Reference", value: (r) => r.reference },
  { key: "taxRatePercent", header: "Rate %", value: (r) => r.taxRatePercent ?? "" },
  { key: "taxableAmountMinor", header: "Taxable Amount", value: (r) => minorToRupeesString(r.taxableAmountMinor) },
  { key: "cgstMinor", header: "CGST", value: (r) => minorToRupeesString(r.cgstMinor) },
  { key: "sgstMinor", header: "SGST", value: (r) => minorToRupeesString(r.sgstMinor) },
  { key: "igstMinor", header: "IGST", value: (r) => minorToRupeesString(r.igstMinor) },
  { key: "totalMinor", header: "Total", value: (r) => minorToRupeesString(r.totalMinor) },
];

export async function GET(request: Request, { params }: { params: Promise<{ period: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "gst", "export");

    const { period } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";

    const data = await computeGstr1(context.businessId, period);
    const rows = flattenGstr1(data);
    const fileBase = `gstr1-${period}`;

    if (format === "csv") {
      const csv = toCsv(rows, columns);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const buffer = await toExcelBuffer(rows, columns, "GSTR-1");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const business = await findBusinessById(context.businessId);
      const document = TabularReportDocument({
        title: `GSTR-1 — ${period}`,
        businessName: business?.name ?? "",
        rows,
        columns,
      });
      const pdf = await renderPdf(document);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
