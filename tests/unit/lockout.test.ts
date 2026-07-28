import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectToDatabase } from "@/lib/db/connect";
import { createUser, findUserById } from "@/lib/db/queries/users";
import { User } from "@/lib/db/models/User";
import { recordFailedLogin, clearFailedLogins, isLocked } from "@/lib/auth/lockout";

describe("account lockout", () => {
  const email = `lockout-test-${Date.now()}@example.com`;
  let userId: string;

  beforeAll(async () => {
    await connectToDatabase();
    const user = await createUser({ email, passwordHash: "x", name: "Lockout Test" });
    userId = String(user._id);
  });

  afterAll(async () => {
    await User.deleteOne({ _id: userId });
  });

  it("does not lock before the 5th failed attempt", async () => {
    for (let i = 0; i < 4; i++) {
      await recordFailedLogin(userId);
    }
    const user = await findUserById(userId);
    expect(isLocked(user!)).toBe(false);
  });

  it("locks on the 5th failed attempt", async () => {
    await recordFailedLogin(userId); // 5th
    const user = await findUserById(userId);
    expect(isLocked(user!)).toBe(true);
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("escalates the lockout window on further attempts while still locked", async () => {
    const before = (await findUserById(userId))!.lockedUntil!.getTime();
    await recordFailedLogin(userId); // 6th — should escalate to a longer window
    const after = (await findUserById(userId))!.lockedUntil!.getTime();
    expect(after).toBeGreaterThan(before);
  });

  it("clearFailedLogins resets the counter and lock", async () => {
    await clearFailedLogins(userId);
    const user = await findUserById(userId);
    expect(user!.failedLoginAttempts).toBe(0);
    expect(isLocked(user!)).toBe(false);
  });
});
