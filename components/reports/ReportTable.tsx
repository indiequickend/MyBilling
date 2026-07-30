import Link from "next/link";
import { Download } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Button } from "@/components/ui/button";
import type { ExportColumn } from "@/lib/reports/export";

export type ReportTableColumn<T> = ExportColumn<T> & {
  /** Optional custom on-screen rendering (e.g. a Link or Badge); falls back to the plain
   * exported value when omitted, so CSV/Excel/PDF and the on-screen table never disagree. */
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
};

/**
 * Renders a report's on-screen table from the exact same columns/rows used for CSV/Excel/PDF
 * export (via lib/reports/exportHandler.ts) — the on-screen table and every exported file are
 * guaranteed to match, satisfying build_phases.md Phase 8's verify step by construction.
 */
export function ReportTable<T>({
  columns,
  rows,
  exportBaseHref,
  exportQuery,
  emptyMessage = "No data for this range.",
  footer,
}: {
  columns: ReportTableColumn<T>[];
  rows: T[];
  /** e.g. "/api/reports/profit-and-loss/export" — omit to hide export buttons. */
  exportBaseHref?: string;
  /** Query string (no leading "&"/"?") appended after `format=...`, e.g. "dateFrom=...&dateTo=...". */
  exportQuery?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
}) {
  const qs = exportQuery ? `&${exportQuery}` : "";

  return (
    <div>
      {exportBaseHref ? (
        <div className="mb-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`${exportBaseHref}?format=csv${qs}`}>
              <Download data-icon="inline-start" />
              CSV
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${exportBaseHref}?format=xlsx${qs}`}>
              <Download data-icon="inline-start" />
              Excel
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${exportBaseHref}?format=pdf${qs}`}>
              <Download data-icon="inline-start" />
              PDF
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmptyState colSpan={columns.length} message={emptyMessage} /> : null}
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                    {c.render ? c.render(row) : String(c.value(row))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {footer ? <TableFooter>{footer}</TableFooter> : null}
        </Table>
      </div>
    </div>
  );
}
