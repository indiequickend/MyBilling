import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findCustomerById } from "@/lib/db/queries/customers";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { CustomerForm } from "../../CustomerForm";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "customers", "edit")) {
    return (
      <p className="text-sm text-red-700">You don&apos;t have permission to edit customers.</p>
    );
  }

  const [customer, groups] = await Promise.all([
    findCustomerById(id, context.activeBusinessId),
    listPartyGroups(context.activeBusinessId, "customer"),
  ]);
  if (!customer) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-slate-900">Edit customer</h1>
      <CustomerForm
        mode="edit"
        customerId={String(customer._id)}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        defaultValues={{
          displayName: customer.displayName,
          companyName: customer.companyName ?? "",
          gstin: customer.gstin ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          notes: customer.notes ?? "",
          groupIds: customer.groupIds.map((g) => String(g)),
          billing: toPlainAddress(customer.billingAddress),
          shipping: toPlainAddress(customer.shippingAddress),
        }}
      />
    </div>
  );
}
