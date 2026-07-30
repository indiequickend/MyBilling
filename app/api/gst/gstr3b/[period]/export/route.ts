import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { computeGstr3b } from "@/lib/db/queries/gstReports";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { toCsv, toExcelBuffer, type ExportColumn } from "@/lib/reports/export";
import { renderPdf } from "@/lib/pdf/render";
import { TabularReportDocument } from "@/lib/pdf/tabularReportTemplate";
import { minorToRupeesString } from "@/lib/utils/money";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

type FlatRow = {
  label: string;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

/** Flattens every GSTR-3B section (3.1/3.2/4) into one exportable table. */
function flattenGstr3b(data: Awaited<ReturnType<typeof computeGstr3b>>): FlatRow[] {
  const rows: FlatRow[] = [
    {
      label: "3.1(a) Outward Taxable Supplies",
      taxableAmountMinor: data.outwardTaxableSupplies.taxableAmountMinor,
      cgstMinor: data.outwardTaxableSupplies.cgstMinor,
      sgstMinor: data.outwardTaxableSupplies.sgstMinor,
      igstMinor: data.outwardTaxableSupplies.igstMinor,
    },
    {
      label: "3.1(b) Zero Rated (Exports)",
      taxableAmountMinor: data.zeroRatedAndExempt.zeroRatedMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
    },
    {
      label: "3.1(c) Nil Rated / Exempt",
      taxableAmountMinor: data.zeroRatedAndExempt.nilExemptMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
    },
    {
      label: "3.1(d) Inward Supplies Liable to Reverse Charge",
      taxableAmountMinor: data.inwardReverseCharge.taxableAmountMinor,
      cgstMinor: data.inwardReverseCharge.cgstMinor,
      sgstMinor: data.inwardReverseCharge.sgstMinor,
      igstMinor: data.inwardReverseCharge.igstMinor,
    },
  ];
  for (const r of data.interstateToUnregistered) {
    rows.push({
      label: `3.2 Interstate to Unregistered — ${r.placeOfSupplyState}`,
      taxableAmountMinor: r.taxableAmountMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: r.igstMinor,
    });
  }
  rows.push(
    {
      label: "4. ITC Available",
      taxableAmountMinor: 0,
      cgstMinor: data.itc.availableCgstMinor,
      sgstMinor: data.itc.availableSgstMinor,
      igstMinor: data.itc.availableIgstMinor,
    },
    {
      label: "4. ITC Reversed (Debit Notes)",
      taxableAmountMinor: 0,
      cgstMinor: data.itc.reversedCgstMinor,
      sgstMinor: data.itc.reversedSgstMinor,
      igstMinor: data.itc.reversedIgstMinor,
    },
    {
      label: "4. Net ITC",
      taxableAmountMinor: 0,
      cgstMinor: data.itc.netCgstMinor,
      sgstMinor: data.itc.netSgstMinor,
      igstMinor: data.itc.netIgstMinor,
    },
  );
  return rows;
}

const columns: ExportColumn<FlatRow>[] = [
  { key: "label", header: "Section", value: (r) => r.label },
  { key: "taxableAmountMinor", header: "Taxable Amount", value: (r) => minorToRupeesString(r.taxableAmountMinor) },
  { key: "cgstMinor", header: "CGST", value: (r) => minorToRupeesString(r.cgstMinor) },
  { key: "sgstMinor", header: "SGST", value: (r) => minorToRupeesString(r.sgstMinor) },
  { key: "igstMinor", header: "IGST", value: (r) => minorToRupeesString(r.igstMinor) },
];

export async function GET(request: Request, { params }: { params: Promise<{ period: string }> }) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "gst", "export");

    const { period } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";

    const data = await computeGstr3b(context.businessId, period);
    const rows = flattenGstr3b(data);
    const fileBase = `gstr3b-${period}`;

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
      const buffer = await toExcelBuffer(rows, columns, "GSTR-3B");
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
        title: `GSTR-3B — ${period}`,
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
