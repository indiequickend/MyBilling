import { describe, expect, it } from "vitest";
import { escapeRegex, clampPageParams } from "@/lib/db/queryHelpers";

describe("escapeRegex", () => {
  it("neutralizes regex metacharacters in search input", () => {
    const term = ".*";
    const pattern = new RegExp(escapeRegex(term));
    expect(pattern.test("anything")).toBe(false);
    expect(pattern.test(".*")).toBe(true);
  });

  it("neutralizes a NoSQL-injection-shaped search term so it's treated as literal text", () => {
    const term = '{"$gt": ""}';
    const pattern = new RegExp(escapeRegex(term), "i");
    expect(pattern.source).toContain("\\$gt");
    expect(pattern.test("some unrelated value")).toBe(false);
    expect(pattern.test('{"$gt": ""}')).toBe(true);
  });
});

describe("clampPageParams", () => {
  it("defaults to page 1, pageSize 25", () => {
    expect(clampPageParams({})).toEqual({ page: 1, pageSize: 25 });
  });

  it("clamps out-of-range values", () => {
    expect(clampPageParams({ page: -5, pageSize: 5000 })).toEqual({ page: 1, pageSize: 100 });
    expect(clampPageParams({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: 1 });
  });
});
