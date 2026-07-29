import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseOrderById } from "@/lib/db/queries/purchaseOrders";
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

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchase_orders", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view purchase orders.</p>;
  }

  const purchaseOrder = await findPurchaseOrderById(id, context.activeBusinessId);
  if (!purchaseOrder) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Order date</p>
              <p className="font-medium">{new Date(purchaseOrder.orderDate).toLocaleDateString()}</p>
            </div>
            {purchaseOrder.expectedDeliveryDate ? (
              <div>
                <p className="text-sm text-muted-foreground">Expected delivery</p>
                <p className="font-medium">
                  {new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString()}
                </p>
              </div>
            ) : null}
            {purchaseOrder.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-medium">{purchaseOrder.referenceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{purchaseOrder.placeOfSupplyState}</p>
            </div>
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
              {purchaseOrder.lineItems.map((li, i) => (
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
              <span>₹{minorToRupeesString(purchaseOrder.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(purchaseOrder.totalTaxMinor)}</span>
            </div>
            {purchaseOrder.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(purchaseOrder.discountAmountMinor)}</span>
              </div>
            ) : null}
            {purchaseOrder.roundOff && purchaseOrder.roundOffAmountMinor !== 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <span>₹{minorToRupeesString(purchaseOrder.roundOffAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(purchaseOrder.grandTotalMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {purchaseOrder.notes || purchaseOrder.terms ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {purchaseOrder.notes ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchaseOrder.notes}</p>
                </div>
              ) : null}
              {purchaseOrder.terms ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Terms</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchaseOrder.terms}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
