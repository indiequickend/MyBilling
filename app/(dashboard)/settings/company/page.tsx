import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { CompanyDetailsForm } from "./CompanyDetailsForm";
import { CustomFieldDefsEditor } from "./CustomFieldDefsEditor";
import { CustomFieldValuesForm } from "./CustomFieldValuesForm";

export default async function CompanyDetailsPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_company")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>
    );
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
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Company Details</h1>
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
      </div>

      <div>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Custom fields</h2>
        <p className="mb-4 text-sm text-slate-500">
          Define extra fields for your business (e.g. MSME Registration, Trade License).
        </p>
        <CustomFieldDefsEditor defaultDefs={defs} />
      </div>

      {defs.length > 0 ? (
        <div>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Custom field values</h2>
          <CustomFieldValuesForm defs={defs} values={values} />
        </div>
      ) : null}
    </div>
  );
}
