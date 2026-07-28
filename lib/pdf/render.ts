import { renderToBuffer } from "@react-pdf/renderer";

/** Renders a React-PDF <Document> element to a PDF buffer. Pure-JS (no headless browser), so
 * this works inside a Vercel serverless function without a Chromium binary. */
export async function renderPdf(document: Parameters<typeof renderToBuffer>[0]): Promise<Buffer> {
  return renderToBuffer(document);
}
