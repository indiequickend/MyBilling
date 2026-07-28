import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String },
    emailVerifiedAt: { type: Date },

    totpEnabled: { type: Boolean, required: true, default: false },
    // Only ever set once TOTP enrollment is confirmed; never returned by default queries.
    totpSecret: { type: String, select: false },
    backupCodeHashes: { type: [String], select: false, default: undefined },

    failedLoginAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date },

    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
