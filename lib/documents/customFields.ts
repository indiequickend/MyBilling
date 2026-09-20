import { formatDate } from "@/lib/utils/date";

type FieldDef = { key: string; label: string; type?: string };

export type CustomFieldEntry = { label: string; value: string };

/**
 * Carries custom field values from a source document to its conversion target. Defs are
 * configured per document type, so a value is forwarded to the target def with the same key, or
 * failing that the same label (case-insensitive); values with no matching target def are dropped.
 */
export function mapCustomFieldValues(
  sourceDefs: FieldDef[] | undefined,
  sourceValues: Record<string, unknown> | undefined,
  targetDefs: FieldDef[] | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!sourceValues || !targetDefs) return out;
  for (const target of targetDefs) {
    const sourceDef =
      sourceDefs?.find((d) => d.key === target.key) ??
      sourceDefs?.find((d) => d.label.trim().toLowerCase() === target.label.trim().toLowerCase());
    const value = sourceValues[sourceDef?.key ?? target.key];
    if (value !== undefined && value !== null && value !== "") out[target.key] = value;
  }
  return out;
}

/** Non-empty custom field values as label/value pairs for display on a document PDF. */
export function resolveCustomFieldEntries(
  defs: FieldDef[] | undefined,
  values: Record<string, unknown> | undefined,
): CustomFieldEntry[] {
  const entries: CustomFieldEntry[] = [];
  for (const def of defs ?? []) {
    const raw = values?.[def.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = def.type === "date" && !Number.isNaN(new Date(String(raw)).getTime()) ? formatDate(String(raw)) : String(raw);
    entries.push({ label: def.label, value });
  }
  return entries;
}
