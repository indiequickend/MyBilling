import mongoose, { Schema, type Model } from "mongoose";

/** module key -> action key -> granted */
export type PermissionMatrix = Record<string, Record<string, boolean>>;

const roleSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    permissions: { type: Schema.Types.Mixed, required: true, default: {} },
    // True only for the auto-created Admin role of a business — blocks deleting the last admin role.
    isSystemDefault: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

export type RoleDoc = {
  businessId: mongoose.Types.ObjectId;
  name: string;
  permissions: PermissionMatrix;
  isSystemDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const Role =
  (mongoose.models.Role as Model<RoleDoc>) ?? mongoose.model<RoleDoc>("Role", roleSchema);
