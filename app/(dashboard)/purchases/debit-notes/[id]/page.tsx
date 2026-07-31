import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findDebitNoteById } from "@/lib/db/queries/debitNotes";
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
import { CancelDebitNoteButton, DeleteDebitNoteButton } from "./DebitNoteActionButtons";

const CANCELLABLE_STATUSES = ["draft", "issued"];
const DELETABLE_STATUSES = ["draft", "cancelled"];
const STATUS_LABELS = { draft: "Draft", issued: "Issued", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = { draft: "outline", issued: "success", cancelled: "danger" } as const;

export default async function DebitNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "debit_notes", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view debit notes.</p>;
  }

  const debitNote = await findDebitNoteById(id, context.activeBusinessId);
  if (!debitNote) notFound();

  const canCancel =
    can(context.membership, "debit_notes", "edit") && CANCELLABLE_STATUSES.includes(debitNote.status);
  const canDelete =
    can(context.membership, "debit_notes", "delete") && DELETABLE_STATUSES.includes(debitNote.status);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{debitNote.docNumber ?? "Draft debit note"}</h1>
            <Badge variant={STATUS_BADGE_VARIANT[debitNote.status]}>{STATUS_LABELS[debitNote.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{debitNote.vendorSnapshot.displayName}</p>
          <Link
            href={`/purchases/${String(debitNote.linkedPurchaseId)}`}
            className="text-sm text-primary hover:underline"
          >
            Against purchase
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {debitNote.docNumber ? (
            <Button variant="outline" asChild>
              <a href={`/api/purchases/debit-notes/${id}/pdf`}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          ) : null}
          {canCancel ? <CancelDebitNoteButton debitNoteId={id} /> : null}
          {canDelete ? <DeleteDebitNoteButton debitNoteId={id} /> : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Debit note date</p>
              <p className="font-medium">{new Date(debitNote.debitNoteDate).toLocaleDateString()}</p>
            </div>
            {debitNote.reason ? (
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{debitNote.reason}</p>
              </div>
            ) : null}
            <div>
              <p className="text-sm text-muted-foreground">Place of supply</p>
              <p className="font-medium">{debitNote.placeOfSupplyState}</p>
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
              {debitNote.lineItems.map((li, i) => (
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
              <span>₹{minorToRupeesString(debitNote.subtotalMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax (CGST+SGST/IGST)</span>
              <span>₹{minorToRupeesString(debitNote.totalTaxMinor)}</span>
            </div>
            {debitNote.discountAmountMinor > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-₹{minorToRupeesString(debitNote.discountAmountMinor)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Grand total</span>
              <span>₹{minorToRupeesString(debitNote.grandTotalMinor)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
