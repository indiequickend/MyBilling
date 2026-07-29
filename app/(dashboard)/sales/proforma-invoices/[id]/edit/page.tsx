import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findProformaInvoiceById } from "@/lib/db/queries/proformaInvoices";
import { listCustomers } from "@/lib/db/queries/customers";
import { listSignatures } from "@/lib/db/queries/signatures";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { ProformaInvoiceForm } from "../../ProformaInvoiceForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "open"];

export default async function EditProformaInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "proforma_invoices", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit proforma invoices.</p>;
  }

  const proformaInvoice = await findProformaInvoiceById(id, context.activeBusinessId);
  if (!proformaInvoice) notFound();
  if (!EDITABLE_STATUSES.includes(proformaInvoice.status)) {
    redirect(`/sales/proforma-invoices/${id}`);
  }

  const [customers, signatures, bankAccounts, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listSignatures(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "active"),
    listNoteTermTemplates(context.activeBusinessId, { docType: "proforma_invoice", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "proforma_invoice", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";

  const fieldDefs = (business.documentCustomFieldDefs?.proforma_invoice ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  const lineItems: LineItemRow[] = proformaInvoice.lineItems.map((li) => ({
    productId: li.productId ? String(li.productId) : "",
    variantId: li.variantId ? String(li.variantId) : "",
    description: li.description,
    notes: li.notes ?? "",
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
      <h1 className="mb-6 text-lg font-semibold">Edit proforma invoice</h1>
      <ProformaInvoiceForm
        mode="edit"
        proformaInvoiceId={id}
        editableStatus={proformaInvoice.status as "draft" | "open"}
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
          customerId: String(proformaInvoice.customerId),
          proformaDate: new Date(proformaInvoice.proformaDate).toISOString().slice(0, 10),
          dueDate: proformaInvoice.dueDate
            ? new Date(proformaInvoice.dueDate).toISOString().slice(0, 10)
            : "",
          referenceNumber: proformaInvoice.referenceNumber ?? "",
          placeOfSupplyState: proformaInvoice.placeOfSupplyState,
          reverseCharge: proformaInvoice.reverseCharge,
          roundOff: proformaInvoice.roundOff,
          notes: proformaInvoice.notes ?? "",
          terms: proformaInvoice.terms ?? "",
          noteTemplateId: proformaInvoice.noteTemplateId ? String(proformaInvoice.noteTemplateId) : "",
          termTemplateId: proformaInvoice.termTemplateId ? String(proformaInvoice.termTemplateId) : "",
          signatureId: proformaInvoice.signatureId ? String(proformaInvoice.signatureId) : "",
          bankAccountId: proformaInvoice.bankAccountId ? String(proformaInvoice.bankAccountId) : "",
          discountType: proformaInvoice.discountType,
          discountValue:
            proformaInvoice.discountType === "percentage"
              ? String(proformaInvoice.discountValue)
              : minorToRupeesString(proformaInvoice.discountValue),
          discountTarget: proformaInvoice.discountTarget,
          customFieldValues: proformaInvoice.customFieldValues ?? {},
          lineItems,
        }}
      />
    </div>
  );
}
