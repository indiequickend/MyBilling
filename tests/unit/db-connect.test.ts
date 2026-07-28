import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectToDatabase } from "../../lib/db/connect";

describe("connectToDatabase", () => {
  const originalUri = process.env.MONGODB_URI;

  beforeEach(() => {
    delete process.env.MONGODB_URI;
  });

  afterEach(() => {
    if (originalUri) process.env.MONGODB_URI = originalUri;
  });

  it("fails fast with a clear error when MONGODB_URI is missing", async () => {
    await expect(connectToDatabase()).rejects.toThrow(/MONGODB_URI is not set/);
  });
});
