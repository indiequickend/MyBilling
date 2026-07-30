import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices, findInvoiceById } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { listWarehouses } from "@/lib/db/queries/warehouses";
import { findProductsByIds } from "@/lib/db/queries/products";
import { minorToRupeesString } from "@/lib/utils/money";
import { hydrateLineItemsStockInfo } from "@/lib/documents/stockLineItems";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreditNoteForm } from "../CreditNoteForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

export default async function NewCreditNotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_credit_notes", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create credit notes.</p>;
  }

  const invoiceId = sp.invoiceId;

  if (!invoiceId) {
    // Step 1: pick the Invoice this credit note is against. A billed (finalized, not cancelled)
    // Invoice only — a credit note is a reduction against something actually billed.
    const { items } = await listInvoices(context.activeBusinessId, { tab: "all", pageSize: 500 });
    const eligible = items.filter((inv) =>
      ["pending", "partially_paid", "paid"].includes(inv.status),
    );

    return (
      <div>
        <h1 className="mb-6 text-lg font-semibold">New credit note</h1>
        <Card className="max-w-md">
          <CardContent>
            <form method="GET" className="space-y-4">
              <Field>
                <FieldLabel htmlFor="invoiceId">Against invoice</FieldLabel>
                <SelectField
                  name="invoiceId"
                  placeholder="Select an invoice…"
                  required
                  options={eligible.map((inv) => ({
                    value: String(inv._id),
                    label: `${inv.docNumber ?? "Draft"} — ${inv.customerSnapshot.displayName} (₹${minorToRupeesString(inv.grandTotalMinor)})`,
                  }))}
                />
              </Field>
              <Button type="submit">Continue</Button>
            </form>
            {eligible.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No billed invoices yet — a credit note must reference an existing invoice.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: pre-fill from the selected Invoice — user can still edit line items/discount before issuing.
  const invoice = await findInvoiceById(invoiceId, context.activeBusinessId);
  if (!invoice) redirect("/sales/credit-notes/new");

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const warehouses = await listWarehouses(context.activeBusinessId, "active");

  const rawLineItems: LineItemRow[] = invoice.lineItems.map((li) => ({
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
    invoice.lineItems.filter((li) => li.productId).map((li) => String(li.productId)),
    context.activeBusinessId,
  );
  const lineItems = hydrateLineItemsStockInfo(rawLineItems, invoice.lineItems, lineItemProducts);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New credit note</h1>
      <CreditNoteForm
        linkedInvoiceId={invoiceId}
        customerLabel={invoice.customerSnapshot.displayName}
        invoiceDocNumber={invoice.docNumber ?? "Draft"}
        businessState={business.addresses?.billing?.state ?? ""}
        warehouses={warehouses.map((w) => ({ id: String(w._id), name: w.name }))}
        defaultWarehouseId={
          business.preferences.productsInventory.inventory.defaultWarehouseId
            ? String(business.preferences.productsInventory.inventory.defaultWarehouseId)
            : undefined
        }
        defaultValues={{
          creditNoteDate: new Date().toISOString().slice(0, 10),
          reason: "",
          restockItems: false,
          placeOfSupplyState: invoice.placeOfSupplyState,
          roundOff: invoice.roundOff,
          discountType: "percentage",
          discountValue: "0",
          discountTarget: "total",
          lineItems,
        }}
      />
    </div>
  );
}
