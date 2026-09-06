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

  it("surfaces the specific reason for a union-typed field instead of Zod's generic 'Invalid input'", async () => {
    // Mirrors lib/validation/shared.ts's optionalRupeesToMinorUnits: a union of a literal "" (not
    // set) and a real parser with a custom message — the shape that made every bad amount cell in
    // the product bulk-upload report a bare "Invalid input" with no way to tell what was wrong.
    const unionSchema = z.object({
      name: z.string(),
      amount: z
        .union([z.string(), z.number()])
        .transform((val) => (typeof val === "string" ? val.trim() : val))
        .pipe(
          z.union([
            z.literal(""),
            z.string().refine((s) => /^\d+(\.\d{1,2})?$/.test(s), "Enter a valid amount"),
          ]),
        ),
    });

    const result = await runBulkImport<z.infer<typeof unionSchema>, z.infer<typeof unionSchema>>({
      rows: [{ name: "Row 1", amount: "1,499.00" }],
      rowSchema: unionSchema,
      resolveRow: async (data) => ({ ok: true, resolved: data }),
      insertRow: async () => ({ ok: true }),
    });

    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].message).toContain("Enter a valid amount");
    expect(result.rowErrors[0].message).not.toBe("Invalid input");
  });

  it("rowNumberOf lets a caller report the original line number for a pre-grouped row", async () => {
    const grouped = [
      { sourceLine: 5, name: "Row 5" },
      { sourceLine: 12, name: "" }, // fails schema validation
    ];

    const result = await runBulkImport<{ name: string }, { name: string }, { sourceLine: number; name: string }>({
      rows: grouped,
      rowSchema: z.object({ name: z.string().min(1, "Name is required") }),
      rowNumberOf: (row) => row.sourceLine,
      resolveRow: async (data) => ({ ok: true, resolved: data }),
      insertRow: async () => ({ ok: true }),
    });

    expect(result.rowErrors).toEqual([{ row: 12, message: "name: Name is required" }]);
  });
});
