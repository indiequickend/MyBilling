import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentGatewayAccountDoc } from "@/lib/db/models/PaymentGatewayAccount";

/**
 * Thin, typed wrapper around Razorpay's plain REST API (no SDK dependency — see CLAUDE.md's
 * "don't introduce a dependency without reason"). Uses the Payment Links API (a hosted checkout
 * page the payer is redirected to) rather than embedding Checkout.js, so the strict CSP in
 * middleware.ts never needs to allow a third-party script/frame source — a deliberate scope
 * decision for this phase.
 */

export function isGatewayEnabled(
  account: Pick<PaymentGatewayAccountDoc, "isEnabled" | "keyId" | "keySecret"> | null | undefined,
): account is PaymentGatewayAccountDoc {
  return !!account && account.isEnabled && !!account.keyId && !!account.keySecret;
}

export type CreatePaymentLinkOrderInput = {
  amountMinor: number;
  description: string;
  callbackUrl: string;
  referenceId: string;
};

export type CreatePaymentLinkOrderResult = { id: string; shortUrl: string };

/** POSTs to Razorpay's Payment Links API (https://razorpay.com/docs/api/payments/payment-links/). */
export async function createPaymentLinkOrder(
  account: Pick<PaymentGatewayAccountDoc, "keyId" | "keySecret">,
  input: CreatePaymentLinkOrderInput,
): Promise<CreatePaymentLinkOrderResult> {
  const auth = Buffer.from(`${account.keyId}:${account.keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: "INR",
      description: input.description,
      reference_id: input.referenceId,
      callback_url: input.callbackUrl,
      callback_method: "get",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Razorpay payment link creation failed: HTTP ${response.status} ${body}`);
  }
  const data = (await response.json()) as { id: string; short_url: string };
  return { id: data.id, shortUrl: data.short_url };
}

/**
 * Verifies Razorpay's inbound webhook signature (HMAC-SHA256 over the raw request body, keyed on
 * the account's own webhookSecret — Razorpay's own documented scheme, distinct from the outbound
 * webhook signing in lib/webhooks/deliver.ts).
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
