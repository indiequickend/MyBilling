import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken, tokensEqual } from "@/lib/auth/tokens";

describe("password hashing", () => {
  it("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("Sup3rSecret!Pass");
    expect(await verifyPassword(hash, "Sup3rSecret!Pass")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("does not throw on a malformed stored hash", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(false);
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});

describe("tokens", () => {
  it("generates high-entropy, unique tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it("hashToken is deterministic for the same input", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("hashToken differs for different inputs", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it("tokensEqual matches only identical values", () => {
    const token = generateToken();
    expect(tokensEqual(token, token)).toBe(true);
    expect(tokensEqual(token, generateToken())).toBe(false);
    expect(tokensEqual(token, token.slice(0, -1))).toBe(false);
  });
});
