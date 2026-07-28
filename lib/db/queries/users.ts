import { connectToDatabase } from "@/lib/db/connect";
import { User, type UserDoc } from "@/lib/db/models/User";

export async function countUsers(): Promise<number> {
  await connectToDatabase();
  return User.countDocuments({ deletedAt: { $exists: false } });
}

export async function findUserByEmail(email: string) {
  await connectToDatabase();
  return User.findOne({ email: email.toLowerCase().trim(), deletedAt: { $exists: false } });
}

export async function findUserById(userId: string) {
  await connectToDatabase();
  return User.findOne({ _id: userId, deletedAt: { $exists: false } });
}

/** Same as findUserById but includes the normally-hidden 2FA fields. */
export async function findUserByIdWithSecrets(userId: string) {
  await connectToDatabase();
  return User.findOne({ _id: userId, deletedAt: { $exists: false } }).select(
    "+totpSecret +backupCodeHashes",
  );
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  emailVerifiedAt?: Date;
}) {
  await connectToDatabase();
  return User.create({
    email: input.email.toLowerCase().trim(),
    passwordHash: input.passwordHash,
    name: input.name,
    phone: input.phone,
    emailVerifiedAt: input.emailVerifiedAt,
  });
}

export async function updateUserProfile(
  userId: string,
  updates: { name?: string; phone?: string },
) {
  await connectToDatabase();
  return User.findByIdAndUpdate(userId, { $set: updates }, { returnDocument: "after" });
}

export async function setEmailVerified(userId: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { emailVerifiedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function setPasswordHash(userId: string, passwordHash: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { passwordHash, failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } },
    { returnDocument: "after" },
  );
}

export async function incrementFailedLoginAttempts(userId: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $inc: { failedLoginAttempts: 1 } },
    { returnDocument: "after" },
  );
}

export async function resetFailedLoginAttempts(userId: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } },
    { returnDocument: "after" },
  );
}

export async function setLockedUntil(userId: string, lockedUntil: Date) {
  await connectToDatabase();
  return User.findByIdAndUpdate(userId, { $set: { lockedUntil } }, { returnDocument: "after" });
}

/** Stores a not-yet-confirmed TOTP secret; `totpEnabled` stays false until confirmed. */
export async function setPendingTotpSecret(userId: string, totpSecret: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(userId, { $set: { totpSecret } }, { returnDocument: "after" });
}

export async function enableTotp(userId: string, totpSecret: string, backupCodeHashes: string[]) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { totpEnabled: true, totpSecret, backupCodeHashes } },
    { returnDocument: "after" },
  );
}

export async function disableTotp(userId: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { totpEnabled: false }, $unset: { totpSecret: 1, backupCodeHashes: 1 } },
    { returnDocument: "after" },
  );
}

/** Removes one used backup code so it can't be replayed. */
export async function consumeBackupCodeHash(userId: string, codeHash: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $pull: { backupCodeHashes: codeHash } },
    { returnDocument: "after" },
  );
}

/**
 * Soft-deletes the account. There is no background job in this system to hard-purge
 * later — a soft-deleted account is immediately inaccessible (login/session lookups
 * exclude it); a true hard-purge, if ever needed, is a manual administrative action.
 */
export async function softDeleteUser(userId: string) {
  await connectToDatabase();
  return User.findByIdAndUpdate(
    userId,
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export type { UserDoc };
