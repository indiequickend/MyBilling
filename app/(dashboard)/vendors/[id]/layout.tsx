import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findVendorById } from "@/lib/db/queries/vendors";
import { Button } from "@/components/ui/button";
import { PartyAvatar } from "@/components/dashboard/PartyAvatar";

export default async function VendorDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "vendors", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view vendors.</p>;
  }

  const vendor = await findVendorById(id, context.activeBusinessId);
  if (!vendor) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PartyAvatar id={id} name={vendor.displayName} className="size-10" />
          <div>
            <h1 className="text-lg font-semibold">{vendor.displayName}</h1>
            {vendor.companyName ? (
              <p className="text-sm text-muted-foreground">{vendor.companyName}</p>
            ) : null}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/vendors/${id}/edit`}>
            <Pencil data-icon="inline-start" />
            Edit
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}
