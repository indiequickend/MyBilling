import { connectToDatabase } from "@/lib/db/connect";
import { ApiKey } from "@/lib/db/models/ApiKey";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { paginate } from "@/lib/db/queryHelpers";

const KEY_PREFIX = "mb_live_";

export type CreateApiKeyInput = {
  businessId: string;
  roleId: string;
  name: string;
  createdByUserId: string;
};

/** Returns the raw key exactly once — only its HMAC hash is ever persisted, mirroring
 * Sessions/Invitations/PaymentLinks (lib/auth/tokens.ts). */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<{ apiKey: InstanceType<typeof ApiKey>; rawKey: string }> {
  await connectToDatabase();
  const rawKey = `${KEY_PREFIX}${generateToken()}`;
  const apiKey = await ApiKey.create({
    businessId: input.businessId,
    roleId: input.roleId,
    name: input.name,
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 8),
    keyHash: hashToken(rawKey),
    createdByUserId: input.createdByUserId,
  });
  return { apiKey, rawKey };
}

export async function listApiKeysForBusiness(businessId: string, params: { page?: number } = {}) {
  await connectToDatabase();
  return paginate(ApiKey, { businessId }, { ...params, sort: { createdAt: -1 } });
}

/** Public lookup — no businessId scoping possible/needed since the key itself is the secret that
 * scopes access, same pattern as findValidPaymentLinkByTokenHash. */
export async function findActiveApiKeyByHash(keyHash: string) {
  await connectToDatabase();
  return ApiKey.findOne({ keyHash, revokedAt: { $exists: false } });
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
  await connectToDatabase();
  await ApiKey.updateOne({ _id: apiKeyId }, { $set: { lastUsedAt: new Date() } });
}

export type RevokeApiKeyResult = { ok: true } | { ok: false; reason: "not_found" };

export async function revokeApiKey(apiKeyId: string, businessId: string): Promise<RevokeApiKeyResult> {
  await connectToDatabase();
  const updated = await ApiKey.findOneAndUpdate(
    { _id: apiKeyId, businessId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true };
}
