import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findVendorById } from "@/lib/db/queries/vendors";
import { listPartyGroups } from "@/lib/db/queries/partyGroups";
import { toPlainAddress } from "@/lib/db/models/shared/address";
import { VendorForm } from "../../VendorForm";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "vendors", "edit")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to edit vendors.</p>;
  }

  const [vendor, groups] = await Promise.all([
    findVendorById(id, context.activeBusinessId),
    listPartyGroups(context.activeBusinessId, "vendor"),
  ]);
  if (!vendor) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-slate-900">Edit vendor</h1>
      <VendorForm
        mode="edit"
        vendorId={String(vendor._id)}
        groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
        defaultValues={{
          displayName: vendor.displayName,
          companyName: vendor.companyName ?? "",
          gstin: vendor.gstin ?? "",
          email: vendor.email ?? "",
          phone: vendor.phone ?? "",
          notes: vendor.notes ?? "",
          groupIds: vendor.groupIds.map((g) => String(g)),
          billing: toPlainAddress(vendor.billingAddress),
          shipping: toPlainAddress(vendor.shippingAddress),
        }}
      />
    </div>
  );
}
