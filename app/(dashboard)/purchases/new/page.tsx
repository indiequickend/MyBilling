import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listVendors } from "@/lib/db/queries/vendors";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findPurchaseOrderById } from "@/lib/db/queries/purchaseOrders";
import { minorToRupeesString } from "@/lib/utils/money";
import { PurchaseForm } from "../PurchaseForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchases", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create purchases.</p>;
  }

  const [vendors, bankAccounts, noteTemplates, termTemplates, business] = await Promise.all([
    listVendors(context.activeBusinessId, { pageSize: 500 }),
    listBankAccounts(context.activeBusinessId, "active"),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const purchasePrefs = business.preferences.document.purchases;
  const defaultBank = bankAccounts.find((b) => b.isDefault);
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + purchasePrefs.defaultDueDateDays);

  const fieldDefs = (business.documentCustomFieldDefs?.purchase ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  // "Convert to Purchase" arrives here as /purchases/new?fromPurchaseOrder=<id> — pre-fill the
  // form from the source PO's fields; the user can still edit everything before saving. Whole-PO
  // conversion only (no partial-quantity conversion) — see purchaseOrders.ts.
  const sourcePurchaseOrderId = sp.fromPurchaseOrder;
  const sourcePO = sourcePurchaseOrderId
    ? await findPurchaseOrderById(sourcePurchaseOrderId, context.activeBusinessId)
    : null;
  if (sourcePurchaseOrderId && (!sourcePO || sourcePO.status !== "open")) {
    redirect("/purchases/orders");
  }

  const lineItemsFromPO: LineItemRow[] | undefined = sourcePO?.lineItems.map((li) => ({
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
    itcEligible: true,
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New purchase</h1>
      <PurchaseForm
        mode="create"
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        customFieldDefs={fieldDefs}
        businessState={businessState}
        trackItcEligibility={purchasePrefs.trackItcEligibility}
        defaultValues={{
          vendorId: sourcePO ? String(sourcePO.vendorId) : "",
          purchaseDate: new Date().toISOString().slice(0, 10),
          dueDate: dueDate.toISOString().slice(0, 10),
          referenceNumber: sourcePO?.referenceNumber ?? "",
          vendorInvoiceNumber: "",
          placeOfSupplyState: sourcePO?.placeOfSupplyState ?? businessState,
          reverseCharge: sourcePO?.reverseCharge ?? false,
          roundOff: purchasePrefs.roundOff,
          notes: sourcePO?.notes ?? defaultNoteTemplate?.body ?? "",
          terms: sourcePO?.terms ?? defaultTermTemplate?.body ?? "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          bankAccountId: defaultBank ? String(defaultBank._id) : "",
          discountType: sourcePO?.discountType ?? purchasePrefs.defaultDiscountType,
          discountValue: sourcePO
            ? sourcePO.discountType === "percentage"
              ? String(sourcePO.discountValue)
              : minorToRupeesString(sourcePO.discountValue)
            : "0",
          discountTarget: sourcePO?.discountTarget ?? "total",
          customFieldValues: {},
          lineItems: lineItemsFromPO ?? [],
          sourcePurchaseOrderId: sourcePO ? String(sourcePO._id) : undefined,
        }}
      />
    </div>
  );
}
