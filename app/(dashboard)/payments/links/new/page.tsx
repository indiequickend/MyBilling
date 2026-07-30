import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices } from "@/lib/db/queries/invoices";
import { PaymentLinkForm } from "../PaymentLinkForm";

const ELIGIBLE_STATUSES = ["pending", "partially_paid", "paid"];

export default async function NewPaymentLinkPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create payment links.</p>;
  }

  const { items } = await listInvoices(context.activeBusinessId, { tab: "all", pageSize: 500 });
  const eligible = items.filter((inv) => ELIGIBLE_STATUSES.includes(inv.status));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New payment link</h1>
      <PaymentLinkForm
        invoices={eligible.map((inv) => ({
          id: String(inv._id),
          label: `${inv.docNumber ?? "Draft"} — ${inv.customerSnapshot.displayName}`,
        }))}
      />
    </div>
  );
}
