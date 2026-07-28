export const PAYMENT_MODES = ["cash", "bank_transfer", "upi", "card", "cheque", "other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export const BANK_ACCOUNT_TYPES = ["bank", "cash", "personal"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  bank: "Bank",
  cash: "Cash",
  personal: "Personal / Owner",
};
