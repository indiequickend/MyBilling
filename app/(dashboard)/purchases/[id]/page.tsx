import { redirect, notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { listPaymentsForDocument, listAvailableAdvances } from "@/lib/db/queries/payments";
import { listBankAccounts, findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordPaymentForm } from "./RecordPaymentForm";
import { ApplyAdvanceForm } from "@/components/payments/ApplyAdvanceForm";
import { applyAdvanceToPurchaseAction } from "../actions";

const PAYABLE_STATUSES = ["pending", "partially_paid"];

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchases", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view purchases.</p>;
  }

  const purchase = await findPurchaseById(id, context.activeBusinessId);
  if (!purchase) notFound();

  const canViewPaymentReceipt = can(context.membership, "payments", "view");

  const [payments, bankAccounts, business, bankAccount, availableAdvances] = await Promise.all([
    listPaymentsForDocument("purchase", id, context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
    findBusinessById(context.activeBusinessId),
    purchase.bankAccountId
      ? findBankAccountById(String(purchase.bankAccountId), context.activeBusinessId)
      : null,
    listAvailableAdvances("vendor", String(purchase.vendorId), context.activeBusinessId, "out"),
  ]);

  const trackItcEligibility = business?.preferences.document.purchases.trackItcEligibility ?? false;
  const fieldDefs = business?.documentCustomFieldDefs?.purchase ?? [];
  const customFieldEntries = fieldDefs
    .map((def) => ({ label: def.label, value: purchase.customFieldValues?.[def.key] }))
    .filter((e) => e.value !== undefined && e.value !== "");

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Purchase date</p>
              <p className="font-medium">{new Date(purchase.purchaseDate).toLocaleDateString()}</p>
            </div>
            {purchase.dueDate ? (
              <div>
                <p className="text-sm text-muted-foreground">Due date</p>
                <p className="font-medium">{new Date(purchase.dueDate).toLocaleDateString()}</p>
              </div>
            ) : null}
            {purchase.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-medium">{purchase.referenceNumber}</p>
              </div>
            ) : null}
            {purchase.vendorInvoiceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Vendor invoice #</p>
                <p className="font-medium">{purchase.vendorInvoiceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{purchase.placeOfSupplyState}</p>
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
                {trackItcEligibility ? <TableHead>ITC</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.lineItems.map((li, i) => (
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
                  {trackItcEligibility ? (
                    <TableCell>
                      <Badge variant={li.itcEligible ? "success" : "outline"}>
                        {li.itcEligible ? "Eligible" : "Not eligible"}
                      </Badge>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{minorToRupeesString(purchase.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(purchase.totalTaxMinor)}</span>
            </div>
            {purchase.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(purchase.discountAmountMinor)}</span>
              </div>
            ) : null}
            {purchase.roundOff && purchase.roundOffAmountMinor !== 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <span>₹{minorToRupeesString(purchase.roundOffAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(purchase.grandTotalMinor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span>₹{minorToRupeesString(purchase.amountPaidMinor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Balance due</span>
              <span>₹{minorToRupeesString(purchase.grandTotalMinor - purchase.amountPaidMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {purchase.notes || purchase.terms ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {purchase.notes ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchase.notes}</p>
                </div>
              ) : null}
              {purchase.terms ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Terms</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{purchase.terms}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {bankAccount ? (
        <Card>
          <CardContent>
            <p className="mb-1 text-sm font-medium">Bank details</p>
            <p className="text-sm text-muted-foreground">{bankAccount.name}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {canViewPaymentReceipt ? <TableHead>Receipt</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={String(p._id)}>
                    <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                    <TableCell>{PAYMENT_MODE_LABELS[p.mode]}</TableCell>
                    <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(p.amountMinor)}</TableCell>
                    <TableCell>
                      <Badge variant={p.voidedAt ? "outline" : "success"}>
                        {p.voidedAt ? "Voided" : "Recorded"}
                      </Badge>
                    </TableCell>
                    {canViewPaymentReceipt ? (
                      <TableCell>
                        {p.voidedAt ? (
                          "—"
                        ) : (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/api/payments/${String(p._id)}/pdf`}>
                              <Download data-icon="inline-start" />
                              Receipt
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {PAYABLE_STATUSES.includes(purchase.status) &&
      can(context.membership, "payments", "create") &&
      availableAdvances.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Apply an advance payment</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplyAdvanceForm
              targetIdFieldName="purchaseId"
              targetId={id}
              advances={availableAdvances}
              action={applyAdvanceToPurchaseAction}
            />
          </CardContent>
        </Card>
      ) : null}

      {PAYABLE_STATUSES.includes(purchase.status) && can(context.membership, "payments", "create") ? (
        <Card className="bg-accent-mint text-accent-mint-foreground ring-0">
          <CardHeader>
            <CardTitle className="text-accent-mint-foreground">Record a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordPaymentForm
              purchaseId={id}
              bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
