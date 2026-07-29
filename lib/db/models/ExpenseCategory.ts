import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const expenseCategorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

expenseCategorySchema.index(
  { businessId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type ExpenseCategoryDoc = InferSchemaType<typeof expenseCategorySchema>;

export const ExpenseCategory =
  (mongoose.models.ExpenseCategory as Model<ExpenseCategoryDoc>) ??
  mongoose.model<ExpenseCategoryDoc>("ExpenseCategory", expenseCategorySchema);
