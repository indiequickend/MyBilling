import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCustomers } from "@/lib/db/queries/customers";
import { listNoteTermTemplates } from "@/lib/db/queries/noteTermTemplates";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { QuotationForm } from "../QuotationForm";

export default async function NewQuotationPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "quotations", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create quotations.</p>;
  }

  const [customers, noteTemplates, termTemplates, business] = await Promise.all([
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "quotation", kind: "note", tab: "active" }),
    listNoteTermTemplates(context.activeBusinessId, { docType: "quotation", kind: "term", tab: "active" }),
    findBusinessById(context.activeBusinessId),
  ]);
  if (!business) redirect("/");

  const conversionPrefs = business.preferences.document.conversions;
  const defaultNoteTemplate = noteTemplates.find((t) => t.isDefault);
  const defaultTermTemplate = termTemplates.find((t) => t.isDefault);
  const businessState = business.addresses?.billing?.state ?? "";

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New quotation</h1>
      <QuotationForm
        mode="create"
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        noteTemplates={noteTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        termTemplates={termTemplates.map((t) => ({ id: String(t._id), label: t.title || "(untitled)" }))}
        businessState={businessState}
        defaultValues={{
          customerId: "",
          quotationDate: new Date().toISOString().slice(0, 10),
          validUntil: "",
          referenceNumber: "",
          placeOfSupplyState: businessState,
          reverseCharge: false,
          roundOff: conversionPrefs.roundOff,
          notes: defaultNoteTemplate?.body ?? "",
          terms: defaultTermTemplate?.body ?? "",
          noteTemplateId: defaultNoteTemplate ? String(defaultNoteTemplate._id) : "",
          termTemplateId: defaultTermTemplate ? String(defaultTermTemplate._id) : "",
          discountType: conversionPrefs.defaultDiscountType,
          discountValue: "0",
          discountTarget: "total",
          lineItems: [],
        }}
      />
    </div>
  );
}
