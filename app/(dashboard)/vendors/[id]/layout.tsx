import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findVendorById } from "@/lib/db/queries/vendors";

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
    return <p className="text-sm text-red-700">You don&apos;t have permission to view vendors.</p>;
  }

  const vendor = await findVendorById(id, context.activeBusinessId);
  if (!vendor) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{vendor.displayName}</h1>
          {vendor.companyName ? (
            <p className="text-sm text-slate-500">{vendor.companyName}</p>
          ) : null}
        </div>
        <Link
          href={`/vendors/${id}/edit`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          Edit
        </Link>
      </div>
      {children}
    </div>
  );
}
