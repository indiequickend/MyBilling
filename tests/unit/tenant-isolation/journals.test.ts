import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import {
  createJournal,
  listJournals,
  findJournalById,
  softDeleteJournal,
  restoreJournal,
} from "@/lib/db/queries/journals";
import { Journal } from "@/lib/db/models/Journal";
import { BankAccount } from "@/lib/db/models/BankAccount";

describe("journals — tenant isolation", () => {
  let tenants: TwoTenants;
  let bankAId: string;
  let bankBId: string;
  let journalAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("journals");

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash A" });
    bankAId = String(bankA._id);
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash B" });
    bankBId = String(bankB._id);

    const created = await createJournal({
      businessId: tenants.businessAId,
      journalDate: new Date(),
      narration: "Opening balance transfer",
      lines: [
        { accountType: "bank_account", accountRefId: bankAId, debitMinor: 10_000, creditMinor: 0 },
        { accountType: "other", accountLabel: "Capital", debitMinor: 0, creditMinor: 10_000 },
      ],
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    journalAId = String(created.journal._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Journal.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("createJournal rejects an account reference belonging to a different business", async () => {
    const result = await createJournal({
      businessId: tenants.businessAId,
      journalDate: new Date(),
      narration: "Cross-tenant bank ref",
      lines: [
        { accountType: "bank_account", accountRefId: bankBId, debitMinor: 5_000, creditMinor: 0 },
        { accountType: "other", accountLabel: "Capital", debitMinor: 0, creditMinor: 5_000 },
      ],
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_account_ref");
  });

  it("createJournal rejects an unbalanced entry even when called directly (bypassing Zod)", async () => {
    const result = await createJournal({
      businessId: tenants.businessAId,
      journalDate: new Date(),
      narration: "Unbalanced",
      lines: [
        { accountType: "bank_account", accountRefId: bankAId, debitMinor: 10_000, creditMinor: 0 },
        { accountType: "other", accountLabel: "Capital", debitMinor: 0, creditMinor: 9_000 },
      ],
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unbalanced");
  });

  it("createJournal rejects an all-zero entry", async () => {
    const result = await createJournal({
      businessId: tenants.businessAId,
      journalDate: new Date(),
      narration: "Empty",
      lines: [
        { accountType: "other", accountLabel: "A", debitMinor: 0, creditMinor: 0 },
        { accountType: "other", accountLabel: "B", debitMinor: 0, creditMinor: 0 },
      ],
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_entry");
  });

  it("a balanced entry persists with server-resolved account labels", async () => {
    const bankA = await BankAccount.findById(bankAId);
    const found = await findJournalById(journalAId, tenants.businessAId);
    expect(found).not.toBeNull();
    expect(found?.lines[0].accountLabel).toBe(bankA?.name);
    expect(found?.totalMinor).toBe(10_000);
  });

  it("findJournalById never returns another business's journal", async () => {
    const crossed = await findJournalById(journalAId, tenants.businessBId);
    expect(crossed).toBeNull();
  });

  it("listJournals only returns the caller's own journals", async () => {
    const { items } = await listJournals(tenants.businessAId);
    expect(items.map((j) => String(j._id))).toContain(journalAId);

    const crossed = await listJournals(tenants.businessBId);
    expect(crossed.items.map((j) => String(j._id))).not.toContain(journalAId);
  });

  it("softDeleteJournal/restoreJournal cannot act across tenants", async () => {
    const crossDelete = await softDeleteJournal(journalAId, tenants.businessBId);
    expect(crossDelete).toBeNull();

    const deleted = await softDeleteJournal(journalAId, tenants.businessAId);
    expect(deleted?.deletedAt).toBeTruthy();

    const crossRestore = await restoreJournal(journalAId, tenants.businessBId);
    expect(crossRestore).toBeNull();

    const restored = await restoreJournal(journalAId, tenants.businessAId);
    expect(restored?.deletedAt).toBeFalsy();
  });
});
