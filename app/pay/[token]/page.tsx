import { headers } from "next/headers";
import { hashToken } from "@/lib/auth/tokens";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";
import { findValidPaymentLinkByTokenHash } from "@/lib/db/queries/paymentLinks";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { findInvoiceById } from "@/lib/db/queries/invoices";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { findPaymentGatewayAccount } from "@/lib/db/queries/paymentGateway";
import { isGatewayEnabled } from "@/lib/paymentGateway/razorpay";
import { minorToRupeesString } from "@/lib/utils/money";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";

// Never cache a page keyed by a secret token, and never let it participate in static generation.
export const dynamic = "force-dynamic";

function InvalidLinkCard() {
  return (
    <AuthCard title="Payment link unavailable">
      <p className="text-sm text-muted-foreground">
        This payment link is invalid or has expired. Ask the business to send you a new one.
      </p>
    </AuthCard>
  );
}

export default async function PaymentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const h = await headers();
  if (!checkRateLimit(rateLimitKeyFromHeaders(h, "pay-link"), 30, 60_000)) {
    return (
      <AuthCard title="Too many requests">
        <p className="text-sm text-muted-foreground">Please wait a moment and try again.</p>
      </AuthCard>
    );
  }

  const paymentLink = await findValidPaymentLinkByTokenHash(hashToken(token));
  if (!paymentLink) return <InvalidLinkCard />;

  const business = await findBusinessById(String(paymentLink.businessId));
  if (!business) return <InvalidLinkCard />;

  const [invoice, bankAccounts, gatewayAccount] = await Promise.all([
    paymentLink.linkedInvoiceId
      ? findInvoiceById(String(paymentLink.linkedInvoiceId), String(paymentLink.businessId))
      : null,
    listBankAccounts(String(paymentLink.businessId), "active"),
    findPaymentGatewayAccount(String(paymentLink.businessId)),
  ]);
  const defaultBankAccount = bankAccounts.find((a) => a.isDefault) ?? bankAccounts[0];
  // Online collection is only offered for invoice-linked links (see PaymentLink.ts's doc comment).
  const canPayOnline = !!paymentLink.linkedInvoiceId && isGatewayEnabled(gatewayAccount);

  return (
    <AuthCard title={business.brandName || business.name} subtitle="Payment request">
      <div>
        <p className="text-sm text-muted-foreground">Amount due</p>
        <p className="text-3xl font-semibold">₹{minorToRupeesString(paymentLink.amountMinor)}</p>
      </div>

      {invoice ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">Against invoice</p>
          <p className="font-medium">{invoice.docNumber ?? "—"}</p>
        </div>
      ) : null}

      {paymentLink.note ? <p className="text-sm text-muted-foreground">{paymentLink.note}</p> : null}

      {canPayOnline ? (
        <form action={`/api/pay/${token}/gateway-order`} method="post">
          <Button type="submit" className="w-full">
            Pay online
          </Button>
        </form>
      ) : null}

      {defaultBankAccount ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="mb-2 font-medium">{canPayOnline ? "Or pay via bank transfer" : "Pay via bank transfer"}</p>
          <dl className="space-y-1 text-muted-foreground">
            <div className="flex justify-between gap-4">
              <dt>Account name</dt>
              <dd className="text-foreground">{defaultBankAccount.name}</dd>
            </div>
            {defaultBankAccount.accountNumber ? (
              <div className="flex justify-between gap-4">
                <dt>Account number</dt>
                <dd className="text-foreground">{defaultBankAccount.accountNumber}</dd>
              </div>
            ) : null}
            {defaultBankAccount.ifsc ? (
              <div className="flex justify-between gap-4">
                <dt>IFSC</dt>
                <dd className="text-foreground">{defaultBankAccount.ifsc}</dd>
              </div>
            ) : null}
            {defaultBankAccount.upiId ? (
              <div className="flex justify-between gap-4">
                <dt>UPI ID</dt>
                <dd className="text-foreground">{defaultBankAccount.upiId}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact {business.brandName || business.name} for payment instructions.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        This link expires {new Date(paymentLink.expiresAt).toLocaleString()}.
      </p>
    </AuthCard>
  );
}
