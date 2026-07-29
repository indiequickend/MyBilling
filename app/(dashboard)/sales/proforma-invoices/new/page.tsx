import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCustomers } from "@/lib/db/queries/customers";
import { listSignatures } from "@/lib/db/queries/signatures";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { ProformaInvoiceForm } from "../ProformaInvoiceForm";

export default async function NewProformaInvoicePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "proforma_invoices", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create proforma invoices.</p>;
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

  const conversionPrefs = business.preferences.document.conversions;
  const defaultSignature = signatures.find((s) => s.isDefault);
  const defaultBank = bankAccounts.find((b) => b.isDefault);
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + conversionPrefs.defaultDueDateDays);

  const fieldDefs = (business.documentCustomFieldDefs?.proforma_invoice ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New proforma invoice</h1>
      <ProformaInvoiceForm
        mode="create"
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
          customerId: "",
          proformaDate: new Date().toISOString().slice(0, 10),
          dueDate: dueDate.toISOString().slice(0, 10),
          referenceNumber: "",
          placeOfSupplyState: businessState,
          reverseCharge: false,
          roundOff: conversionPrefs.roundOff,
          notes: defaultNoteTemplate?.body ?? "",
          terms: defaultTermTemplate?.body ?? "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          signatureId: defaultSignature ? String(defaultSignature._id) : "",
          bankAccountId: defaultBank ? String(defaultBank._id) : "",
          discountType: conversionPrefs.defaultDiscountType,
          discountValue: "0",
          discountTarget: "total",
          customFieldValues: {},
          lineItems: [],
        }}
      />
    </div>
  );
}
