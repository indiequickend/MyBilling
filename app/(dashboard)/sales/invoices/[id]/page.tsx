import { redirect, notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { listPaymentsForDocument, listAvailableAdvances } from "@/lib/db/queries/payments";
import { listBankAccounts, findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { findSignatureById } from "@/lib/db/queries/signatures";
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
import { applyAdvanceToInvoiceAction } from "../actions";

const PAYABLE_STATUSES = ["pending", "partially_paid"];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view invoices.</p>;
  }

  const invoice = await findInvoiceById(id, context.activeBusinessId);
  if (!invoice) notFound();

  const canViewPaymentReceipt = can(context.membership, "payments", "view");

  const [payments, bankAccounts, business, signature, bankAccount, availableAdvances] = await Promise.all([
    listPaymentsForDocument("invoice", id, context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
    findBusinessById(context.activeBusinessId),
    invoice.signatureId ? findSignatureById(String(invoice.signatureId), context.activeBusinessId) : null,
    invoice.bankAccountId
      ? findBankAccountById(String(invoice.bankAccountId), context.activeBusinessId)
      : null,
    listAvailableAdvances("customer", String(invoice.customerId), context.activeBusinessId, "in"),
  ]);

  const fieldDefs = business?.documentCustomFieldDefs?.invoice ?? [];
  const customFieldEntries = fieldDefs
    .map((def) => ({ label: def.label, value: invoice.customFieldValues?.[def.key] }))
    .filter((e) => e.value !== undefined && e.value !== "");

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Invoice date</p>
              <p className="font-medium">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
            </div>
            {invoice.dueDate ? (
              <div>
                <p className="text-sm text-muted-foreground">Due date</p>
                <p className="font-medium">{new Date(invoice.dueDate).toLocaleDateString()}</p>
              </div>
            ) : null}
            {invoice.referenceNumber ? (
              <div>
                <p className="text-sm text-muted-foreground">Reference</p>
                <p className="font-medium">{invoice.referenceNumber}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{invoice.placeOfSupplyState}</p>
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
              {invoice.lineItems.map((li, i) => (
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
              <span>₹{minorToRupeesString(invoice.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(invoice.totalTaxMinor)}</span>
            </div>
            {invoice.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(invoice.discountAmountMinor)}</span>
              </div>
            ) : null}
            {invoice.roundOff && invoice.roundOffAmountMinor !== 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <span>₹{minorToRupeesString(invoice.roundOffAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(invoice.grandTotalMinor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span>₹{minorToRupeesString(invoice.amountPaidMinor)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Balance due</span>
              <span>₹{minorToRupeesString(invoice.grandTotalMinor - invoice.amountPaidMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {invoice.notes || invoice.terms ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {invoice.notes ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Notes</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
                </div>
              ) : null}
              {invoice.terms ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Terms</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{invoice.terms}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {bankAccount || signature ? (
        <Card>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {bankAccount ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Bank details</p>
                  <p className="text-sm text-muted-foreground">{bankAccount.name}</p>
                  {bankAccount.upiId ? (
                    <p className="text-sm text-muted-foreground">UPI: {bankAccount.upiId}</p>
                  ) : null}
                </div>
              ) : null}
              {signature ? (
                <div>
                  <p className="mb-1 text-sm font-medium">Signature</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signature.imageUrl} alt={signature.name} className="h-16 w-32 object-contain" />
                </div>
              ) : null}
            </div>
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
                    <TableCell>₹{minorToRupeesString(p.amountMinor)}</TableCell>
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

      {PAYABLE_STATUSES.includes(invoice.status) &&
      can(context.membership, "payments", "create") &&
      availableAdvances.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Apply an advance payment</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplyAdvanceForm
              targetIdFieldName="invoiceId"
              targetId={id}
              advances={availableAdvances}
              action={applyAdvanceToInvoiceAction}
            />
          </CardContent>
        </Card>
      ) : null}

      {PAYABLE_STATUSES.includes(invoice.status) && can(context.membership, "payments", "create") ? (
        <Card className="bg-accent-mint text-accent-mint-foreground ring-0">
          <CardHeader>
            <CardTitle className="text-accent-mint-foreground">Record a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordPaymentForm
              invoiceId={id}
              bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
