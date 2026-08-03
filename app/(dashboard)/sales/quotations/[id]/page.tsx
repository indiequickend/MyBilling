import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findQuotationById } from "@/lib/db/queries/quotations";
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

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "quotations", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view quotations.</p>;
  }

  const quotation = await findQuotationById(id, context.activeBusinessId);
  if (!quotation) notFound();

  const business = await findBusinessById(context.activeBusinessId);
  const fieldDefs = business?.documentCustomFieldDefs?.quotation ?? [];
  const customFieldEntries = fieldDefs
    .map((def) => ({ label: def.label, value: quotation.customFieldValues?.[def.key] }))
    .filter((e) => e.value !== undefined && e.value !== "");

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Quotation date</p>
              <p className="font-medium">{new Date(quotation.quotationDate).toLocaleDateString()}</p>
            </div>
            {quotation.validUntil ? (
              <div>
                <p className="text-sm text-muted-foreground">Valid until</p>
                <p className="font-medium">{new Date(quotation.validUntil).toLocaleDateString()}</p>
              </div>
            ) : null}
            {quotation.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-medium">{quotation.referenceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{quotation.placeOfSupplyState}</p>
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
              {quotation.lineItems.map((li, i) => (
                <TableRow key={i}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell>{li.hsnOrSac ?? "—"}</TableCell>
                  <TableCell>
                    {li.quantity} {li.unit}
                  </TableCell>
                  <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(li.unitPriceMinor)}</TableCell>
                  <TableCell className="font-tabular tabular-nums">
                    {li.taxRatePercent}% (₹{minorToRupeesString(li.cgstMinor + li.sgstMinor + li.igstMinor)})
                  </TableCell>
                  <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(li.totalMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{minorToRupeesString(quotation.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(quotation.totalTaxMinor)}</span>
            </div>
            {quotation.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(quotation.discountAmountMinor)}</span>
              </div>
            ) : null}
            {quotation.roundOff && quotation.roundOffAmountMinor !== 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <span>₹{minorToRupeesString(quotation.roundOffAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(quotation.grandTotalMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {quotation.notes || quotation.terms ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {quotation.notes ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quotation.notes}</p>
                </div>
              ) : null}
              {quotation.terms ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Terms</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{quotation.terms}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
