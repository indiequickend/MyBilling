import { NextResponse } from "next/server";
import { findPaymentLinkByGatewayPaymentLinkId } from "@/lib/db/queries/paymentLinks";
import { findPaymentGatewayAccount } from "@/lib/db/queries/paymentGateway";
import { recordGatewayPayment } from "@/lib/db/queries/invoices";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { verifyRazorpayWebhookSignature } from "@/lib/paymentGateway/razorpay";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string } };
    payment?: { entity?: { id?: string; amount?: number } };
  };
};

/**
 * Inbound receiver for Razorpay's webhooks (multi-tenant: any business's Payment Link can land
 * here). Razorpay's webhook delivery is documented as at-least-once, so this — and
 * recordGatewayPayment — must be idempotent; duplicate deliveries of the same event are expected,
 * not an error condition. Always returns 200 once the signature is verified and the event is
 * either handled or recognized-but-ignored, so Razorpay doesn't keep retrying a well-understood
 * "nothing to do" response as if it were a failure.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let parsed: RazorpayWebhookPayload;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const gatewayPaymentLinkId = parsed.payload?.payment_link?.entity?.id;
  if (!gatewayPaymentLinkId) {
    // Not a payment-link event we care about (e.g. a plain order/payment webhook) — acknowledge
    // and move on rather than erroring on every event type Razorpay might send.
    return NextResponse.json({ ok: true });
  }

  const paymentLink = await findPaymentLinkByGatewayPaymentLinkId(gatewayPaymentLinkId);
  if (!paymentLink) return NextResponse.json({ error: "Unknown payment link" }, { status: 404 });

  const gatewayAccount = await findPaymentGatewayAccount(String(paymentLink.businessId));
  if (!gatewayAccount) return NextResponse.json({ error: "Gateway not configured" }, { status: 404 });

  if (!verifyRazorpayWebhookSignature(rawBody, signature, gatewayAccount.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (parsed.event !== "payment_link.paid") {
    return NextResponse.json({ ok: true });
  }
  if (!paymentLink.linkedInvoiceId) {
    return NextResponse.json({ ok: true });
  }

  const gatewayPaymentId = parsed.payload?.payment?.entity?.id;
  const amountMinor = parsed.payload?.payment?.entity?.amount;
  if (!gatewayPaymentId || typeof amountMinor !== "number") {
    return NextResponse.json({ error: "Malformed payment payload" }, { status: 400 });
  }

  const business = await findBusinessById(String(paymentLink.businessId));
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const result = await recordGatewayPayment({
    invoiceId: String(paymentLink.linkedInvoiceId),
    businessId: String(paymentLink.businessId),
    amountMinor,
    bankAccountId: String(gatewayAccount.settlementBankAccountId),
    gatewayPaymentId,
    paymentDate: new Date(),
    createdByUserId: String(business.createdByUserId),
    referenceNote: `Razorpay payment link ${gatewayPaymentLinkId}`,
  });

  if (!result.ok) {
    console.error("recordGatewayPayment failed", result.reason);
    // Acknowledge anyway: retrying won't fix "invoice no longer payable" (e.g. already paid or
    // cancelled by the business in the meantime) — that's a terminal state, not a transient error.
    return NextResponse.json({ ok: true, warning: result.reason });
  }
  return NextResponse.json({ ok: true });
}
