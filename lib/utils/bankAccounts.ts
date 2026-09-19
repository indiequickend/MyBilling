/** Bank/cash account as passed to payment forms; `isDefault` mirrors Settings → Banks. */
export type BankAccountOption = { id: string; name: string; isDefault?: boolean };

/** The account a new payment should preselect: the one flagged default, else the first account
 * (so a business that never flagged one still gets a sensible preselection). */
export function pickDefaultBankAccountId(accounts: BankAccountOption[]): string | undefined {
  return (accounts.find((a) => a.isDefault) ?? accounts[0])?.id;
}

/** New payments default to UPI. */
export const DEFAULT_PAYMENT_MODE = "upi" as const;
