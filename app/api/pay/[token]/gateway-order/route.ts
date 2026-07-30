import { NextResponse } from "next/server";
import { hashToken } from "@/lib/auth/tokens";
import { checkRateLimit, rateLimitKeyFromHeaders } from "@/lib/auth/rateLimit";
import { absoluteUrl } from "@/lib/auth/urls";
import {
  findValidPaymentLinkByTokenHash,
  setPaymentLinkGatewayId,
} from "@/lib/db/queries/paymentLinks";
import { findPaymentGatewayAccount } from "@/lib/db/queries/paymentGateway";
import { isGatewayEnabled, createPaymentLinkOrder } from "@/lib/paymentGateway/razorpay";

/**
 * Public, unauthenticated — same trust model as app/pay/[token]/page.tsx (the token itself is the
 * secret). Starts an online checkout for a Payment Link and redirects the browser to Razorpay's
 * hosted page; Razorpay calls back to app/api/webhooks/razorpay/route.ts when the payment
 * completes, not this route (this route never marks anything paid).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!checkRateLimit(rateLimitKeyFromHeaders(request.headers, "pay-link-gateway-order"), 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const paymentLink = await findValidPaymentLinkByTokenHash(hashToken(token));
  if (!paymentLink) {
    return NextResponse.json({ error: "This payment link is invalid or has expired." }, { status: 404 });
  }
  if (!paymentLink.linkedInvoiceId) {
    return NextResponse.json({ error: "Online payment isn't available for this link." }, { status: 400 });
  }

  const gatewayAccount = await findPaymentGatewayAccount(String(paymentLink.businessId));
  if (!isGatewayEnabled(gatewayAccount)) {
    return NextResponse.json({ error: "Online payment isn't available for this business." }, { status: 400 });
  }

  try {
    const order = await createPaymentLinkOrder(gatewayAccount, {
      amountMinor: paymentLink.amountMinor,
      description: paymentLink.note || "Payment",
      callbackUrl: absoluteUrl(`/pay/${token}`),
      referenceId: String(paymentLink._id),
    });
    await setPaymentLinkGatewayId(String(paymentLink._id), order.id);
    return NextResponse.redirect(order.shortUrl, { status: 303 });
  } catch (err) {
    console.error("Failed to create Razorpay payment link order", err);
    return NextResponse.json({ error: "Couldn't start online payment. Try again shortly." }, { status: 502 });
  }
}
