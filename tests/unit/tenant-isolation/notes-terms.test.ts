import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listNoteTermTemplates,
  findNoteTermTemplateById,
  isOwnedNoteTermTemplate,
  createNoteTermTemplate,
  updateNoteTermTemplate,
  setDefaultNoteTermTemplate,
  softDeleteNoteTermTemplate,
  restoreNoteTermTemplate,
} from "@/lib/db/queries/noteTermTemplates";
import { NoteTermTemplate } from "@/lib/db/models/NoteTermTemplate";

describe("noteTermTemplates — tenant isolation", () => {
  let tenants: TwoTenants;
  let templateAId: string;
  let templateBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("notes-terms");
    const a = await createNoteTermTemplate({
      businessId: tenants.businessAId,
      docType: "invoice",
      kind: "term",
      body: "Payment due within 15 days.",
      isActive: true,
    });
    const b = await createNoteTermTemplate({
      businessId: tenants.businessBId,
      docType: "invoice",
      kind: "term",
      body: "Payment due within 30 days.",
      isActive: true,
    });
    templateAId = String(a._id);
    templateBId = String(b._id);
  });

  afterAll(async () => {
    await NoteTermTemplate.deleteMany({
      businessId: { $in: [tenants.businessAId, tenants.businessBId] },
    });
    await teardownTwoTenants(tenants);
  });

  it("listNoteTermTemplates never returns another business's templates", async () => {
    const items = await listNoteTermTemplates(tenants.businessAId);
    expect(items.map((t) => String(t._id))).toContain(templateAId);
    expect(items.map((t) => String(t._id))).not.toContain(templateBId);
  });

  it("findNoteTermTemplateById and isOwnedNoteTermTemplate refuse a foreign template", async () => {
    expect(await findNoteTermTemplateById(templateBId, tenants.businessAId)).toBeNull();
    expect(await isOwnedNoteTermTemplate(templateBId, tenants.businessAId)).toBe(false);
    expect(await isOwnedNoteTermTemplate(templateAId, tenants.businessAId)).toBe(true);
  });

  it("updateNoteTermTemplate cannot modify another business's template", async () => {
    const updated = await updateNoteTermTemplate(templateBId, tenants.businessAId, {
      body: "Hijacked",
    });
    expect(updated).toBeNull();
  });

  it("setDefaultNoteTermTemplate only affects the caller's own business", async () => {
    await setDefaultNoteTermTemplate(templateAId, tenants.businessAId);
    const bAfter = await findNoteTermTemplateById(templateBId, tenants.businessBId);
    expect(bAfter?.isDefault).toBe(false);
  });

  it("soft-delete moves a template out of the active list without hard-deleting it", async () => {
    await softDeleteNoteTermTemplate(templateAId, tenants.businessAId);
    const active = await listNoteTermTemplates(tenants.businessAId, { tab: "active" });
    expect(active.map((t) => String(t._id))).not.toContain(templateAId);
    const deleted = await listNoteTermTemplates(tenants.businessAId, { tab: "deleted" });
    expect(deleted.map((t) => String(t._id))).toContain(templateAId);
    await restoreNoteTermTemplate(templateAId, tenants.businessAId);
  });
});
