import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { computeGstr1 } from "@/lib/db/queries/gstReports";
import { getGstReportSnapshot } from "@/lib/db/queries/gstReportSnapshots";
import { minorToRupeesString } from "@/lib/utils/money";
import { GstPeriodFilterBar } from "@/components/gst/GstPeriodFilterBar";
import { MarkGstr1FiledForm } from "@/components/gst/MarkGstr1FiledForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { recomputeGstr1Action } from "./actions";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function Section({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableEmptyState colSpan={columns.length} message="No entries for this period." />
            ) : null}
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default async function Gstr1Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  const [data, snapshot] = await Promise.all([
    computeGstr1(context.activeBusinessId, period),
    getGstReportSnapshot(context.activeBusinessId, "gstr1", period),
  ]);

  const canEdit = can(context.membership, "gst", "edit");
  const canExport = can(context.membership, "gst", "export");
  const exportBase = `/api/gst/gstr1/${period}/export`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">GSTR-1</h1>
          <p className="text-sm text-muted-foreground">Outward supplies computed from local documents.</p>
        </div>
        {snapshot?.manualFiledFlag ? <Badge variant="success">Filed</Badge> : <Badge variant="outline">Not Filed</Badge>}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <GstPeriodFilterBar period={period} />
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <form action={recomputeGstr1Action}>
              <input type="hidden" name="period" value={period} />
              <Button type="submit" variant="outline" size="sm">
                Save Snapshot
              </Button>
            </form>
          ) : null}
          {canEdit ? <MarkGstr1FiledForm period={period} filed={!!snapshot?.manualFiledFlag} /> : null}
          {canExport ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`${exportBase}?format=csv`}>
                  <Download data-icon="inline-start" />
                  CSV
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`${exportBase}?format=xlsx`}>
                  <Download data-icon="inline-start" />
                  Excel
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`${exportBase}?format=pdf`}>
                  <Download data-icon="inline-start" />
                  PDF
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Taxable Value</p>
          <p className="text-lg font-semibold">{minorToRupeesString(data.totals.taxableValueMinor)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">CGST + SGST</p>
          <p className="text-lg font-semibold">
            {minorToRupeesString(data.totals.cgstMinor + data.totals.sgstMinor)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">IGST</p>
          <p className="text-lg font-semibold">{minorToRupeesString(data.totals.igstMinor)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Liability</p>
          <p className="text-lg font-semibold">{minorToRupeesString(data.totals.totalMinor)}</p>
        </div>
      </div>

      <Section
        title="B2B"
        columns={["Invoice #", "Date", "Customer GSTIN", "Customer", "POS", "Rate %", "Taxable", "Total"]}
        rows={data.b2b.map((r) => [
          r.docNumber ?? "—",
          r.invoiceDate.toLocaleDateString("en-IN"),
          r.customerGstin,
          r.customerName,
          r.placeOfSupplyState,
          r.taxRatePercent,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="B2C Large"
        columns={["Invoice #", "Date", "POS", "Rate %", "Taxable", "Total"]}
        rows={data.b2cl.map((r) => [
          r.docNumber ?? "—",
          r.invoiceDate.toLocaleDateString("en-IN"),
          r.placeOfSupplyState,
          r.taxRatePercent,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="B2C Small"
        columns={["POS", "Rate %", "Taxable", "Total"]}
        rows={data.b2cs.map((r) => [
          r.placeOfSupplyState,
          r.taxRatePercent,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="Exports"
        columns={["Invoice #", "Date", "Customer", "Rate %", "Taxable", "Total"]}
        rows={data.exports.map((r) => [
          r.docNumber ?? "—",
          r.invoiceDate.toLocaleDateString("en-IN"),
          r.customerName,
          r.taxRatePercent,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="Nil Rated / Exempt"
        columns={["POS", "Taxable"]}
        rows={data.nilRated.map((r) => [r.placeOfSupplyState, minorToRupeesString(r.taxableAmountMinor)])}
      />
      <Section
        title="Credit / Debit Notes"
        columns={["Note #", "Date", "Customer", "POS", "Rate %", "Taxable", "Total"]}
        rows={data.creditDebitNotes.map((r) => [
          r.docNumber ?? "—",
          r.noteDate.toLocaleDateString("en-IN"),
          r.customerName,
          r.placeOfSupplyState,
          r.taxRatePercent,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="HSN Summary"
        columns={["HSN/SAC", "Taxable", "CGST", "SGST", "IGST", "Total"]}
        rows={data.hsnSummary.map((r) => [
          r.hsnOrSac,
          minorToRupeesString(r.taxableAmountMinor),
          minorToRupeesString(r.cgstMinor),
          minorToRupeesString(r.sgstMinor),
          minorToRupeesString(r.igstMinor),
          minorToRupeesString(r.totalMinor),
        ])}
      />
      <Section
        title="Documents Issued"
        columns={["Nature", "From", "To", "Total", "Cancelled", "Net Issued"]}
        rows={data.documentsIssued.map((r) => [
          r.natureOfDocument,
          r.fromNumber ?? "—",
          r.toNumber ?? "—",
          r.totalNumber,
          r.cancelled,
          r.netIssued,
        ])}
      />

      <div className="mt-4">
        <Link href="/gst/gstr1/tracker" className="text-sm text-primary underline-offset-4 hover:underline">
          View Filing Tracker
        </Link>
      </div>
    </div>
  );
}
