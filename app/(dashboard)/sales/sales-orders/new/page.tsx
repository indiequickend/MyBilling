import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCustomers } from "@/lib/db/queries/customers";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findQuotationById } from "@/lib/db/queries/quotations";
import { mapLineItemsForConversion, extractConvertibleHeader } from "@/lib/documents/conversion";
import { SalesOrderForm } from "../SalesOrderForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_orders", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create sales orders.</p>;
  }

  const [customers, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "sales_order", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "sales_order", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const salesOrderPrefs = business.preferences.document.conversions;
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  // "Convert to Sales Order" arrives here as /sales/sales-orders/new?fromQuotation=<id>.
  const sourceQuotationId = sp.fromQuotation;
  const sourceQuotation = sourceQuotationId
    ? await findQuotationById(sourceQuotationId, context.activeBusinessId)
    : null;
  if (sourceQuotationId && (!sourceQuotation || sourceQuotation.status !== "open")) {
    redirect("/sales/quotations");
  }

  const lineItemsFromQuotation: LineItemRow[] | undefined = sourceQuotation
    ? mapLineItemsForConversion(sourceQuotation.lineItems)
    : undefined;
  const headerFromQuotation = sourceQuotation ? extractConvertibleHeader(sourceQuotation) : undefined;

  const fieldDefs = (business.documentCustomFieldDefs?.sales_order ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New sales order</h1>
      <SalesOrderForm
        mode="create"
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        customFieldDefs={fieldDefs}
        businessState={businessState}
        defaultValues={{
          customerId: sourceQuotation ? String(sourceQuotation.customerId) : "",
          orderDate: new Date().toISOString().slice(0, 10),
          expectedDeliveryDate: "",
          referenceNumber: headerFromQuotation?.referenceNumber ?? "",
          placeOfSupplyState: headerFromQuotation?.placeOfSupplyState ?? businessState,
          reverseCharge: headerFromQuotation?.reverseCharge ?? false,
          roundOff: salesOrderPrefs.roundOff,
          notes: headerFromQuotation?.notes || defaultNoteTemplate?.body || "",
          terms: headerFromQuotation?.terms || defaultTermTemplate?.body || "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          discountType: headerFromQuotation?.discountType ?? salesOrderPrefs.defaultDiscountType,
          discountValue: headerFromQuotation?.discountValue ?? "0",
          discountTarget: headerFromQuotation?.discountTarget ?? "total",
          customFieldValues: {},
          lineItems: lineItemsFromQuotation ?? [],
          sourceQuotationId: sourceQuotation ? String(sourceQuotation._id) : undefined,
        }}
      />
    </div>
  );
}
