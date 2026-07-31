import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProformaInvoiceById } from "@/lib/db/queries/proformaInvoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProformaInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "proforma_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view proforma invoices.</p>;
  }

  const proformaInvoice = await findProformaInvoiceById(id, context.activeBusinessId);
  if (!proformaInvoice) notFound();

  const business = await findBusinessById(context.activeBusinessId);
  const fieldDefs = business?.documentCustomFieldDefs?.proforma_invoice ?? [];
  const customFieldEntries = fieldDefs
    .map((def) => ({ label: def.label, value: proformaInvoice.customFieldValues?.[def.key] }))
    .filter((e) => e.value !== undefined && e.value !== "");

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Proforma date</p>
              <p className="font-medium">{new Date(proformaInvoice.proformaDate).toLocaleDateString()}</p>
            </div>
            {proformaInvoice.dueDate ? (
              <div>
                <p className="text-sm text-muted-foreground">Due date</p>
                <p className="font-medium">{new Date(proformaInvoice.dueDate).toLocaleDateString()}</p>
              </div>
            ) : null}
            {proformaInvoice.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-medium">{proformaInvoice.referenceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{proformaInvoice.placeOfSupplyState}</p>
            </div>
            {customFieldEntries.map((e) => (
              <div key={e.label}>
                <p className="text-sm text-muted-foreground">{e.label}</p>
                <p className="font-medium">{String(e.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>HSN/SAC</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proformaInvoice.lineItems.map((li, i) => (
                <TableRow key={i}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell>{li.hsnOrSac ?? "—"}</TableCell>
                  <TableCell>
                    {li.quantity} {li.unit}
                  </TableCell>
                  <TableCell>₹{minorToRupeesString(li.unitPriceMinor)}</TableCell>
                  <TableCell>
                    {li.taxRatePercent}% (₹{minorToRupeesString(li.cgstMinor + li.sgstMinor + li.igstMinor)})
                  </TableCell>
                  <TableCell>₹{minorToRupeesString(li.totalMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{minorToRupeesString(proformaInvoice.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(proformaInvoice.totalTaxMinor)}</span>
            </div>
            {proformaInvoice.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(proformaInvoice.discountAmountMinor)}</span>
              </div>
            ) : null}
            {proformaInvoice.roundOff && proformaInvoice.roundOffAmountMinor !== 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <span>₹{minorToRupeesString(proformaInvoice.roundOffAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(proformaInvoice.grandTotalMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {proformaInvoice.notes || proformaInvoice.terms ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {proformaInvoice.notes ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{proformaInvoice.notes}</p>
                </div>
              ) : null}
              {proformaInvoice.terms ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Terms</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{proformaInvoice.terms}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
