import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { resolveNumberingConfig } from "@/lib/documents/numbering";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { DocumentPreferencesForm } from "./DocumentPreferencesForm";
import { DocumentNumberingForm } from "./DocumentNumberingForm";

export default async function DocumentPreferencesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  return (
    <div>
      <LinkTabs
        tabs={[
          { label: "Document", href: "/settings/preferences/document", active: true },
          {
            label: "Products & Inventory",
            href: "/settings/preferences/products-inventory",
            active: false,
          },
        ]}
      />
      <DocumentPreferencesForm
        preferences={{
          sales: business.preferences.document.sales,
          purchases: business.preferences.document.purchases,
          conversions: business.preferences.document.conversions,
        }}
      />

      <div className="mt-10">
        <DocumentNumberingForm
          fyStartMonth={business.preferences.documentNumbering?.fyStartMonth ?? 4}
          invoiceConfig={resolveNumberingConfig(business.preferences.documentNumbering, "invoice")}
        />
      </div>
    </div>
  );
}
