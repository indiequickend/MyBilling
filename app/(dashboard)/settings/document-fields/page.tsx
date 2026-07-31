import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { Card, CardContent } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { DocumentCustomFieldDefsEditor } from "./DocumentCustomFieldDefsEditor";

const DOC_TYPE_TABS = [
  { key: "invoice", label: "Invoice" },
  { key: "purchase", label: "Purchase" },
  { key: "quotation", label: "Quotation" },
  { key: "sales_order", label: "Sales Order" },
  { key: "proforma_invoice", label: "Proforma Invoice" },
  { key: "purchase_order", label: "Purchase Order" },
] as const;
type SupportedDocType = (typeof DOC_TYPE_TABS)[number]["key"];

export default async function DocumentCustomFieldsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const docType: SupportedDocType = DOC_TYPE_TABS.some((t) => t.key === sp.docType)
    ? (sp.docType as SupportedDocType)
    : "invoice";

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const defs = (business.documentCustomFieldDefs?.[docType] ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Document Custom Fields</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define extra header fields that appear on every document of this type (e.g. a travel
          agency&apos;s &quot;Journey Start Date&quot; or &quot;Group Tour Ref&quot; on Invoices).
        </p>
      </div>

      <LinkTabs
        tabs={DOC_TYPE_TABS.map((t) => ({
          label: t.label,
          href: t.key === "invoice" ? "/settings/document-fields" : `/settings/document-fields?docType=${t.key}`,
          active: docType === t.key,
        }))}
      />

      <Card>
        <CardContent>
          <DocumentCustomFieldDefsEditor key={docType} docType={docType} defaultDefs={defs} />
        </CardContent>
      </Card>
    </div>
  );
}
