import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  createApiKey,
  findActiveApiKeyByHash,
  listApiKeysForBusiness,
  revokeApiKey,
} from "@/lib/db/queries/apiKeys";
import { getApiKeyContext } from "@/lib/auth/apiKeyContext";
import { hashToken } from "@/lib/auth/tokens";
import { ApiKey } from "@/lib/db/models/ApiKey";

describe("api keys — tenant isolation", () => {
  let tenants: TwoTenants;
  let keyAId: string;
  let rawKeyA: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("api-keys");

    const { apiKey, rawKey } = await createApiKey({
      businessId: tenants.businessAId,
      roleId: tenants.roleAId,
      name: "Integration key",
      createdByUserId: tenants.userAId,
    });
    keyAId = String(apiKey._id);
    rawKeyA = rawKey;
  });

  afterAll(async () => {
    await ApiKey.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("listApiKeysForBusiness only returns the caller's own keys", async () => {
    const { items } = await listApiKeysForBusiness(tenants.businessAId);
    expect(items.map((k) => String(k._id))).toContain(keyAId);

    const crossed = await listApiKeysForBusiness(tenants.businessBId);
    expect(crossed.items.map((k) => String(k._id))).not.toContain(keyAId);
  });

  it("revokeApiKey cannot revoke another business's key", async () => {
    const result = await revokeApiKey(keyAId, tenants.businessBId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");

    const stillActive = await findActiveApiKeyByHash(hashToken(rawKeyA));
    expect(stillActive).not.toBeNull();
  });

  it("getApiKeyContext resolves a Bearer key to its own business only, never the other tenant's", async () => {
    const request = new Request("http://localhost/api/v1/invoices", {
      headers: { authorization: `Bearer ${rawKeyA}` },
    });
    const context = await getApiKeyContext(request);
    expect(context).not.toBeNull();
    expect(context?.businessId).toBe(tenants.businessAId);
    expect(context?.businessId).not.toBe(tenants.businessBId);
    expect(context?.membership.businessId).toBe(tenants.businessAId);
  });

  it("getApiKeyContext rejects a missing/malformed Authorization header", async () => {
    const noHeader = await getApiKeyContext(new Request("http://localhost/api/v1/invoices"));
    expect(noHeader).toBeNull();

    const malformed = await getApiKeyContext(
      new Request("http://localhost/api/v1/invoices", { headers: { authorization: "Basic abc123" } }),
    );
    expect(malformed).toBeNull();
  });

  it("getApiKeyContext rejects a garbage token", async () => {
    const context = await getApiKeyContext(
      new Request("http://localhost/api/v1/invoices", { headers: { authorization: "Bearer not_a_real_key" } }),
    );
    expect(context).toBeNull();
  });

  it("revokeApiKey by the owning business invalidates the key", async () => {
    const result = await revokeApiKey(keyAId, tenants.businessAId);
    expect(result.ok).toBe(true);

    const revoked = await findActiveApiKeyByHash(hashToken(rawKeyA));
    expect(revoked).toBeNull();

    const context = await getApiKeyContext(
      new Request("http://localhost/api/v1/invoices", { headers: { authorization: `Bearer ${rawKeyA}` } }),
    );
    expect(context).toBeNull();
  });
});
