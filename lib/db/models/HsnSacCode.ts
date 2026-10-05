import mongoose, { Schema, type Model } from "mongoose";

export type HsnSacCodeKind = "hsn" | "sac";

/**
 * The government-published HSN (goods) / SAC (services) code -> official description master
 * list. Deliberately NOT tenant-scoped (no businessId, no deletedAt) — every business shares the
 * same classification; this is the same kind of shared reference data as
 * lib/gst/stateCodes.ts's GST_STATE_CODES, just far too large (~22.6k entries) to hardcode as a
 * TS array. Seeded once (and re-run whenever the source list is refreshed) via
 * `pnpm seed:hsn-sac-codes` — see scripts/seedHsnSacCodes.ts and lib/db/seeds/hsn-sac-codes.json
 * — never written to from request-handling code; see lib/db/queries/hsnSacCodes.ts for the only
 * reads of it.
 */
const hsnSacCodeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    kind: { type: String, enum: ["hsn", "sac"], required: true },
    description: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export type HsnSacCodeDoc = {
  code: string;
  kind: HsnSacCodeKind;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export const HsnSacCode =
  (mongoose.models.HsnSacCode as Model<HsnSacCodeDoc>) ??
  mongoose.model<HsnSacCodeDoc>("HsnSacCode", hsnSacCodeSchema);
