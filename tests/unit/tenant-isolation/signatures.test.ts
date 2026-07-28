import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listSignatures,
  findSignatureById,
  createSignature,
  updateSignature,
  setDefaultSignature,
  softDeleteSignature,
  restoreSignature,
} from "@/lib/db/queries/signatures";
import { Signature } from "@/lib/db/models/Signature";

describe("signatures — tenant isolation", () => {
  let tenants: TwoTenants;
  let signatureAId: string;
  let signatureBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("signatures");
    const a = await createSignature({
      businessId: tenants.businessAId,
      name: "Owner",
      imagePublicId: "pub-a",
      imageUrl: "https://example.com/a.png",
    });
    const b = await createSignature({
      businessId: tenants.businessBId,
      name: "Owner",
      imagePublicId: "pub-b",
      imageUrl: "https://example.com/b.png",
    });
    signatureAId = String(a._id);
    signatureBId = String(b._id);
  });

  afterAll(async () => {
    await Signature.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("listSignatures never returns another business's signatures", async () => {
    const items = await listSignatures(tenants.businessAId);
    expect(items.map((s) => String(s._id))).toContain(signatureAId);
    expect(items.map((s) => String(s._id))).not.toContain(signatureBId);
  });

  it("findSignatureById refuses a signature belonging to a different business", async () => {
    expect(await findSignatureById(signatureBId, tenants.businessAId)).toBeNull();
    expect(await findSignatureById(signatureAId, tenants.businessAId)).not.toBeNull();
  });

  it("updateSignature cannot modify another business's signature", async () => {
    const updated = await updateSignature(signatureBId, tenants.businessAId, { name: "Hijacked" });
    expect(updated).toBeNull();
    const stillB = await findSignatureById(signatureBId, tenants.businessBId);
    expect(stillB?.name).toBe("Owner");
  });

  it("setDefaultSignature only affects the caller's own business", async () => {
    await setDefaultSignature(signatureAId, tenants.businessAId);
    const bAfter = await findSignatureById(signatureBId, tenants.businessBId);
    expect(bAfter?.isDefault).toBe(false);
  });

  it("soft-delete moves a signature out of the active list without hard-deleting it", async () => {
    await softDeleteSignature(signatureAId, tenants.businessAId);
    const active = await listSignatures(tenants.businessAId, "active");
    expect(active.map((s) => String(s._id))).not.toContain(signatureAId);
    const deleted = await listSignatures(tenants.businessAId, "deleted");
    expect(deleted.map((s) => String(s._id))).toContain(signatureAId);
    await restoreSignature(signatureAId, tenants.businessAId);
  });
});
