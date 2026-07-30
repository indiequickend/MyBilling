import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchases, findPurchaseById } from "@/lib/db/queries/purchases";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { findProductsByIds } from "@/lib/db/queries/products";
import { minorToRupeesString } from "@/lib/utils/money";
import { hydrateLineItemsStockInfo } from "@/lib/documents/stockLineItems";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DebitNoteForm } from "../DebitNoteForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

export default async function NewDebitNotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "debit_notes", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create debit notes.</p>;
  }

  const purchaseId = sp.purchaseId;

  if (!purchaseId) {
    // Step 1: pick the Purchase this debit note is against. A billable (non-draft, non-cancelled)
    // Purchase only — a debit note is a return against something actually billed.
    const { items } = await listPurchases(context.activeBusinessId, { tab: "all", pageSize: 500 });
    const eligible = items.filter((p) => p.status !== "draft" && p.status !== "cancelled");

    return (
      <div>
        <h1 className="mb-6 text-lg font-semibold">New debit note</h1>
        <Card className="max-w-md">
          <CardContent>
            <form method="GET" className="space-y-4">
              <Field>
                <FieldLabel htmlFor="purchaseId">Against purchase</FieldLabel>
                <SelectField
                  name="purchaseId"
                  placeholder="Select a purchase…"
                  required
                  options={eligible.map((p) => ({
                    value: String(p._id),
                    label: `${p.docNumber ?? "Draft"} — ${p.vendorSnapshot.displayName} (₹${minorToRupeesString(p.grandTotalMinor)})`,
                  }))}
                />
              </Field>
              <Button type="submit">Continue</Button>
            </form>
            {eligible.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No billed purchases yet — a debit note must reference an existing purchase.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: pre-fill from the selected Purchase — user can still edit line items/discount before issuing.
  const purchase = await findPurchaseById(purchaseId, context.activeBusinessId);
  if (!purchase) redirect("/purchases/debit-notes/new");

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const warehouses = await listWarehouses(context.activeBusinessId, "active");

  const rawLineItems: LineItemRow[] = purchase.lineItems.map((li) => ({
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
    purchase.lineItems.filter((li) => li.productId).map((li) => String(li.productId)),
    context.activeBusinessId,
  );
  const lineItems = hydrateLineItemsStockInfo(rawLineItems, purchase.lineItems, lineItemProducts);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New debit note</h1>
      <DebitNoteForm
        linkedPurchaseId={purchaseId}
        vendorLabel={purchase.vendorSnapshot.displayName}
        purchaseDocNumber={purchase.docNumber ?? "Draft"}
        businessState={business.addresses?.billing?.state ?? ""}
        warehouses={warehouses.map((w) => ({ id: String(w._id), name: w.name }))}
        defaultWarehouseId={
          business.preferences.productsInventory.inventory.defaultWarehouseId
            ? String(business.preferences.productsInventory.inventory.defaultWarehouseId)
            : undefined
        }
        defaultValues={{
          debitNoteDate: new Date().toISOString().slice(0, 10),
          reason: "",
          restockItems: false,
          placeOfSupplyState: purchase.placeOfSupplyState,
          roundOff: purchase.roundOff,
          discountType: "percentage",
          discountValue: "0",
          discountTarget: "total",
          lineItems,
        }}
      />
    </div>
  );
}
