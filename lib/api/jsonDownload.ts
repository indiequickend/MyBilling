import { NextResponse } from "next/server";

/** Returns a JSON payload as a downloadable file — parallel to lib/pdf/render.ts's role for PDF
 * exports. Used by the e-way bill/e-invoice JSON download routes, since no route in this app
 * returned a JSON *file* (as opposed to a JSON API response) before this phase. */
export function jsonDownloadResponse(data: unknown, filename: string): NextResponse {
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
