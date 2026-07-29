import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyDetailsForm } from "./CompanyDetailsForm";
import { CustomFieldDefsEditor } from "./CustomFieldDefsEditor";
import { CustomFieldValuesForm } from "./CustomFieldValuesForm";

export default async function CompanyDetailsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_company")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  const defs = business.customFieldDefs.map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options ?? [],
    required: d.required,
  }));
  const values = { ...business.customFieldValues } as Record<string, unknown>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-lg font-semibold">Company Details</h1>

      <Card>
        <CardContent>
          <CompanyDetailsForm
            details={{
              name: business.name,
              brandName: business.brandName ?? "",
              gstin: business.gstin ?? "",
              pan: business.pan ?? "",
              businessType: business.businessType ?? "",
              phone: business.phone ?? "",
              email: business.email ?? "",
              alternateContact: business.alternateContact ?? "",
              website: business.website ?? "",
              billing: toPlainAddress(business.addresses?.billing),
              shipping: toPlainAddress(business.addresses?.shipping),
              logoUrl: business.logoUrl ?? null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom fields</CardTitle>
          <CardDescription>
            Define extra fields for your business (e.g. MSME Registration, Trade License).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomFieldDefsEditor defaultDefs={defs} />
        </CardContent>
      </Card>

      {defs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom field values</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomFieldValuesForm defs={defs} values={values} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
