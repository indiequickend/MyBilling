import { connectToDatabase } from "@/lib/db/connect";
import {
  GstReportSnapshot,
  type GstReportSnapshotDoc,
  type GstReportType,
} from "@/lib/db/models/GstReportSnapshot";
import type { Gstr2bParsedRow, Gstr2bDiffRow, LocalItcRow } from "@/lib/gst/gstr2bReconciliation";

export async function getGstReportSnapshot(
  businessId: string,
  reportType: GstReportType,
  period: string,
): Promise<GstReportSnapshotDoc | null> {
  await connectToDatabase();
  return GstReportSnapshot.findOne({ businessId, reportType, period }).lean();
}

/** Caches a freshly computed report so the page/export routes can re-render it (and, for GSTR-1,
 * so its manualFiledFlag survives a recompute) without recomputing on every read. */
export async function upsertGstReportSnapshot(
  businessId: string,
  reportType: GstReportType,
  period: string,
  computedData: unknown,
  createdByUserId: string,
): Promise<GstReportSnapshotDoc | null> {
  await connectToDatabase();
  return GstReportSnapshot.findOneAndUpdate(
    { businessId, reportType, period },
    { $set: { computedData, computedAt: new Date() }, $setOnInsert: { createdByUserId } },
    { upsert: true, returnDocument: "after" },
  ).lean();
}

export async function markGstr1Filed(
  businessId: string,
  period: string,
  userId: string,
): Promise<GstReportSnapshotDoc | null> {
  await connectToDatabase();
  return GstReportSnapshot.findOneAndUpdate(
    { businessId, reportType: "gstr1", period },
    { $set: { manualFiledFlag: true, filedAt: new Date(), filedByUserId: userId } },
    { returnDocument: "after" },
  ).lean();
}

export async function unmarkGstr1Filed(
  businessId: string,
  period: string,
): Promise<GstReportSnapshotDoc | null> {
  await connectToDatabase();
  return GstReportSnapshot.findOneAndUpdate(
    { businessId, reportType: "gstr1", period },
    { $set: { manualFiledFlag: false }, $unset: { filedAt: "", filedByUserId: "" } },
    { returnDocument: "after" },
  ).lean();
}

/** Per-month view for the GSTR-1 Filing tracker page — most recent period first. */
export async function listGstr1FilingTracker(
  businessId: string,
  fromPeriod: string,
  toPeriod: string,
): Promise<GstReportSnapshotDoc[]> {
  await connectToDatabase();
  return GstReportSnapshot.find({
    businessId,
    reportType: "gstr1",
    period: { $gte: fromPeriod, $lte: toPeriod },
  })
    .sort({ period: -1 })
    .lean();
}

export async function storeGstr2bImport(
  businessId: string,
  period: string,
  importedFileName: string,
  localItcSummary: LocalItcRow[],
  importedRows: Gstr2bParsedRow[],
  diffResults: Gstr2bDiffRow[],
  userId: string,
): Promise<GstReportSnapshotDoc | null> {
  await connectToDatabase();
  return GstReportSnapshot.findOneAndUpdate(
    { businessId, reportType: "gstr2b", period },
    {
      $set: {
        computedData: { localItcSummary, importedRows, diffResults },
        computedAt: new Date(),
        importedFileName,
      },
      $setOnInsert: { createdByUserId: userId },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
}
