import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { getBillWiseForParty } from "@/lib/db/queries/payments";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { minorToRupeesString } from "@/lib/utils/money";
import { PartyDetailTabs } from "@/components/dashboard/PartyDetailTabs";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/Table";

export default async function CustomerBillWisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const bills = await getBillWiseForParty("customer", id, context.activeBusinessId);

  return (
    <div>
      <PartyDetailTabs basePath={`/customers/${id}`} active="bill-wise" />

      {bills.length === 0 ? (
        <p className="text-sm text-slate-500">No bill-wise payment matches yet.</p>
      ) : (
        <div className="space-y-6">
          {bills.map((bill) => (
            <div key={bill.invoiceId} className="rounded-md border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Link
                  href={`/sales/invoices/${bill.invoiceId}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {bill.docNumber ?? "Draft"}
                </Link>
                <span className="text-sm text-slate-500">{INVOICE_STATUS_LABELS[bill.status]}</span>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-4 text-sm text-slate-600">
                <span>Total: ₹{minorToRupeesString(bill.grandTotalMinor)}</span>
                <span>Paid: ₹{minorToRupeesString(bill.amountPaidMinor)}</span>
                <span>Balance: ₹{minorToRupeesString(bill.balanceMinor)}</span>
              </div>
              {bill.payments.length > 0 ? (
                <Table>
                  <Thead>
                    <Th>Date</Th>
                    <Th>Mode</Th>
                    <Th>Amount</Th>
                  </Thead>
                  <Tbody>
                    {bill.payments.map((p) => (
                      <Tr key={p.paymentId}>
                        <Td>{new Date(p.date).toLocaleDateString()}</Td>
                        <Td>{PAYMENT_MODE_LABELS[p.mode]}</Td>
                        <Td>₹{minorToRupeesString(p.amountMinor)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <p className="text-sm text-slate-500">No payments recorded against this bill.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
