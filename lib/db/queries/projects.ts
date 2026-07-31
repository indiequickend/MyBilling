import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Project } from "@/lib/db/models/Project";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Expense } from "@/lib/db/models/Expense";

export async function listProjects(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return Project.find(filter).sort({ name: 1 }).lean();
}

export async function findProjectById(projectId: string, businessId: string) {
  await connectToDatabase();
  return Project.findOne({ _id: projectId, businessId });
}

/** Ownership check: is `projectId` a non-deleted project belonging to `businessId`? */
export async function isOwnedProject(projectId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await Project.countDocuments({
    _id: projectId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export async function createProject(input: { businessId: string; name: string; description?: string }) {
  await connectToDatabase();
  return Project.create(input);
}

export async function updateProject(
  projectId: string,
  businessId: string,
  updates: { name?: string; description?: string },
) {
  await connectToDatabase();
  return Project.findOneAndUpdate(
    { _id: projectId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function softDeleteProject(projectId: string, businessId: string) {
  await connectToDatabase();
  return Project.findOneAndUpdate(
    { _id: projectId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreProject(projectId: string, businessId: string) {
  await connectToDatabase();
  return Project.findOneAndUpdate(
    { _id: projectId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type ProjectDateRangeParams = { dateFrom?: Date; dateTo?: Date };

function dateRangeFilter(params: ProjectDateRangeParams): Record<string, Date> | undefined {
  if (!params.dateFrom && !params.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (params.dateFrom) range.$gte = params.dateFrom;
  if (params.dateTo) range.$lte = params.dateTo;
  return range;
}

/** Sums grandTotalMinor for finalized (non-draft, non-cancelled) Invoice/Purchase documents
 * linked to this project — same shape as reports.ts's sumFinalizedDocumentTotals, scoped
 * additionally by projectId. Kept independent of reports.ts so that file's exported surface
 * (feeding the business-wide P&L report/export route) stays untouched. */
async function sumProjectDocumentTotals(
  model: typeof Invoice | typeof Purchase,
  businessId: string,
  projectId: string,
  dateField: string,
  params: ProjectDateRangeParams,
): Promise<number> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    projectId: new mongoose.Types.ObjectId(projectId),
    status: { $nin: ["draft", "cancelled"] },
  };
  const range = dateRangeFilter(params);
  if (range) match[dateField] = range;
  const [agg] = await model.aggregate([
    { $match: match },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" } } },
  ]);
  return agg?.totalMinor ?? 0;
}

async function sumProjectExpenseTotals(
  businessId: string,
  projectId: string,
  params: ProjectDateRangeParams,
): Promise<number> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    projectId: new mongoose.Types.ObjectId(projectId),
    status: "recorded",
  };
  const range = dateRangeFilter(params);
  if (range) match.expenseDate = range;
  const [agg] = await Expense.aggregate([
    { $match: match },
    { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
  ]);
  return agg?.totalMinor ?? 0;
}

export type ProjectProfitAndLoss = {
  revenueMinor: number;
  purchaseCostMinor: number;
  expenseCostMinor: number;
  totalCostMinor: number;
  profitMinor: number;
};

/** Project-level P&L per project_spec.md ("buckets Invoices/Expenses/Purchases to compute
 * project-level revenue, cost, and profit") — deliberately narrower than reports.ts's
 * getProfitAndLoss (no Credit/Debit Note netting, no Indirect Income — those aren't part of a
 * Project's bucket per spec). */
export async function getProjectProfitAndLoss(
  businessId: string,
  projectId: string,
  params: ProjectDateRangeParams = {},
): Promise<ProjectProfitAndLoss> {
  const [revenueMinor, purchaseCostMinor, expenseCostMinor] = await Promise.all([
    sumProjectDocumentTotals(Invoice, businessId, projectId, "invoiceDate", params),
    sumProjectDocumentTotals(Purchase, businessId, projectId, "purchaseDate", params),
    sumProjectExpenseTotals(businessId, projectId, params),
  ]);
  const totalCostMinor = purchaseCostMinor + expenseCostMinor;
  return {
    revenueMinor,
    purchaseCostMinor,
    expenseCostMinor,
    totalCostMinor,
    profitMinor: revenueMinor - totalCostMinor,
  };
}

export type ProjectProfitAndLossRow = { label: string; amountMinor: number };

/** Shapes getProjectProfitAndLoss's object into the row array both the P&L tab and its export
 * route render — mirrors reports.ts's buildProfitAndLossRows. */
export function buildProjectProfitAndLossRows(pl: ProjectProfitAndLoss): ProjectProfitAndLossRow[] {
  return [
    { label: "Revenue (Invoices)", amountMinor: pl.revenueMinor },
    { label: "Purchase Cost", amountMinor: pl.purchaseCostMinor },
    { label: "Expense Cost", amountMinor: pl.expenseCostMinor },
    { label: "Total Cost", amountMinor: pl.totalCostMinor },
    { label: "Profit", amountMinor: pl.profitMinor },
  ];
}
