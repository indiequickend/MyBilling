import Papa from "papaparse";
import type { ZodType } from "zod";

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

const INSERT_BATCH_SIZE = 25;

/**
 * The generalized bulk-import engine (Phase 13) — a three-pass validate/resolve/insert pipeline
 * over parsed CSV rows. Defaults to PARTIAL commit (valid rows are inserted, invalid rows are
 * skipped and reported with reasons), a deliberate behavior change from the all-or-nothing
 * Expense bulk-upload precedent (app/(dashboard)/expenses/bulk-upload/actions.ts) which is left
 * untouched. Pass `allOrNothing: true` to reproduce that older behavior instead.
 */
export async function runBulkImport<RowShape, Resolved>(params: {
  rows: Record<string, string>[];
  rowSchema: ZodType<RowShape>;
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

  // Pass 1 — schema validation.
  const schemaValidated: { rowNumber: number; data: RowShape }[] = [];
  params.rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const result = params.rowSchema.safeParse(row);
    if (!result.success) {
      rowErrors.push({ row: rowNumber, message: result.error.issues[0]?.message ?? "Invalid row" });
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
