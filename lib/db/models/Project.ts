import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Buckets a set of Invoices/Expenses/Purchases together for project-level P&L (see
 * lib/db/queries/projects.ts getProjectProfitAndLoss) — the linkage is a `projectId` field on
 * each of those documents (queried by filter), not an array kept here, matching every other
 * relationship in this codebase (e.g. Expense.categoryId).
 */
const projectSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

projectSchema.index({ businessId: 1, name: 1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema>;

export const Project =
  (mongoose.models.Project as Model<ProjectDoc>) ?? mongoose.model<ProjectDoc>("Project", projectSchema);
