import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * This app has no chart-of-accounts, so a journal line posts against whichever real entity it
 * actually concerns — a BankAccount, a Customer, or a Vendor — snapshotting a display label
 * (accountLabel) the same way documents snapshot customer/vendor details at save time. "other" is
 * the free-text escape hatch for anything that isn't one of those (a pure bookkeeping label with
 * no referential integrity), matching project_spec.md's framing of Journals as "the escape hatch
 * for real bookkeeping."
 */
const journalLineSchema = new Schema(
  {
    accountType: { type: String, enum: ["bank_account", "customer", "vendor", "other"], required: true },
    // Required (query-layer, not schema-level) unless accountType === "other".
    accountRefId: { type: Schema.Types.ObjectId },
    accountLabel: { type: String, required: true, trim: true },
    // Exactly one of debit/credit is non-zero per line (validated, not schema-enforced).
    debitMinor: { type: Number, required: true, default: 0 },
    creditMinor: { type: Number, required: true, default: 0 },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const journalSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },
    journalDate: { type: Date, required: true },
    narration: { type: String, required: true, trim: true },
    // Every entry that reaches the database is already balanced — see createJournal's
    // defense-in-depth re-check (the same "don't trust only the Zod layer" posture as
    // payments_exceed_total checks elsewhere) — so there is no draft concept here.
    lines: {
      type: [journalLineSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length >= 2,
        message: "A journal needs at least two lines",
      },
    },
    totalMinor: { type: Number, required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

journalSchema.index({ businessId: 1, journalDate: -1 });
journalSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type JournalLineDoc = InferSchemaType<typeof journalLineSchema>;
export type JournalDoc = InferSchemaType<typeof journalSchema>;

export const Journal =
  (mongoose.models.Journal as Model<JournalDoc>) ?? mongoose.model<JournalDoc>("Journal", journalSchema);
