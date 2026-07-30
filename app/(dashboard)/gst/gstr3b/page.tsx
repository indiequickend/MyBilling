import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { computeGstr3b } from "@/lib/db/queries/gstReports";
import { minorToRupeesString } from "@/lib/utils/money";
import { GstPeriodFilterBar } from "@/components/gst/GstPeriodFilterBar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { recomputeGstr3bAction } from "./actions";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function Gstr3bPage({
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
  const data = await computeGstr3b(context.activeBusinessId, period);

  const canEdit = can(context.membership, "gst", "edit");
  const canExport = can(context.membership, "gst", "export");
  const exportBase = `/api/gst/gstr3b/${period}/export`;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">GSTR-3B</h1>
        <p className="text-sm text-muted-foreground">Summary return computed from local documents.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <GstPeriodFilterBar period={period} />
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <form action={recomputeGstr3bAction}>
              <input type="hidden" name="period" value={period} />
              <Button type="submit" variant="outline" size="sm">
                Save Snapshot
              </Button>
            </form>
          ) : null}
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

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">3.1 Outward Supplies &amp; Reverse Charge</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Taxable Value</TableHead>
                <TableHead>CGST</TableHead>
                <TableHead>SGST</TableHead>
                <TableHead>IGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>(a) Outward Taxable Supplies</TableCell>
                <TableCell>{minorToRupeesString(data.outwardTaxableSupplies.taxableAmountMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.outwardTaxableSupplies.cgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.outwardTaxableSupplies.sgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.outwardTaxableSupplies.igstMinor)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(b) Zero Rated (Exports)</TableCell>
                <TableCell>{minorToRupeesString(data.zeroRatedAndExempt.zeroRatedMinor)}</TableCell>
                <TableCell>—</TableCell>
                <TableCell>—</TableCell>
                <TableCell>—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(c) Nil Rated / Exempt</TableCell>
                <TableCell>{minorToRupeesString(data.zeroRatedAndExempt.nilExemptMinor)}</TableCell>
                <TableCell>—</TableCell>
                <TableCell>—</TableCell>
                <TableCell>—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>(d) Inward Liable to Reverse Charge</TableCell>
                <TableCell>{minorToRupeesString(data.inwardReverseCharge.taxableAmountMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.inwardReverseCharge.cgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.inwardReverseCharge.sgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.inwardReverseCharge.igstMinor)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">3.2 Interstate Supplies to Unregistered Persons</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Place of Supply</TableHead>
                <TableHead>Taxable Value</TableHead>
                <TableHead>IGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.interstateToUnregistered.length === 0 ? (
                <TableEmptyState colSpan={3} message="No interstate supplies to unregistered persons this period." />
              ) : null}
              {data.interstateToUnregistered.map((r) => (
                <TableRow key={r.placeOfSupplyState}>
                  <TableCell>{r.placeOfSupplyState}</TableCell>
                  <TableCell>{minorToRupeesString(r.taxableAmountMinor)}</TableCell>
                  <TableCell>{minorToRupeesString(r.igstMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">4. Input Tax Credit</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>CGST</TableHead>
                <TableHead>SGST</TableHead>
                <TableHead>IGST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>ITC Available</TableCell>
                <TableCell>{minorToRupeesString(data.itc.availableCgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.itc.availableSgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.itc.availableIgstMinor)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>ITC Reversed (Debit Notes)</TableCell>
                <TableCell>{minorToRupeesString(data.itc.reversedCgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.itc.reversedSgstMinor)}</TableCell>
                <TableCell>{minorToRupeesString(data.itc.reversedIgstMinor)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Net ITC</TableCell>
                <TableCell className="font-medium">{minorToRupeesString(data.itc.netCgstMinor)}</TableCell>
                <TableCell className="font-medium">{minorToRupeesString(data.itc.netSgstMinor)}</TableCell>
                <TableCell className="font-medium">{minorToRupeesString(data.itc.netIgstMinor)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
