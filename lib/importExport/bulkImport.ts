import Papa from "papaparse";
import type { ZodError, ZodType } from "zod";

type ZodIssue = ZodError["issues"][number];

/** Same ceiling as EXPENSE_BULK_UPLOAD_MAX_ROWS, generalized — this app has no background job
 * infrastructure, so an upload is validated and inserted synchronously in one request. */
export const BULK_IMPORT_MAX_ROWS = 500;
export const BULK_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type BulkImportRowError = { row: number; message: string };

export type BulkImportResult = {
  totalRows: number;
  insertedCount: number;
  skippedCount: number;
  rowErrors: BulkImportRowError[];
};

export type ParseCsvRowsResult =
  | { ok: true; rows: Record<string, string>[] }
  | { ok: false; error: string };

/** Lifts the Papa.parse-and-validate boilerplate previously duplicated between
 * expenses/bulk-upload/actions.ts and payments/reconciliation/actions.ts: header parse, parse-error
 * surfacing, empty-file check, row-count ceiling, required-column check. */
export function parseCsvRows(text: string, requiredColumns: readonly string[]): ParseCsvRowsResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    return { ok: false, error: `Couldn't parse this file as CSV: ${parsed.errors[0].message}` };
  }

  const rows = parsed.data;
  if (rows.length === 0) {
    return { ok: false, error: "The file has no data rows." };
  }
  if (rows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `This file has ${rows.length} rows — bulk upload accepts at most ${BULK_IMPORT_MAX_ROWS} rows per file. Split it into smaller files.`,
    };
  }

  const missingColumns = requiredColumns.filter((col) => !(col in (rows[0] ?? {})));
  if (missingColumns.length > 0) {
    return { ok: false, error: `Missing required column(s): ${missingColumns.join(", ")}.` };
  }

  return { ok: true, rows };
}

/** Yields control back to the event loop between insert batches so a large synchronous-looking
 * request doesn't block it end-to-end — still one request/response, no queue. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Zod reports a field built from `z.union([...])` (e.g. `optionalRupeesToMinorUnits`, which unions
 * a literal "" against a real amount parser) as one opaque "Invalid input" issue with the actual,
 * useful per-branch reasons ("Enter a valid amount", etc.) buried in `issue.errors`. Surfacing the
 * bare top-level message left every bulk-upload row error saying just "Invalid input" with no way
 * to tell what was actually wrong with the cell — this recurses into union issues to find the most
 * specific message instead. Prefers a `custom` issue (an explicit `ctx.addIssue` message, which is
 * always the human-written one) over a bare type-mismatch from a schema like `z.literal("")`.
 */
function describeIssue(issue: ZodIssue): string {
  if (issue.code === "invalid_union" && Array.isArray(issue.errors)) {
    const branches = issue.errors as ZodIssue[][];
    for (const branch of branches) {
      const custom = branch.find((sub) => sub.code === "custom");
      if (custom) return describeIssue(custom);
    }
    const firstNonEmpty = branches.find((branch) => branch.length > 0);
    if (firstNonEmpty) return describeIssue(firstNonEmpty[0]);
  }
  return issue.message;
}

/** Prefixes the field name onto the resolved message (e.g. `sellingPriceMinor: Enter a valid
 * amount`) so a row with several columns still tells the uploader which cell to fix. */
function formatRowError(issue: ZodIssue): string {
  const message = describeIssue(issue);
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${message}` : message;
}

const INSERT_BATCH_SIZE = 25;

/**
 * The generalized bulk-import engine (Phase 13) — a three-pass validate/resolve/insert pipeline
 * over parsed CSV rows. Defaults to PARTIAL commit (valid rows are inserted, invalid rows are
 * skipped and reported with reasons), a deliberate behavior change from the all-or-nothing
 * Expense bulk-upload precedent (app/(dashboard)/expenses/bulk-upload/actions.ts) which is left
 * untouched. Pass `allOrNothing: true` to reproduce that older behavior instead.
 */
export async function runBulkImport<RowShape, Resolved, RawRow = Record<string, string>>(params: {
  rows: RawRow[];
  rowSchema: ZodType<RowShape>;
  /** Maps a raw row to the row number reported in errors. Defaults to `index + 2` (CSV line
   * number: +1 for 0-index, +1 for the header row) — override when `rows` isn't one entry per
   * raw CSV line, e.g. a pre-grouped row that carries its own original line number. */
  rowNumberOf?: (row: RawRow, index: number) => number;
  /** Pass 2 — DB-dependent cross-reference/lookup resolution (not expressible in Zod alone), e.g.
   * resolving a free-text categoryName to an id, auto-creating it if new. */
  resolveRow: (
    data: RowShape,
    rowNumber: number,
  ) => Promise<{ ok: true; resolved: Resolved } | { ok: false; message: string }>;
  /** Pass 3 — the actual write for one validated+resolved row. */
  insertRow: (
    resolved: Resolved,
    rowNumber: number,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Default false (partial commit). Set true to require every row to pass before any insert. */
  allOrNothing?: boolean;
}): Promise<BulkImportResult> {
  const totalRows = params.rows.length;
  const rowErrors: BulkImportRowError[] = [];
  const rowNumberOf = params.rowNumberOf ?? ((_row: RawRow, i: number) => i + 2);

  // Pass 1 — schema validation.
  const schemaValidated: { rowNumber: number; data: RowShape }[] = [];
  params.rows.forEach((row, i) => {
    const rowNumber = rowNumberOf(row, i);
    const result = params.rowSchema.safeParse(row);
    if (!result.success) {
      const issue = result.error.issues[0];
      rowErrors.push({ row: rowNumber, message: issue ? formatRowError(issue) : "Invalid row" });
      return;
    }
    schemaValidated.push({ rowNumber, data: result.data });
  });

  // Pass 2 — DB-dependent resolution.
  const resolved: { rowNumber: number; resolved: Resolved }[] = [];
  for (const { rowNumber, data } of schemaValidated) {
    const result = await params.resolveRow(data, rowNumber);
    if (!result.ok) {
      rowErrors.push({ row: rowNumber, message: result.message });
      continue;
    }
    resolved.push({ rowNumber, resolved: result.resolved });
  }

  if (params.allOrNothing && rowErrors.length > 0) {
    return { totalRows, insertedCount: 0, skippedCount: totalRows, rowErrors: rowErrors.slice(0, 50) };
  }

  // Pass 3 — sequential insert (not Promise.all) so two rows sharing a newly auto-created lookup
  // value (e.g. a brand-new category name) never race against a unique index.
  let insertedCount = 0;
  for (let i = 0; i < resolved.length; i++) {
    const { rowNumber, resolved: resolvedRow } = resolved[i];
    try {
      const result = await params.insertRow(resolvedRow, rowNumber);
      if (result.ok) {
        insertedCount += 1;
      } else {
        rowErrors.push({ row: rowNumber, message: result.message });
      }
    } catch (err) {
      rowErrors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "Failed to save this row",
      });
    }
    if ((i + 1) % INSERT_BATCH_SIZE === 0) await yieldToEventLoop();
  }

  return {
    totalRows,
    insertedCount,
    skippedCount: totalRows - insertedCount,
    rowErrors: rowErrors.slice(0, 50),
  };
}
