import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentCustomFieldDefsEditor } from "./DocumentCustomFieldDefsEditor";

export default async function DocumentCustomFieldsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const defs = (business.documentCustomFieldDefs?.invoice ?? []).map((d) => ({
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
          Define extra header fields that appear on every Invoice (e.g. a travel agency&apos;s
          &quot;Journey Start Date&quot; or &quot;Group Tour Ref&quot;).
        </p>
      </div>
      <Card>
        <CardContent>
          <DocumentCustomFieldDefsEditor defaultDefs={defs} />
        </CardContent>
      </Card>
    </div>
  );
}
