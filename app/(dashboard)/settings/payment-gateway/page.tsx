import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findPaymentGatewayAccount } from "@/lib/db/queries/paymentGateway";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { togglePaymentGatewayEnabledAction } from "./actions";
import { PaymentGatewayForm } from "./PaymentGatewayForm";

export default async function PaymentGatewayPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_integrations")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [account, bankAccounts] = await Promise.all([
    findPaymentGatewayAccount(context.activeBusinessId),
    listBankAccounts(context.activeBusinessId, "active"),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Payment Gateway</h1>
        <p className="text-sm text-muted-foreground">
          Connect a Razorpay sub-account so{" "}
          <a href="/payments/links" className="underline">
            Payment Links
          </a>{" "}
          against an invoice can collect payment online, in addition to manual bank transfer.
        </p>
      </div>

      {account ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Connection status</span>
              <Badge variant={account.isEnabled ? "success" : "outline"}>
                {account.isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={togglePaymentGatewayEnabledAction}>
              <input type="hidden" name="isEnabled" value={String(account.isEnabled)} />
              <Button type="submit" variant="outline" size="sm">
                {account.isEnabled ? "Disable" : "Enable"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="mb-3 text-base font-semibold">
          {account ? "Update connection" : "Connect Razorpay"}
        </h2>
        <PaymentGatewayForm
          bankAccounts={bankAccounts.map((a) => ({ id: String(a._id), name: a.name }))}
          defaultValues={
            account
              ? {
                  keyId: account.keyId,
                  accountId: account.accountId ?? "",
                  settlementBankAccountId: String(account.settlementBankAccountId),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
