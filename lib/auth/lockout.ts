import {
  incrementFailedLoginAttempts,
  resetFailedLoginAttempts,
  setLockedUntil,
} from "@/lib/db/queries/users";

const MAX_ATTEMPTS_BEFORE_LOCK = 5;
/** Escalating backoff once locked: 1m, 5m, 15m, then 60m for every attempt after. */
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function isLocked(user: { lockedUntil?: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

/** Call after a failed password check. Locks the account once the threshold is hit. */
export async function recordFailedLogin(userId: string): Promise<void> {
  const updated = await incrementFailedLoginAttempts(userId);
  const attempts = updated?.failedLoginAttempts ?? MAX_ATTEMPTS_BEFORE_LOCK;

  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCK) {
    const tier = Math.min(attempts - MAX_ATTEMPTS_BEFORE_LOCK, BACKOFF_MS.length - 1);
    await setLockedUntil(userId, new Date(Date.now() + BACKOFF_MS[tier]));
  }
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await resetFailedLoginAttempts(userId);
}
