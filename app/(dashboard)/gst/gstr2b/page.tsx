import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { computeLocalItcSummary } from "@/lib/db/queries/gstReports";
import { getGstReportSnapshot } from "@/lib/db/queries/gstReportSnapshots";
import { minorToRupeesString } from "@/lib/utils/money";
import { GstPeriodFilterBar } from "@/components/gst/GstPeriodFilterBar";
import { ImportGstr2bForm } from "@/components/gst/ImportGstr2bForm";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import type { Gstr2bDiffCategory } from "@/lib/gst/gstr2bReconciliation";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

const DIFF_LABELS: Record<Gstr2bDiffCategory, string> = {
  matched: "Matched",
  value_mismatch: "Value Mismatch",
  missing_in_books: "Missing in Books",
  missing_in_2b: "Missing in GSTR-2B",
};

const DIFF_VARIANTS: Record<Gstr2bDiffCategory, "success" | "warning" | "danger"> = {
  matched: "success",
  value_mismatch: "warning",
  missing_in_books: "warning",
  missing_in_2b: "danger",
};

export default async function Gstr2bPage({
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
  const canEdit = can(context.membership, "gst", "edit");

  const [localItcSummary, snapshot] = await Promise.all([
    computeLocalItcSummary(context.activeBusinessId, period),
    getGstReportSnapshot(context.activeBusinessId, "gstr2b", period),
  ]);

  const computedData = snapshot?.computedData as
    | { diffResults?: import("@/lib/gst/gstr2bReconciliation").Gstr2bDiffRow[] }
    | undefined;
  const diffResults = computedData?.diffResults ?? [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">GSTR-2B Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Compare locally recorded purchases against an imported GSTR-2B export. Only the B2B/B2BA
          sections of the file are read — CDNR/ISD/IMPG sections are rejected, not silently dropped.
        </p>
      </div>

      <div className="mb-6">
        <GstPeriodFilterBar period={period} />
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Local ITC Summary</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor GSTIN</TableHead>
                <TableHead>Rate %</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead>CGST</TableHead>
                <TableHead>SGST</TableHead>
                <TableHead>IGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localItcSummary.length === 0 ? (
                <TableEmptyState colSpan={6} message="No ITC-eligible purchases for this period." />
              ) : null}
              {localItcSummary.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.vendorGstin}</TableCell>
                  <TableCell>{r.taxRatePercent}</TableCell>
                  <TableCell>{minorToRupeesString(r.taxableAmountMinor)}</TableCell>
                  <TableCell>{minorToRupeesString(r.cgstMinor)}</TableCell>
                  <TableCell>{minorToRupeesString(r.sgstMinor)}</TableCell>
                  <TableCell>{minorToRupeesString(r.igstMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {canEdit ? (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Import GSTR-2B</h2>
          <ImportGstr2bForm period={period} />
          {snapshot?.importedFileName ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Last imported: {snapshot.importedFileName} ({new Date(snapshot.computedAt).toLocaleString("en-IN")})
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Reconciliation</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor GSTIN</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Books (Taxable / Tax)</TableHead>
                <TableHead>GSTR-2B (Taxable / Tax)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diffResults.length === 0 ? (
                <TableEmptyState colSpan={5} message="No import for this period yet." />
              ) : null}
              {diffResults.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.vendorGstin}</TableCell>
                  <TableCell>{r.invoiceNumber}</TableCell>
                  <TableCell>
                    <Badge variant={DIFF_VARIANTS[r.category]}>{DIFF_LABELS[r.category]}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.localTaxableValueMinor != null
                      ? `${minorToRupeesString(r.localTaxableValueMinor)} / ${minorToRupeesString(r.localTaxMinor ?? 0)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {r.importedTaxableValueMinor != null
                      ? `${minorToRupeesString(r.importedTaxableValueMinor)} / ${minorToRupeesString(r.importedTaxMinor ?? 0)}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
