/** Sensitive-field masking (project_spec.md's Security requirements: "bank account numbers, PAN,
 * and GSTIN masked by default in the UI, full value only on explicit reveal"). Applied server-side
 * before a value ever reaches a Client Component or an unauthenticated page — never CSS-only. */

function maskKeepingLast(value: string, keep: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= keep) return "•".repeat(trimmed.length);
  return "•".repeat(trimmed.length - keep) + trimmed.slice(-keep);
}

export function maskBankAccountNumber(accountNumber: string | null | undefined): string | null {
  if (!accountNumber) return null;
  return maskKeepingLast(accountNumber, 4);
}

/** ABCDE1234F -> •••••1234F (last 4, PAN's checksum-bearing tail). */
export function maskPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  return maskKeepingLast(pan, 4);
}

/** 27ABCDE1234F1Z5 -> •••••••••••1Z5 (last 3 — state code stays hidden, matches CLAUDE.md's "same
 * way the UI masks them" convention used elsewhere for GSTIN). */
export function maskGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  return maskKeepingLast(gstin, 3);
}

export function maskUpiId(upiId: string | null | undefined): string | null {
  if (!upiId) return null;
  const [handle, ...rest] = upiId.split("@");
  if (rest.length === 0) return maskKeepingLast(upiId, 2);
  return `${maskKeepingLast(handle, 2)}@${rest.join("@")}`;
}
