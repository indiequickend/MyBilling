import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { getBillWiseForParty } from "@/lib/db/queries/payments";
import { DOCUMENT_STATUS_LABELS } from "@/lib/constants/documents";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { minorToRupeesString } from "@/lib/utils/money";
import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export default async function VendorBillWisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const bills = await getBillWiseForParty("vendor", id, context.activeBusinessId);

  return (
    <div>
      <PartyDetailTabs basePath={`/vendors/${id}`} active="bill-wise" />

      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bill-wise payment matches yet.</p>
      ) : (
        <div className="space-y-4">
          {bills.map((bill) => (
            <Card key={bill.documentId}>
              <CardContent>
                <div className="mb-2 flex items-center justify-between">
                  <Link href={`/purchases/${bill.documentId}`} className="font-medium hover:underline">
                    {bill.docNumber ?? "Draft"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {DOCUMENT_STATUS_LABELS[bill.status]}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <span>Total: ₹{minorToRupeesString(bill.grandTotalMinor)}</span>
                  <span>Paid: ₹{minorToRupeesString(bill.amountPaidMinor)}</span>
                  <span>Balance: ₹{minorToRupeesString(bill.balanceMinor)}</span>
                </div>
                {bill.payments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.payments.map((p) => (
                        <TableRow key={p.paymentId}>
                          <TableCell>{new Date(p.date).toLocaleDateString()}</TableCell>
                          <TableCell>{PAYMENT_MODE_LABELS[p.mode]}</TableCell>
                          <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(p.amountMinor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments recorded against this bill.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
