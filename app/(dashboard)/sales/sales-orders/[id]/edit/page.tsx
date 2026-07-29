import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findSalesOrderById } from "@/lib/db/queries/salesOrders";
import { listCustomers } from "@/lib/db/queries/customers";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { SalesOrderForm } from "../../SalesOrderForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "open"];

export default async function EditSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_orders", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit sales orders.</p>;
  }

  const salesOrder = await findSalesOrderById(id, context.activeBusinessId);
  if (!salesOrder) notFound();
  if (!EDITABLE_STATUSES.includes(salesOrder.status)) {
    redirect(`/sales/sales-orders/${id}`);
  }

  const [customers, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "sales_order", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "sales_order", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";

  const lineItems: LineItemRow[] = salesOrder.lineItems.map((li) => ({
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
      <h1 className="mb-6 text-lg font-semibold">Edit sales order</h1>
      <SalesOrderForm
        mode="edit"
        salesOrderId={id}
        editableStatus={salesOrder.status as "draft" | "open"}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        businessState={businessState}
        defaultValues={{
          customerId: String(salesOrder.customerId),
          orderDate: new Date(salesOrder.orderDate).toISOString().slice(0, 10),
          expectedDeliveryDate: salesOrder.expectedDeliveryDate
            ? new Date(salesOrder.expectedDeliveryDate).toISOString().slice(0, 10)
            : "",
          referenceNumber: salesOrder.referenceNumber ?? "",
          placeOfSupplyState: salesOrder.placeOfSupplyState,
          reverseCharge: salesOrder.reverseCharge,
          roundOff: salesOrder.roundOff,
          notes: salesOrder.notes ?? "",
          terms: salesOrder.terms ?? "",
          noteTemplateId: salesOrder.noteTemplateId ? String(salesOrder.noteTemplateId) : "",
          termTemplateId: salesOrder.termTemplateId ? String(salesOrder.termTemplateId) : "",
          discountType: salesOrder.discountType,
          discountValue:
            salesOrder.discountType === "percentage"
              ? String(salesOrder.discountValue)
              : minorToRupeesString(salesOrder.discountValue),
          discountTarget: salesOrder.discountTarget,
          lineItems,
        }}
      />
    </div>
  );
}
