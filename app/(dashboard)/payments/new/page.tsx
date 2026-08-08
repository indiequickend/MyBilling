import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { listCustomers } from "@/lib/db/queries/customers";
import { listVendors } from "@/lib/db/queries/vendors";
import { NewPaymentForm } from "@/components/payments/NewPaymentForm";
import { recordCustomerPaymentAction } from "@/app/(dashboard)/customers/actions";
import { recordVendorPaymentAction } from "@/app/(dashboard)/vendors/actions";

export default async function NewPaymentPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "create")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to record payments.</p>;
  }

  const [bankAccounts, customers, vendors] = await Promise.all([
    listBankAccounts(context.activeBusinessId, "active"),
    listCustomers(context.activeBusinessId, { pageSize: 500 }),
    listVendors(context.activeBusinessId, { pageSize: 500 }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New payment</h1>
      <NewPaymentForm
        bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
        customers={customers.items.map((c) => ({
          id: String(c._id),
          label: c.companyName ? `${c.displayName} (${c.companyName})` : c.displayName,
        }))}
        vendors={vendors.items.map((v) => ({
          id: String(v._id),
          label: v.companyName ? `${v.displayName} (${v.companyName})` : v.displayName,
        }))}
        recordCustomerPaymentAction={recordCustomerPaymentAction}
        recordVendorPaymentAction={recordVendorPaymentAction}
        canCreateExpense={can(context.membership, "expenses", "create")}
        canCreateIndirectIncome={can(context.membership, "indirect_income", "create")}
      />
    </div>
  );
}
