import { connectToDatabase } from "@/lib/db/connect";
import { PaymentGatewayAccount } from "@/lib/db/models/PaymentGatewayAccount";

export type PaymentGatewayAccountInput = {
  businessId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  accountId?: string;
  settlementBankAccountId: string;
};

export async function findPaymentGatewayAccount(businessId: string) {
  await connectToDatabase();
  return PaymentGatewayAccount.findOne({ businessId });
}

/** One account per business — upserts so "Connect" and "Update credentials" are the same form. */
export async function upsertPaymentGatewayAccount(input: PaymentGatewayAccountInput) {
  await connectToDatabase();
  return PaymentGatewayAccount.findOneAndUpdate(
    { businessId: input.businessId },
    {
      $set: {
        provider: "razorpay",
        keyId: input.keyId,
        keySecret: input.keySecret,
        webhookSecret: input.webhookSecret,
        accountId: input.accountId,
        settlementBankAccountId: input.settlementBankAccountId,
        activationStatus: "active",
      },
      $setOnInsert: { isEnabled: false },
    },
    { upsert: true, returnDocument: "after" },
  );
}

export async function setPaymentGatewayEnabled(businessId: string, isEnabled: boolean) {
  await connectToDatabase();
  return PaymentGatewayAccount.findOneAndUpdate(
    { businessId },
    { $set: { isEnabled } },
    { returnDocument: "after" },
  );
}
