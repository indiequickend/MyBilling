/**
 * The one place dates are formatted for display: dd-mm-yyyy (and dd-mm-yyyy HH:mm for timestamps).
 * Never use toLocaleDateString()/toLocaleString() for display — their output depends on the
 * server's/browser's locale, so SSR and the client can even disagree.
 *
 * Fixed to Asia/Kolkata: this is an Indian GST app, business dates are stored as UTC midnight
 * (which is the same calendar day in IST), and real timestamps (createdAt, lastActiveAt, …) should
 * read in IST regardless of where the server runs. Input controls (`<input type="date">`) are not
 * affected — they keep their ISO yyyy-mm-dd value.
 */
const TIME_ZONE = "Asia/Kolkata";

const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type DateInput = Date | string | number;

function toValidDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pick(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** 19-09-2026 */
export function formatDate(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return "";
  const parts = dateParts.formatToParts(date);
  return `${pick(parts, "day")}-${pick(parts, "month")}-${pick(parts, "year")}`;
}

/** 19-09-2026 14:35 */
export function formatDateTime(value: DateInput): string {
  const date = toValidDate(value);
  if (!date) return "";
  const parts = dateTimeParts.formatToParts(date);
  return `${pick(parts, "day")}-${pick(parts, "month")}-${pick(parts, "year")} ${pick(parts, "hour")}:${pick(parts, "minute")}`;
}
