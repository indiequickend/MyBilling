/** Document numbers can contain "/" (e.g. INV/26-27/14) or other characters that are unsafe in a
 * filename / Content-Disposition header, so reduce them to a conservative set. */
export function pdfContentDisposition(disposition: "inline" | "attachment", baseName: string): string {
  const safe = baseName.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "document";
  return `${disposition}; filename="${safe}.pdf"`;
}
