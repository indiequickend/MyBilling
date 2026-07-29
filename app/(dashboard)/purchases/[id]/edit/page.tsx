import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPurchaseById } from "@/lib/db/queries/purchases";
import { listVendors } from "@/lib/db/queries/vendors";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { PurchaseForm } from "../../PurchaseForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "pending", "partially_paid"];

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchases", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit purchases.</p>;
  }

  const purchase = await findPurchaseById(id, context.activeBusinessId);
  if (!purchase) notFound();
  if (!EDITABLE_STATUSES.includes(purchase.status)) {
    redirect(`/purchases/${id}`);
  }

  const [vendors, bankAccounts, noteTemplates, termTemplates, business] = await Promise.all([
    listVendors(context.activeBusinessId, { pageSize: 500 }),
    listBankAccounts(context.activeBusinessId, "active"),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "purchase", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";
  const fieldDefs = (business.documentCustomFieldDefs?.purchase ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  const lineItems: LineItemRow[] = purchase.lineItems.map((li) => ({
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
    itcEligible: li.itcEligible,
  }));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit purchase</h1>
      <PurchaseForm
        mode="edit"
        purchaseId={id}
        editableStatus={purchase.status as "draft" | "pending" | "partially_paid"}
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        customFieldDefs={fieldDefs}
        businessState={businessState}
        trackItcEligibility={business.preferences.document.purchases.trackItcEligibility}
        defaultValues={{
          vendorId: String(purchase.vendorId),
          purchaseDate: new Date(purchase.purchaseDate).toISOString().slice(0, 10),
          dueDate: purchase.dueDate ? new Date(purchase.dueDate).toISOString().slice(0, 10) : "",
          referenceNumber: purchase.referenceNumber ?? "",
          vendorInvoiceNumber: purchase.vendorInvoiceNumber ?? "",
          placeOfSupplyState: purchase.placeOfSupplyState,
          reverseCharge: purchase.reverseCharge,
          roundOff: purchase.roundOff,
          notes: purchase.notes ?? "",
          terms: purchase.terms ?? "",
          noteTemplateId: purchase.noteTemplateId ? String(purchase.noteTemplateId) : "",
          termTemplateId: purchase.termTemplateId ? String(purchase.termTemplateId) : "",
          bankAccountId: purchase.bankAccountId ? String(purchase.bankAccountId) : "",
          discountType: purchase.discountType,
          discountValue:
            purchase.discountType === "percentage"
              ? String(purchase.discountValue)
              : minorToRupeesString(purchase.discountValue),
          discountTarget: purchase.discountTarget,
          customFieldValues: purchase.customFieldValues ?? {},
          lineItems,
        }}
      />
    </div>
  );
}
