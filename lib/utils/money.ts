/** Formats integer paise (CLAUDE.md rule 7) as a rupees string for form default values. */
export function minorToRupeesString(minor: number | null | undefined): string {
  if (minor == null) return "";
  return (minor / 100).toFixed(2);
}
