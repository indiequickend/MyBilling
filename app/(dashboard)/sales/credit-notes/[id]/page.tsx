import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findCreditNoteById } from "@/lib/db/queries/creditNotes";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CancelCreditNoteButton, DeleteCreditNoteButton } from "./CreditNoteActionButtons";

const CANCELLABLE_STATUSES = ["draft", "issued"];
const DELETABLE_STATUSES = ["draft", "cancelled"];
const STATUS_LABELS = { draft: "Draft", issued: "Issued", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = { draft: "outline", issued: "success", cancelled: "danger" } as const;

export default async function CreditNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_credit_notes", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view credit notes.</p>;
  }

  const creditNote = await findCreditNoteById(id, context.activeBusinessId);
  if (!creditNote) notFound();

  const canCancel =
    can(context.membership, "sales_credit_notes", "edit") && CANCELLABLE_STATUSES.includes(creditNote.status);
  const canDelete =
    can(context.membership, "sales_credit_notes", "delete") && DELETABLE_STATUSES.includes(creditNote.status);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{creditNote.docNumber ?? "Draft credit note"}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[creditNote.status]}>{STATUS_LABELS[creditNote.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{creditNote.customerSnapshot.displayName}</p>
          <Link
            href={`/sales/invoices/${String(creditNote.linkedInvoiceId)}`}
            className="text-sm text-primary hover:underline"
          >
            Against invoice
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {creditNote.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/sales/credit-notes/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canCancel ? <CancelCreditNoteButton creditNoteId={id} /> : null}
          {canDelete ? <DeleteCreditNoteButton creditNoteId={id} /> : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Credit note date</p>
              <p className="font-medium">{new Date(creditNote.creditNoteDate).toLocaleDateString()}</p>
            </div>
            {creditNote.reason ? (
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{creditNote.reason}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{creditNote.placeOfSupplyState}</p>
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
              {creditNote.lineItems.map((li, i) => (
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
              <span>₹{minorToRupeesString(creditNote.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(creditNote.totalTaxMinor)}</span>
            </div>
            {creditNote.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(creditNote.discountAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(creditNote.grandTotalMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
