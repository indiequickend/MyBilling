import { connectToDatabase } from "@/lib/db/connect";
import {
  Business,
  type BusinessType,
  type CustomFieldDefDoc,
  type DocumentPreferences,
  type ProductPreferences,
  type InventoryPreferences,
  type BatchPreferences,
  type DocumentNumberingPreferences,
} from "@/lib/db/models/Business";
import type { DocumentType } from "@/lib/constants/documentTypes";
import { Role } from "@/lib/db/models/Role";
import { Membership } from "@/lib/db/models/Membership";
import { ADMIN_TEMPLATE_PERMISSIONS } from "@/lib/rbac/templates";
import type { AddressInput } from "@/lib/validation/shared";

/**
 * Creates a Business together with its Admin role and the owning user's Membership
 * as one atomic transaction, so a crash mid-way never leaves an orphaned Business
 * with no admin able to manage it.
 */
export async function createBusinessWithOwner(input: { name: string; ownerUserId: string }) {
  const conn = await connectToDatabase();
  const session = await conn.startSession();

  try {
    let result!: { businessId: string; roleId: string; membershipId: string };

    await session.withTransaction(async () => {
      const [business] = await Business.create(
        [{ name: input.name, createdByUserId: input.ownerUserId }],
        { session },
      );
      const [adminRole] = await Role.create(
        [
          {
            businessId: business._id,
            name: "Admin",
            permissions: ADMIN_TEMPLATE_PERMISSIONS,
            isSystemDefault: true,
          },
        ],
        { session },
      );
      const [membership] = await Membership.create(
        [
          {
            userId: input.ownerUserId,
            businessId: business._id,
            roleId: adminRole._id,
            status: "active",
          },
        ],
        { session },
      );

      result = {
        businessId: String(business._id),
        roleId: String(adminRole._id),
        membershipId: String(membership._id),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export async function findBusinessById(businessId: string) {
  await connectToDatabase();
  return Business.findOne({ _id: businessId, deletedAt: { $exists: false } });
}

/**
 * For the business switcher: every business a user has an active membership
 * in. .lean() — this renders straight into the Sidebar Client Component on
 * every dashboard page, so it must be plain objects, not Mongoose documents.
 */
export async function listBusinessesForUser(userId: string) {
  await connectToDatabase();
  const memberships = await Membership.find({ userId, status: "active" }).lean();
  const businessIds = memberships.map((m) => m.businessId);
  return Business.find({ _id: { $in: businessIds }, deletedAt: { $exists: false } }).lean();
}

export type BusinessDetailsUpdate = {
  name?: string;
  brandName?: string;
  gstin?: string;
  pan?: string;
  businessType?: BusinessType;
  phone?: string;
  email?: string;
  alternateContact?: string;
  website?: string;
  logoPublicId?: string;
  logoUrl?: string;
  addresses?: { billing?: AddressInput; shipping?: AddressInput };
};

export async function updateBusinessDetails(businessId: string, updates: BusinessDetailsUpdate) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function setBusinessCustomFieldDefs(businessId: string, defs: CustomFieldDefDoc[]) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { customFieldDefs: defs } },
    { returnDocument: "after" },
  );
}

export async function setBusinessCustomFieldValues(
  businessId: string,
  values: Record<string, unknown>,
) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { customFieldValues: values } },
    { returnDocument: "after" },
  );
}

export async function updateDocumentPreferences(
  businessId: string,
  updates: {
    sales: DocumentPreferences;
    purchases: DocumentPreferences;
    conversions: DocumentPreferences;
  },
) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { "preferences.document": updates } },
    { returnDocument: "after" },
  );
}

/**
 * Per-document-type custom header fields (e.g. an Invoice's "Journey Start Date") — a DIFFERENT
 * store from setBusinessCustomFieldDefs above, which is for Company Details fields. Keyed by
 * DocumentType so Purchases/Quotations/etc. reuse the same store in later phases.
 */
export async function setDocumentCustomFieldDefs(
  businessId: string,
  docType: DocumentType,
  defs: CustomFieldDefDoc[],
) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { [`documentCustomFieldDefs.${docType}`]: defs } },
    { returnDocument: "after" },
  );
}

export async function updateDocumentNumberingPreferences(
  businessId: string,
  updates: DocumentNumberingPreferences,
) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { "preferences.documentNumbering": updates } },
    { returnDocument: "after" },
  );
}

export async function updateProductsInventoryPreferences(
  businessId: string,
  updates: {
    product: ProductPreferences;
    inventory: Omit<InventoryPreferences, "defaultWarehouseId"> & { defaultWarehouseId?: string };
    batch: BatchPreferences;
  },
) {
  await connectToDatabase();
  return Business.findOneAndUpdate(
    { _id: businessId, deletedAt: { $exists: false } },
    { $set: { "preferences.productsInventory": updates } },
    { returnDocument: "after" },
  );
}
