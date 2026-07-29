import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCustomers } from "@/lib/db/queries/customers";
import { listSignatures } from "@/lib/db/queries/signatures";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findQuotationById } from "@/lib/db/queries/quotations";
import { findSalesOrderById } from "@/lib/db/queries/salesOrders";
import { mapLineItemsForConversion, extractConvertibleHeader } from "@/lib/documents/conversion";
import { InvoiceForm } from "../InvoiceForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create invoices.</p>;
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

  const salesPrefs = business.preferences.document.sales;
  const defaultSignature = signatures.find((s) => s.isDefault);
  const defaultBank = bankAccounts.find((b) => b.isDefault);
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + salesPrefs.defaultDueDateDays);

  const fieldDefs = (business.documentCustomFieldDefs?.invoice ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  // "Convert to Invoice" arrives here as /sales/invoices/new?fromQuotation=<id> or
  // ?fromSalesOrder=<id> — pre-fill the form from the source's fields; the user can still edit
  // everything before saving. Whole-document conversion only (no partial-quantity conversion).
  const sourceQuotationId = sp.fromQuotation;
  const sourceSalesOrderId = sp.fromSalesOrder;
  const sourceQuotation = sourceQuotationId
    ? await findQuotationById(sourceQuotationId, context.activeBusinessId)
    : null;
  if (sourceQuotationId && (!sourceQuotation || sourceQuotation.status !== "open")) {
    redirect("/sales/quotations");
  }
  const sourceSalesOrder = sourceSalesOrderId
    ? await findSalesOrderById(sourceSalesOrderId, context.activeBusinessId)
    : null;
  if (sourceSalesOrderId && (!sourceSalesOrder || sourceSalesOrder.status !== "open")) {
    redirect("/sales/sales-orders");
  }

  const source = sourceSalesOrder ?? sourceQuotation;
  const lineItemsFromSource: LineItemRow[] | undefined = source
    ? mapLineItemsForConversion(source.lineItems)
    : undefined;
  const headerFromSource = source ? extractConvertibleHeader(source) : undefined;

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New invoice</h1>
      <InvoiceForm
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
          customerId: source ? String(source.customerId) : "",
          invoiceDate: new Date().toISOString().slice(0, 10),
          dueDate: dueDate.toISOString().slice(0, 10),
          referenceNumber: headerFromSource?.referenceNumber ?? "",
          placeOfSupplyState: headerFromSource?.placeOfSupplyState ?? businessState,
          reverseCharge: headerFromSource?.reverseCharge ?? false,
          roundOff: salesPrefs.roundOff,
          notes: headerFromSource?.notes || defaultNoteTemplate?.body || "",
          terms: headerFromSource?.terms || defaultTermTemplate?.body || "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          signatureId: defaultSignature ? String(defaultSignature._id) : "",
          bankAccountId: defaultBank ? String(defaultBank._id) : "",
          discountType: headerFromSource?.discountType ?? salesPrefs.defaultDiscountType,
          discountValue: headerFromSource?.discountValue ?? "0",
          discountTarget: headerFromSource?.discountTarget ?? "total",
          customFieldValues: headerFromSource?.customFieldValues ?? {},
          lineItems: lineItemsFromSource ?? [],
          sourceQuotationId: sourceQuotation ? String(sourceQuotation._id) : undefined,
          sourceSalesOrderId: sourceSalesOrder ? String(sourceSalesOrder._id) : undefined,
        }}
      />
    </div>
  );
}
