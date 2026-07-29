import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { listCustomers } from "@/lib/db/queries/customers";
import { listSignatures } from "@/lib/db/queries/signatures";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { InvoiceForm } from "../../InvoiceForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "pending", "partially_paid"];

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit invoices.</p>;
  }

  const invoice = await findInvoiceById(id, context.activeBusinessId);
  if (!invoice) notFound();
  if (!EDITABLE_STATUSES.includes(invoice.status)) {
    redirect(`/sales/invoices/${id}`);
  }

  const [customers, signatures, bankAccounts, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listSignatures(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listNoteTermTemplates(context.activeBusinessId, { docType: "invoice", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "invoice", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";
  const fieldDefs = (business.documentCustomFieldDefs?.invoice ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  const lineItems: LineItemRow[] = invoice.lineItems.map((li) => ({
    productId: li.productId ? String(li.productId) : "",
    variantId: li.variantId ? String(li.variantId) : "",
    description: li.description,
    hsnOrSac: li.hsnOrSac ?? "",
    unit: li.unit ?? "PCS",
    quantity: String(li.quantity),
    unitPriceMinor: minorToRupeesString(li.unitPriceMinor),
    discountType: li.discountType,
    discountValue:
      li.discountType === "percentage" ? String(li.discountValue) : minorToRupeesString(li.discountValue),
    taxRatePercent: String(li.taxRatePercent),
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit invoice</h1>
      <InvoiceForm
        mode="edit"
        invoiceId={id}
        editableStatus={invoice.status as "draft" | "pending" | "partially_paid"}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        signatures={signatures.map((s) => ({ id: String(s._id), name: s.name }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        customFieldDefs={fieldDefs}
        businessState={businessState}
        defaultValues={{
          customerId: String(invoice.customerId),
          invoiceDate: new Date(invoice.invoiceDate).toISOString().slice(0, 10),
          dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : "",
          referenceNumber: invoice.referenceNumber ?? "",
          placeOfSupplyState: invoice.placeOfSupplyState,
          reverseCharge: invoice.reverseCharge,
          roundOff: invoice.roundOff,
          notes: invoice.notes ?? "",
          terms: invoice.terms ?? "",
          noteTemplateId: invoice.noteTemplateId ? String(invoice.noteTemplateId) : "",
          termTemplateId: invoice.termTemplateId ? String(invoice.termTemplateId) : "",
          signatureId: invoice.signatureId ? String(invoice.signatureId) : "",
          bankAccountId: invoice.bankAccountId ? String(invoice.bankAccountId) : "",
          discountType: invoice.discountType,
          discountValue:
            invoice.discountType === "percentage"
              ? String(invoice.discountValue)
              : minorToRupeesString(invoice.discountValue),
          discountTarget: invoice.discountTarget,
          customFieldValues: invoice.customFieldValues ?? {},
          lineItems,
        }}
      />
    </div>
  );
}
