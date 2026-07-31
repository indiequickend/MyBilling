import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findQuotationById } from "@/lib/db/queries/quotations";
import { listCustomers } from "@/lib/db/queries/customers";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { minorToRupeesString } from "@/lib/utils/money";
import { QuotationForm } from "../../QuotationForm";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";

const EDITABLE_STATUSES = ["draft", "open"];

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "quotations", "edit")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit quotations.</p>;
  }

  const quotation = await findQuotationById(id, context.activeBusinessId);
  if (!quotation) notFound();
  if (!EDITABLE_STATUSES.includes(quotation.status)) {
    redirect(`/sales/quotations/${id}`);
  }

  const [customers, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "quotation", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "quotation", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const businessState = business.addresses?.billing?.state ?? "";

  const fieldDefs = (business.documentCustomFieldDefs?.quotation ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  const lineItems: LineItemRow[] = quotation.lineItems.map((li) => ({
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
      <h1 className="mb-6 text-lg font-semibold">Edit quotation</h1>
      <QuotationForm
        mode="edit"
        quotationId={id}
        editableStatus={quotation.status as "draft" | "open"}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        customFieldDefs={fieldDefs}
        businessState={businessState}
        defaultValues={{
          customerId: String(quotation.customerId),
          quotationDate: new Date(quotation.quotationDate).toISOString().slice(0, 10),
          validUntil: quotation.validUntil ? new Date(quotation.validUntil).toISOString().slice(0, 10) : "",
          referenceNumber: quotation.referenceNumber ?? "",
          placeOfSupplyState: quotation.placeOfSupplyState,
          reverseCharge: quotation.reverseCharge,
          roundOff: quotation.roundOff,
          notes: quotation.notes ?? "",
          terms: quotation.terms ?? "",
          noteTemplateId: quotation.noteTemplateId ? String(quotation.noteTemplateId) : "",
          termTemplateId: quotation.termTemplateId ? String(quotation.termTemplateId) : "",
          discountType: quotation.discountType,
          discountValue:
            quotation.discountType === "percentage"
              ? String(quotation.discountValue)
              : minorToRupeesString(quotation.discountValue),
          discountTarget: quotation.discountTarget,
          customFieldValues: quotation.customFieldValues ?? {},
          lineItems,
        }}
      />
    </div>
  );
}
