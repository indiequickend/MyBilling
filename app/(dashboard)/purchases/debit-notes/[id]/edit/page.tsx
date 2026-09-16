import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findDebitNoteById } from "@/lib/db/queries/debitNotes";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { findProductsByIds } from "@/lib/db/queries/products";
import { minorToRupeesString } from "@/lib/utils/money";
import { hydrateLineItemsStockInfo } from "@/lib/documents/stockLineItems";
import { DebitNoteForm } from "../../DebitNoteForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft"];

export default async function EditDebitNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "debit_notes", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit debit notes.</p>;
  }

  const debitNote = await findDebitNoteById(id, context.activeBusinessId);
  if (!debitNote) notFound();
  if (!EDITABLE_STATUSES.includes(debitNote.status)) {
    redirect(`/purchases/debit-notes/${id}`);
  }

  const [purchase, business, warehouses] = await Promise.all([
    findPurchaseById(String(debitNote.linkedPurchaseId), context.activeBusinessId),
    findBusinessById(context.activeBusinessId),
    listWarehouses(context.activeBusinessId, "active"),
  ]);
  if (!purchase || !business) redirect("/purchases/debit-notes");

  const rawLineItems: LineItemRow[] = debitNote.lineItems.map((li) => ({
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
  const lineItemProducts = await findProductsByIds(
    debitNote.lineItems.filter((li) => li.productId).map((li) => String(li.productId)),
    context.activeBusinessId,
  );
  const lineItems = hydrateLineItemsStockInfo(rawLineItems, debitNote.lineItems, lineItemProducts);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit debit note</h1>
      <DebitNoteForm
        mode="edit"
        debitNoteId={id}
        editableStatus="draft"
        linkedPurchaseId={String(debitNote.linkedPurchaseId)}
        vendorLabel={debitNote.vendorSnapshot.displayName}
        purchaseDocNumber={purchase.docNumber ?? "Draft"}
        businessState={business.addresses?.billing?.state ?? ""}
        warehouses={warehouses.map((w) => ({ id: String(w._id), name: w.name }))}
        defaultWarehouseId={
          business.preferences.productsInventory.inventory.defaultWarehouseId
            ? String(business.preferences.productsInventory.inventory.defaultWarehouseId)
            : undefined
        }
        defaultValues={{
          debitNoteDate: new Date(debitNote.debitNoteDate).toISOString().slice(0, 10),
          reason: debitNote.reason ?? "",
          restockItems: debitNote.restockItems,
          placeOfSupplyState: debitNote.placeOfSupplyState,
          roundOff: debitNote.roundOff,
          discountType: debitNote.discountType,
          discountValue:
            debitNote.discountType === "percentage"
              ? String(debitNote.discountValue)
              : minorToRupeesString(debitNote.discountValue),
          discountTarget: debitNote.discountTarget,
          lineItems,
        }}
      />
    </div>
  );
}
