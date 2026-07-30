import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listCustomers } from "@/lib/db/queries/customers";
import { listVendors } from "@/lib/db/queries/vendors";
import { JournalForm } from "../JournalForm";

export default async function NewJournalPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create journals.</p>;
  }

  const [bankAccounts, customers, vendors] = await Promise.all([
    listBankAccounts(context.activeBusinessId, "active"),
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listVendors(context.activeBusinessId, { pageSize: 500 }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New journal entry</h1>
      <JournalForm
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        customers={customers.items.map((c) => ({ id: String(c._id), name: c.displayName }))}
        vendors={vendors.items.map((v) => ({ id: String(v._id), name: v.displayName }))}
      />
    </div>
  );
}
