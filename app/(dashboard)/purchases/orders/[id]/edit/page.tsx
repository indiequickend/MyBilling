import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseOrderById } from "@/lib/db/queries/purchaseOrders";
import { listVendors } from "@/lib/db/queries/vendors";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { PurchaseOrderForm } from "../../PurchaseOrderForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "open"];

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchase_orders", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit purchase orders.</p>;
  }

  const purchaseOrder = await findPurchaseOrderById(id, context.activeBusinessId);
  if (!purchaseOrder) notFound();
  if (!EDITABLE_STATUSES.includes(purchaseOrder.status)) {
    redirect(`/purchases/orders/${id}`);
  }

  const [vendors, noteTemplates, termTemplates, business] = await Promise.all([
    listVendors(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase_order", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase_order", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";

  const lineItems: LineItemRow[] = purchaseOrder.lineItems.map((li) => ({
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
      <h1 className="mb-6 text-lg font-semibold">Edit purchase order</h1>
      <PurchaseOrderForm
        mode="edit"
        purchaseOrderId={id}
        editableStatus={purchaseOrder.status as "draft" | "open"}
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        businessState={businessState}
        defaultValues={{
          vendorId: String(purchaseOrder.vendorId),
          orderDate: new Date(purchaseOrder.orderDate).toISOString().slice(0, 10),
          expectedDeliveryDate: purchaseOrder.expectedDeliveryDate
            ? new Date(purchaseOrder.expectedDeliveryDate).toISOString().slice(0, 10)
            : "",
          referenceNumber: purchaseOrder.referenceNumber ?? "",
          placeOfSupplyState: purchaseOrder.placeOfSupplyState,
          reverseCharge: purchaseOrder.reverseCharge,
          roundOff: purchaseOrder.roundOff,
          notes: purchaseOrder.notes ?? "",
          terms: purchaseOrder.terms ?? "",
          noteTemplateId: purchaseOrder.noteTemplateId ? String(purchaseOrder.noteTemplateId) : "",
          termTemplateId: purchaseOrder.termTemplateId ? String(purchaseOrder.termTemplateId) : "",
          discountType: purchaseOrder.discountType,
          discountValue:
            purchaseOrder.discountType === "percentage"
              ? String(purchaseOrder.discountValue)
              : minorToRupeesString(purchaseOrder.discountValue),
          discountTarget: purchaseOrder.discountTarget,
          lineItems,
        }}
      />
    </div>
  );
}
