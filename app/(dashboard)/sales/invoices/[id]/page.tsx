import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { listPaymentsForDocument } from "@/lib/db/queries/payments";
import { listBankAccounts, findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { findSignatureById } from "@/lib/db/queries/signatures";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/Table";
import { RecordPaymentForm } from "./RecordPaymentForm";

const PAYABLE_STATUSES = ["pending", "partially_paid"];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "view")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to view invoices.</p>;
  }

  const invoice = await findInvoiceById(id, context.activeBusinessId);
  if (!invoice) notFound();

  const [payments, bankAccounts, business, signature, bankAccount] = await Promise.all([
    listPaymentsForDocument("invoice", id, context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
    findBusinessById(context.activeBusinessId),
    invoice.signatureId ? findSignatureById(String(invoice.signatureId), context.activeBusinessId) : null,
    invoice.bankAccountId
      ? findBankAccountById(String(invoice.bankAccountId), context.activeBusinessId)
      : null,
  ]);

  const fieldDefs = business?.documentCustomFieldDefs?.invoice ?? [];
  const customFieldEntries = fieldDefs
    .map((def) => ({ label: def.label, value: invoice.customFieldValues?.[def.key] }))
    .filter((e) => e.value !== undefined && e.value !== "");

  return (
    <div className="max-w-4xl space-y-8">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-slate-500">Invoice date</p>
          <p className="font-medium text-slate-900">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
        </div>
        {invoice.dueDate ? (
          <div>
            <p className="text-slate-500">Due date</p>
            <p className="font-medium text-slate-900">{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
        ) : null}
        {invoice.referenceNumber ? (
          <div>
            <p className="text-slate-500">Reference</p>
            <p className="font-medium text-slate-900">{invoice.referenceNumber}</p>
          </div>
        ) : null}
        <div>
          <p className="text-slate-500">Place of supply</p>
          <p className="font-medium text-slate-900">{invoice.placeOfSupplyState}</p>
        </div>
      </div>

      {customFieldEntries.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 text-sm">
          {customFieldEntries.map((e) => (
            <div key={e.label}>
              <p className="text-slate-500">{e.label}</p>
              <p className="font-medium text-slate-900">{String(e.value)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Table>
        <Thead>
          <Th>Description</Th>
          <Th>HSN/SAC</Th>
          <Th>Qty</Th>
          <Th>Unit price</Th>
          <Th>Tax</Th>
          <Th>Total</Th>
        </Thead>
        <Tbody>
          {invoice.lineItems.map((li, i) => (
            <Tr key={i}>
              <Td>{li.description}</Td>
              <Td>{li.hsnOrSac ?? "—"}</Td>
              <Td>
                {li.quantity} {li.unit}
              </Td>
              <Td>₹{minorToRupeesString(li.unitPriceMinor)}</Td>
              <Td>
                {li.taxRatePercent}% (₹{minorToRupeesString(li.cgstMinor + li.sgstMinor + li.igstMinor)})
              </Td>
              <Td>₹{minorToRupeesString(li.totalMinor)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>₹{minorToRupeesString(invoice.subtotalMinor)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tax (CGST+SGST/IGST)</span>
          <span>₹{minorToRupeesString(invoice.totalTaxMinor)}</span>
        </div>
        {invoice.discountAmountMinor > 0 ? (
          <div className="flex justify-between">
            <span className="text-slate-500">Discount</span>
            <span>-₹{minorToRupeesString(invoice.discountAmountMinor)}</span>
          </div>
        ) : null}
        {invoice.roundOff && invoice.roundOffAmountMinor !== 0 ? (
          <div className="flex justify-between">
            <span className="text-slate-500">Round off</span>
            <span>₹{minorToRupeesString(invoice.roundOffAmountMinor)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
          <span>Grand total</span>
          <span>₹{minorToRupeesString(invoice.grandTotalMinor)}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Paid</span>
          <span>₹{minorToRupeesString(invoice.amountPaidMinor)}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Balance due</span>
          <span>₹{minorToRupeesString(invoice.grandTotalMinor - invoice.amountPaidMinor)}</span>
        </div>
      </div>

      {invoice.notes || invoice.terms ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {invoice.notes ? (
            <div>
              <p className="mb-1 font-medium text-slate-700">Notes</p>
              <p className="whitespace-pre-wrap text-slate-600">{invoice.notes}</p>
            </div>
          ) : null}
          {invoice.terms ? (
            <div>
              <p className="mb-1 font-medium text-slate-700">Terms</p>
              <p className="whitespace-pre-wrap text-slate-600">{invoice.terms}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {bankAccount || signature ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {bankAccount ? (
            <div>
              <p className="mb-1 font-medium text-slate-700">Bank details</p>
              <p className="text-slate-600">{bankAccount.name}</p>
              {bankAccount.upiId ? <p className="text-slate-600">UPI: {bankAccount.upiId}</p> : null}
            </div>
          ) : null}
          {signature ? (
            <div>
              <p className="mb-1 font-medium text-slate-700">Signature</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signature.imageUrl} alt={signature.name} className="h-16 w-32 object-contain" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-700">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Date</Th>
              <Th>Mode</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {payments.map((p) => (
                <Tr key={String(p._id)}>
                  <Td>{new Date(p.paymentDate).toLocaleDateString()}</Td>
                  <Td>{PAYMENT_MODE_LABELS[p.mode]}</Td>
                  <Td>₹{minorToRupeesString(p.amountMinor)}</Td>
                  <Td>{p.voidedAt ? "Voided" : "Recorded"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {PAYABLE_STATUSES.includes(invoice.status) && can(context.membership, "payments", "create") ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Record a payment</h2>
          <RecordPaymentForm
            invoiceId={id}
            bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
          />
        </div>
      ) : null}
    </div>
  );
}
