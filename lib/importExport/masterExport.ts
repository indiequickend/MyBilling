import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";
import { toCsv, toExcelBuffer, type ExportColumn } from "@/lib/reports/export";
import { renderPdf } from "@/lib/pdf/render";
import { TabularReportDocument } from "@/lib/pdf/tabularReportTemplate";

export type MasterExportParams = { search?: string; tab?: "active" | "deleted" };

export function parseMasterExportParams(searchParams: URLSearchParams): MasterExportParams {
  const tab = searchParams.get("tab");
  return {
    search: searchParams.get("search") ?? undefined,
    tab: tab === "deleted" ? "deleted" : "active",
  };
}

/**
 * Bulk-export handler for masters (Products/Customers/Vendors/Price Lists) — parallel to (not a
 * modification of) lib/reports/exportHandler.ts's `handleReportExport`, since that handler's
 * `fetchRows(businessId, dateRange)` signature is report-shaped; masters need "everything matching
 * this search/tab filter" instead of a date range. Reuses the same toCsv/toExcelBuffer/renderPdf
 * machinery — no new CSV/Excel-writing code.
 */
export async function handleMasterExport<T>(
  request: Request,
  moduleAction: { module: ModuleKey; action: ActionKey },
  columns: ExportColumn<T>[],
  fetchRows: (businessId: string, params: MasterExportParams) => Promise<T[]>,
  title: string,
): Promise<NextResponse> {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, moduleAction.module, moduleAction.action);

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";
    const params = parseMasterExportParams(url.searchParams);

    const rows = await fetchRows(context.businessId, params);
    const fileBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

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
      const buffer = await toExcelBuffer(rows, columns, title);
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
        title,
        businessName: business?.name ?? "",
        dateRangeLabel: undefined,
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
