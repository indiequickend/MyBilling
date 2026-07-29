import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findCustomerById } from "@/lib/db/queries/customers";
import { Button } from "@/components/ui/button";
import { PartyAvatar } from "@/components/dashboard/PartyAvatar";

export default async function CustomerDetailLayout({
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

  if (!can(context.membership, "customers", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view customers.</p>;
  }

  const customer = await findCustomerById(id, context.activeBusinessId);
  if (!customer) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PartyAvatar id={id} name={customer.displayName} className="size-10" />
          <div>
            <h1 className="text-lg font-semibold">{customer.displayName}</h1>
            {customer.companyName ? (
              <p className="text-sm text-muted-foreground">{customer.companyName}</p>
            ) : null}
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/customers/${id}/edit`}>
            <Pencil data-icon="inline-start" />
            Edit
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}
