import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";
import { toCsv, toExcelBuffer, type ExportColumn } from "@/lib/reports/export";
import { renderPdf } from "@/lib/pdf/render";
import { TabularReportDocument } from "@/lib/pdf/tabularReportTemplate";

export type ReportDateRangeParams = { dateFrom?: Date; dateTo?: Date };

export function parseDateRangeFromSearchParams(searchParams: URLSearchParams): ReportDateRangeParams {
  const dateFromRaw = searchParams.get("dateFrom");
  const dateToRaw = searchParams.get("dateTo");
  return {
    dateFrom: dateFromRaw ? new Date(dateFromRaw) : undefined,
    dateTo: dateToRaw ? new Date(dateToRaw) : undefined,
  };
}

function formatDateRangeLabel(params: ReportDateRangeParams): string | undefined {
  if (!params.dateFrom && !params.dateTo) return undefined;
  const from = params.dateFrom ? params.dateFrom.toLocaleDateString("en-IN") : "…";
  const to = params.dateTo ? params.dateTo.toLocaleDateString("en-IN") : "…";
  return `${from} – ${to}`;
}

/**
 * Shared body for every app/api/reports/<name>/export/route.ts handler — parses format +
 * date-range query params, checks the given permission, fetches rows via the same function the
 * report's page.tsx uses, and returns the matching CSV/Excel/PDF binary response. Follows the
 * same Route Handler + binary-NextResponse pattern as app/api/sales/invoices/[id]/pdf/route.ts.
 * `fetchRows` lets each report adapt its own query function's signature (paginated, multi-arg,
 * single-date, etc.) to this shared (businessId, dateRange) => rows[] shape.
 */
export async function handleReportExport<T>(
  request: Request,
  moduleAction: { module: ModuleKey; action: ActionKey },
  columns: ExportColumn<T>[],
  fetchRows: (businessId: string, params: ReportDateRangeParams) => Promise<T[]>,
  title: string,
): Promise<NextResponse> {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, moduleAction.module, moduleAction.action);

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "csv";
    const dateRange = parseDateRangeFromSearchParams(url.searchParams);

    const rows = await fetchRows(context.businessId, dateRange);
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
        dateRangeLabel: formatDateRangeLabel(dateRange),
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
