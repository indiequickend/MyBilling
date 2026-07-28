import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findCustomerById } from "@/lib/db/queries/customers";

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
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to view customers.</p>
    );
  }

  const customer = await findCustomerById(id, context.activeBusinessId);
  if (!customer) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{customer.displayName}</h1>
          {customer.companyName ? (
            <p className="text-sm text-slate-500">{customer.companyName}</p>
          ) : null}
        </div>
        <Link
          href={`/customers/${id}/edit`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Edit
        </Link>
      </div>
      {children}
    </div>
  );
}
