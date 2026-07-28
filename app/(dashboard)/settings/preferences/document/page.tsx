import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { Tabs } from "@/components/ui/Tabs";
import { DocumentPreferencesForm } from "./DocumentPreferencesForm";

export default async function DocumentPreferencesPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId) redirect("/");

  const business = await findBusinessById(context.activeBusinessId);
  if (!business) redirect("/");

  return (
    <div>
      <Tabs
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
    </div>
  );
}
