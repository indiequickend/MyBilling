import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listVendors } from "@/lib/db/queries/vendors";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { PurchaseOrderForm } from "../PurchaseOrderForm";

export default async function NewPurchaseOrderPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchase_orders", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create purchase orders.</p>;
  }

  const [vendors, noteTemplates, termTemplates, business] = await Promise.all([
    listVendors(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase_order", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase_order", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const purchasePrefs = business.preferences.document.purchases;
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New purchase order</h1>
      <PurchaseOrderForm
        mode="create"
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        businessState={businessState}
        defaultValues={{
          vendorId: "",
          orderDate: new Date().toISOString().slice(0, 10),
          expectedDeliveryDate: "",
          referenceNumber: "",
          placeOfSupplyState: businessState,
          reverseCharge: false,
          roundOff: purchasePrefs.roundOff,
          notes: defaultNoteTemplate?.body ?? "",
          terms: defaultTermTemplate?.body ?? "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          discountType: purchasePrefs.defaultDiscountType,
          discountValue: "0",
          discountTarget: "total",
          lineItems: [],
        }}
      />
    </div>
  );
}
