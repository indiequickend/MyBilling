import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { resolveNumberingConfig } from "@/lib/documents/numbering";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { DocumentPreferencesForm } from "./DocumentPreferencesForm";
import { DocumentNumberingForm } from "./DocumentNumberingForm";
import type { DocumentPreferences } from "@/lib/db/models/Business";

function toPlainDocPrefs(p: DocumentPreferences): DocumentPreferences {
  return {
    roundOff: p.roundOff,
    defaultDiscountType: p.defaultDiscountType,
    showHeaderFieldSuggestions: p.showHeaderFieldSuggestions,
    defaultDueDateDays: p.defaultDueDateDays,
    trackItcEligibility: p.trackItcEligibility,
  };
}

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
          sales: toPlainDocPrefs(business.preferences.document.sales),
          purchases: toPlainDocPrefs(business.preferences.document.purchases),
          conversions: toPlainDocPrefs(business.preferences.document.conversions),
        }}
      />

      <div className="mt-10">
        <DocumentNumberingForm
          fyStartMonth={business.preferences.documentNumbering?.fyStartMonth ?? 4}
          invoiceConfig={{
            ...resolveNumberingConfig(business.preferences.documentNumbering, "invoice"),
          }}
        />
      </div>
    </div>
  );
}
