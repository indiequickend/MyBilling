/**
 * One-time backfill for documents bulk-imported before the import paths advanced the numbering
 * counter (see advanceSequenceForImportedNumber): raises each {business, docType, series} counter
 * to the highest trailing number among that series' existing documents. Only ever raises a
 * counter, never lowers it. Dry-run by default — pass --apply to write.
 *
 * Run with: pnpm migrate:document-sequences [-- --apply] [--types=invoice,purchase]
 */
import { connectToDatabase } from "@/lib/db/connect";
import { Business } from "@/lib/db/models/Business";
import { DocumentSequence } from "@/lib/db/models/DocumentSequence";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { ProformaInvoice } from "@/lib/db/models/ProformaInvoice";
import { PurchaseOrder } from "@/lib/db/models/PurchaseOrder";
import { resolveNumberingConfig, resolveSeriesKey } from "@/lib/documents/numbering";
import type { DocumentType } from "@/lib/constants/documentTypes";

const apply = process.argv.includes("--apply");
// Optional --types=invoice,purchase to restrict which document types are touched.
const typesArg = process.argv.find((a) => a.startsWith("--types="));
const onlyTypes = typesArg ? typesArg.slice("--types=".length).split(",") : undefined;

const SOURCES: Array<{
  docType: DocumentType;
  model: { find: (q: object) => { select: (s: string) => { lean: () => Promise<Array<Record<string, unknown>>> } } };
  dateField: string;
}> = [
  { docType: "invoice", model: Invoice as never, dateField: "invoiceDate" },
  { docType: "purchase", model: Purchase as never, dateField: "purchaseDate" },
  { docType: "proforma_invoice", model: ProformaInvoice as never, dateField: "proformaDate" },
  { docType: "purchase_order", model: PurchaseOrder as never, dateField: "orderDate" },
];

async function main() {
  await connectToDatabase();
  const businesses = await Business.find({ deletedAt: { $exists: false } }).lean();
  console.log(apply ? "APPLY mode" : "DRY RUN (no changes) — pass --apply to write");

  for (const business of businesses) {
    const numbering = business.preferences?.documentNumbering;
    for (const { docType, model, dateField } of SOURCES) {
      if (onlyTypes && !onlyTypes.includes(docType)) continue;
      const config = resolveNumberingConfig(numbering, docType);
      const docs = await model
        .find({ businessId: business._id, docNumber: { $type: "string" } })
        .select(`docNumber ${dateField}`)
        .lean();

      const maxBySeries = new Map<string, number>();
      for (const doc of docs) {
        const m = /(\d+)\s*$/.exec(String(doc.docNumber));
        if (!m) continue;
        const n = Number(m[1]);
        if (!Number.isSafeInteger(n) || n <= 0) continue;
        const key = resolveSeriesKey(doc[dateField] as Date, numbering?.fyStartMonth ?? 4, config.resetPolicy);
        if (n > (maxBySeries.get(key) ?? 0)) maxBySeries.set(key, n);
      }

      for (const [seriesKey, max] of maxBySeries) {
        const current = await DocumentSequence.findOne({ businessId: business._id, docType, seriesKey }).lean();
        const last = current?.lastNumber ?? 0;
        if (max <= last) continue;
        console.log(
          `${business.name} | ${docType} | ${seriesKey}: counter ${last} -> ${max}`,
        );
        if (apply) {
          await DocumentSequence.updateOne(
            { businessId: business._id, docType, seriesKey },
            { $max: { lastNumber: max } },
            { upsert: true },
          );
        }
      }
    }
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
