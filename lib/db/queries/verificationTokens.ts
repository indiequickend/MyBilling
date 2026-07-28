import { connectToDatabase } from "@/lib/db/connect";
import { VerificationToken } from "@/lib/db/models/VerificationToken";

export type TokenPurpose = "email_verify" | "password_reset";

export async function createVerificationToken(input: {
  userId: string;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}) {
  await connectToDatabase();
  return VerificationToken.create({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  });
}

export async function findValidToken(tokenHash: string, purpose: TokenPurpose) {
  await connectToDatabase();
  return VerificationToken.findOne({
    tokenHash,
    purpose,
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function markTokenUsed(tokenId: string) {
  await connectToDatabase();
  return VerificationToken.findByIdAndUpdate(tokenId, { $set: { usedAt: new Date() } });
}

/** Invalidates prior outstanding tokens of a purpose so only the newest one is usable. */
export async function invalidateTokensForUser(userId: string, purpose: TokenPurpose) {
  await connectToDatabase();
  return VerificationToken.updateMany(
    { userId, purpose, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );
}
