import { describe, expect, it } from "vitest";
import { seedRotation } from "@/components/ui/StatusStamp";

describe("seedRotation", () => {
  it("is deterministic for the same seed", () => {
    const seed = "68a1f2c3e4b5a6d7c8e9f0a1";
    expect(seedRotation(seed)).toBe(seedRotation(seed));
  });

  it("always returns a value within -2..2 degrees", () => {
    const seeds = ["a", "invoice-1", "68a1f2c3e4b5a6d7c8e9f0a1", "", "z".repeat(50)];
    for (const seed of seeds) {
      const rotation = seedRotation(seed);
      expect(rotation).toBeGreaterThanOrEqual(-2);
      expect(rotation).toBeLessThanOrEqual(2);
    }
  });

  it("spreads different seeds across the range rather than collapsing to one value", () => {
    const rotations = new Set(
      Array.from({ length: 20 }, (_, i) => seedRotation(`doc-${i}`)),
    );
    expect(rotations.size).toBeGreaterThan(1);
  });
});
