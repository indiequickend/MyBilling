import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const ISSUER = "MyBilling";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function buildProvisioningUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  try {
    // otplib defaults to zero time-drift tolerance, which rejects a
    // momentarily-valid code that crosses the 30s window boundary between
    // generation and submission — a real annoyance for real users (typing
    // delay, clock skew), not just a testing nuisance. One step of tolerance
    // in each direction is the standard, widely-used TOTP practice.
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

/** Human-typeable backup codes (e.g. "a1b2c-d3e4f"), 10 by default, each single-use. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashPassword(code)));
}

/** Returns the matching stored hash (so the caller can remove just that one), or null. */
export async function findMatchingBackupCodeHash(
  hashes: string[],
  code: string,
): Promise<string | null> {
  for (const hash of hashes) {
    if (await verifyPassword(hash, code)) return hash;
  }
  return null;
}
