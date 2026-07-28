import { connectToDatabase } from "@/lib/db/connect";
import { Session } from "@/lib/db/models/Session";

export async function createSessionRecord(input: {
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
}) {
  await connectToDatabase();
  return Session.create({
    userId: input.userId,
    tokenHash: input.tokenHash,
    userAgent: input.userAgent,
    ip: input.ip,
    lastActiveAt: new Date(),
    expiresAt: input.expiresAt,
  });
}

export async function findActiveSessionByTokenHash(tokenHash: string) {
  await connectToDatabase();
  return Session.findOne({
    tokenHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function touchSession(sessionId: string, expiresAt: Date) {
  await connectToDatabase();
  return Session.findByIdAndUpdate(sessionId, {
    $set: { lastActiveAt: new Date(), expiresAt },
  });
}

/** Scoped to userId so one user can never revoke another user's session by guessing an id. */
export async function revokeSession(sessionId: string, userId: string) {
  await connectToDatabase();
  return Session.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function revokeAllSessionsForUser(userId: string) {
  await connectToDatabase();
  return Session.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function listActiveSessionsForUser(userId: string) {
  await connectToDatabase();
  return Session.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ lastActiveAt: -1 });
}
