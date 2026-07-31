import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runBulkImport } from "@/lib/importExport/bulkImport";

const rowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  amount: z.coerce.number().min(0, "Amount must be non-negative"),
});

/** 100 synthetic rows: row 7 fails schema validation (negative amount), row 42 fails resolution
 * (name flagged as "unresolvable"), row 91 fails insertion (name flagged as "unwritable") — one
 * failure per pass, matching build_phases.md Phase 13's literal verify criterion ("3 bad rows out
 * of 100 ... commits the other 97"). */
function makeRows(): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (let i = 1; i <= 100; i++) {
    if (i === 7) {
      rows.push({ name: `Row ${i}`, amount: "-5" });
    } else if (i === 42) {
      rows.push({ name: "unresolvable", amount: "10" });
    } else if (i === 91) {
      rows.push({ name: "unwritable", amount: "10" });
    } else {
      rows.push({ name: `Row ${i}`, amount: "10" });
    }
  }
  return rows;
}

describe("runBulkImport", () => {
  it("partial commit (default): imports 97 of 100 rows, reporting exactly the 3 failures with reasons", async () => {
    const inserted: string[] = [];

    const result = await runBulkImport<z.infer<typeof rowSchema>, z.infer<typeof rowSchema>>({
      rows: makeRows(),
      rowSchema,
      resolveRow: async (data) => {
        if (data.name === "unresolvable") {
          return { ok: false, message: "Could not resolve this row" };
        }
        return { ok: true, resolved: data };
      },
      insertRow: async (resolved) => {
        if (resolved.name === "unwritable") {
          return { ok: false, message: "Failed to save this row" };
        }
        inserted.push(resolved.name);
        return { ok: true };
      },
    });

    expect(result.totalRows).toBe(100);
    expect(result.insertedCount).toBe(97);
    expect(result.skippedCount).toBe(3);
    expect(inserted).toHaveLength(97);

    const failedRowNumbers = result.rowErrors.map((e) => e.row).sort((a, b) => a - b);
    // Row N is CSV row N+1 (1 header row + rows 1..N-1 before it) — see runBulkImport's
    // `i + 2` row-numbering (0-indexed array position + 1 for 0-index + 1 for the header row).
    expect(failedRowNumbers).toEqual([8, 43, 92]);
    expect(result.rowErrors.every((e) => typeof e.message === "string" && e.message.length > 0)).toBe(
      true,
    );
  });

  it("allOrNothing: true reproduces the old all-or-nothing semantics — zero inserts when any row fails", async () => {
    const inserted: string[] = [];

    const result = await runBulkImport<z.infer<typeof rowSchema>, z.infer<typeof rowSchema>>({
      rows: makeRows(),
      rowSchema,
      resolveRow: async (data) => {
        if (data.name === "unresolvable") {
          return { ok: false, message: "Could not resolve this row" };
        }
        return { ok: true, resolved: data };
      },
      insertRow: async (resolved) => {
        inserted.push(resolved.name);
        return { ok: true };
      },
      allOrNothing: true,
    });

    expect(result.insertedCount).toBe(0);
    expect(result.skippedCount).toBe(100);
    expect(inserted).toHaveLength(0);
  });
});
