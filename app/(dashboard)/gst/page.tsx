import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GST_SCREENS = [
  { href: "/gst/gstr1", label: "GSTR-1", description: "Outward supplies for a period, computed locally, with a manual filing tracker." },
  { href: "/gst/gstr3b", label: "GSTR-3B", description: "Summary return — outward liability, reverse charge, and ITC for a period." },
  { href: "/gst/gstr2b", label: "GSTR-2B Reconciliation", description: "Compare locally recorded purchases against an imported GSTR-2B export." },
  { href: "/gst/e-way-bills", label: "E-way Bills", description: "Generate e-way bill data for eligible invoices and download the NIC-schema JSON." },
  { href: "/gst/e-invoices", label: "E-Invoices", description: "Track e-invoice eligibility/status and download the IRP-schema JSON." },
] as const;

export default async function GstHubPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "gst", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">GST</h1>
        <p className="text-sm text-muted-foreground">
          GST return calculation and e-way bill/e-invoice data — computed entirely from your local
          documents. Nothing here is ever filed or submitted to the government automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GST_SCREENS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
