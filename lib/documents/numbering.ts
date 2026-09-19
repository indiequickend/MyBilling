import type { DocumentNumberingConfig, DocumentNumberingPreferences } from "@/lib/db/models/Business";
import type { DocumentType } from "@/lib/constants/documentTypes";

/** Pure formatting/config-resolution helpers around the DocumentSequence counter — no DB I/O. */

const DEFAULT_PREFIXES: Record<DocumentType, string> = {
  invoice: "INV-",
  credit_note: "CN-",
  purchase: "PUR-",
  purchase_order: "PO-",
  debit_note: "DN-",
  quotation: "QUO-",
  sales_order: "SO-",
  proforma_invoice: "PI-",
  journal: "JNL-",
  payment: "REC-",
};

export function resolveNumberingConfig(
  numbering: DocumentNumberingPreferences | undefined,
  docType: DocumentType,
): DocumentNumberingConfig {
  const configured = numbering?.configs?.[docType];
  if (configured) return configured;
  return { prefix: DEFAULT_PREFIXES[docType], padding: 4, resetPolicy: "fiscal_year" };
}

/** e.g. April 2025 - March 2026 with fyStartMonth=4 -> "2025-26", for any date in that range. */
export function resolveFiscalYearLabel(date: Date, fyStartMonth: number): string {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const fyStartYear = month >= fyStartMonth ? year : year - 1;
  const fyEndYearShort = String((fyStartYear + 1) % 100).padStart(2, "0");
  return `${fyStartYear}-${fyEndYearShort}`;
}

export function resolveSeriesKey(
  date: Date,
  fyStartMonth: number,
  resetPolicy: DocumentNumberingConfig["resetPolicy"],
): string {
  return resetPolicy === "fiscal_year" ? resolveFiscalYearLabel(date, fyStartMonth) : "default";
}

export function formatDocumentNumber(
  config: DocumentNumberingConfig,
  seriesKey: string,
  number: number,
): string {
  const padded = String(number).padStart(config.padding, "0");
  if (config.resetPolicy !== "fiscal_year") return `${config.prefix}${padded}`;
  // The stored series key is always the long "2026-27" form (stable sequence identity); the
  // short "26-27" style is display-only.
  const fyLabel = config.fyLabelStyle === "short" ? seriesKey.replace(/^\d{2}(\d{2}-)/, "$1") : seriesKey;
  return `${config.prefix}${fyLabel}${config.separator ?? "-"}${padded}`;
}
