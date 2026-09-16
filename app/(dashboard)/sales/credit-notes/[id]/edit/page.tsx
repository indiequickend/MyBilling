import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findCreditNoteById } from "@/lib/db/queries/creditNotes";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { findProductsByIds } from "@/lib/db/queries/products";
import { minorToRupeesString } from "@/lib/utils/money";
import { hydrateLineItemsStockInfo } from "@/lib/documents/stockLineItems";
import { CreditNoteForm } from "../../CreditNoteForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft"];

export default async function EditCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_credit_notes", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit credit notes.</p>;
  }

  const creditNote = await findCreditNoteById(id, context.activeBusinessId);
  if (!creditNote) notFound();
  if (!EDITABLE_STATUSES.includes(creditNote.status)) {
    redirect(`/sales/credit-notes/${id}`);
  }

  const [invoice, business, warehouses] = await Promise.all([
    findInvoiceById(String(creditNote.linkedInvoiceId), context.activeBusinessId),
    findBusinessById(context.activeBusinessId),
    listWarehouses(context.activeBusinessId, "active"),
  ]);
  if (!invoice || !business) redirect("/sales/credit-notes");

  const rawLineItems: LineItemRow[] = creditNote.lineItems.map((li) => ({
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
    creditNote.lineItems.filter((li) => li.productId).map((li) => String(li.productId)),
    context.activeBusinessId,
  );
  const lineItems = hydrateLineItemsStockInfo(rawLineItems, creditNote.lineItems, lineItemProducts);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit credit note</h1>
      <CreditNoteForm
        mode="edit"
        creditNoteId={id}
        editableStatus="draft"
        linkedInvoiceId={String(creditNote.linkedInvoiceId)}
        customerLabel={creditNote.customerSnapshot.displayName}
        invoiceDocNumber={invoice.docNumber ?? "Draft"}
        businessState={business.addresses?.billing?.state ?? ""}
        warehouses={warehouses.map((w) => ({ id: String(w._id), name: w.name }))}
        defaultWarehouseId={
          business.preferences.productsInventory.inventory.defaultWarehouseId
            ? String(business.preferences.productsInventory.inventory.defaultWarehouseId)
            : undefined
        }
        defaultValues={{
          creditNoteDate: new Date(creditNote.creditNoteDate).toISOString().slice(0, 10),
          reason: creditNote.reason ?? "",
          restockItems: creditNote.restockItems,
          placeOfSupplyState: creditNote.placeOfSupplyState,
          roundOff: creditNote.roundOff,
          discountType: creditNote.discountType,
          discountValue:
            creditNote.discountType === "percentage"
              ? String(creditNote.discountValue)
              : minorToRupeesString(creditNote.discountValue),
          discountTarget: creditNote.discountTarget,
          lineItems,
        }}
      />
    </div>
  );
}
