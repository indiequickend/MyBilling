import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listBankAccounts,
  findBankAccountById,
  isOwnedBankAccount,
  createBankAccount,
  updateBankAccount,
  softDeleteBankAccount,
  restoreBankAccount,
  transferFunds,
  listBankTransfers,
  getBankAccountBalance,
} from "@/lib/db/queries/bankAccounts";
import { createCustomer } from "@/lib/db/queries/customers";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { BankTransfer } from "@/lib/db/models/BankTransfer";
import { Invoice } from "@/lib/db/models/Invoice";
import { Customer } from "@/lib/db/models/Customer";

describe("bankAccounts — tenant isolation", () => {
  let tenants: TwoTenants;
  let accountAId: string;
  let accountA2Id: string;
  let accountA3Id: string;
  let accountBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("banks");
    const a = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    const a2 = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "HDFC" });
    const a3 = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "Unused" });
    const b = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" });
    accountAId = String(a._id);
    accountA2Id = String(a2._id);
    accountA3Id = String(a3._id);
    accountBId = String(b._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
      BankTransfer.deleteMany({ businessId: { $in: businessIds } }),
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listBankAccounts never returns another business's accounts", async () => {
    const items = await listBankAccounts(tenants.businessAId);
    expect(items.map((a) => String(a._id))).toContain(accountAId);
    expect(items.map((a) => String(a._id))).not.toContain(accountBId);
  });

  it("findBankAccountById and isOwnedBankAccount refuse a foreign account", async () => {
    expect(await findBankAccountById(accountBId, tenants.businessAId)).toBeNull();
    expect(await isOwnedBankAccount(accountBId, tenants.businessAId)).toBe(false);
    expect(await isOwnedBankAccount(accountAId, tenants.businessAId)).toBe(true);
  });

  it("updateBankAccount cannot modify another business's account", async () => {
    const updated = await updateBankAccount(accountBId, tenants.businessAId, { name: "Hijacked" });
    expect(updated).toBeNull();
  });

  it("transferFunds rejects a foreign account on either side", async () => {
    const result = await transferFunds({
      businessId: tenants.businessAId,
      fromAccountId: accountAId,
      toAccountId: accountBId,
      amountMinor: 10_000,
      transferDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_accounts");
  });

  it("transferFunds rejects transferring an account to itself", async () => {
    const result = await transferFunds({
      businessId: tenants.businessAId,
      fromAccountId: accountAId,
      toAccountId: accountAId,
      amountMinor: 10_000,
      transferDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("same_account");
  });

  it("a valid transfer between two of business A's own accounts succeeds and updates balances", async () => {
    const result = await transferFunds({
      businessId: tenants.businessAId,
      fromAccountId: accountAId,
      toAccountId: accountA2Id,
      amountMinor: 5_000,
      transferDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);

    const fromBalance = await getBankAccountBalance(accountAId, tenants.businessAId);
    const toBalance = await getBankAccountBalance(accountA2Id, tenants.businessAId);
    expect(fromBalance).toBe(-5_000);
    expect(toBalance).toBe(5_000);

    const businessBTransfers = await listBankTransfers(tenants.businessBId);
    expect(businessBTransfers.items).toHaveLength(0);
  });

  it("softDeleteBankAccount is blocked when the account is referenced by an Invoice", async () => {
    const customerResult = await createCustomer({
      businessId: tenants.businessAId,
      displayName: "Referencing Customer",
    });
    if (!customerResult.ok) throw new Error("setup failed");

    await Invoice.create({
      businessId: tenants.businessAId,
      customerId: customerResult.customer._id,
      customerSnapshot: { displayName: "Referencing Customer" },
      status: "draft",
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [
        {
          description: "Item",
          quantity: 1,
          unitPriceMinor: 1_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 0,
          taxableAmountMinor: 1_000,
          totalMinor: 1_000,
        },
      ],
      discountAmountMinor: 0,
      roundOffAmountMinor: 0,
      subtotalMinor: 1_000,
      totalTaxMinor: 0,
      grandTotalMinor: 1_000,
      bankAccountId: accountAId,
      createdByUserId: tenants.userAId,
    });

    const result = await softDeleteBankAccount(accountAId, tenants.businessAId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("in_use");

    const stillActive = await findBankAccountById(accountAId, tenants.businessAId);
    expect(stillActive?.deletedAt).toBeUndefined();
  });

  it("softDeleteBankAccount succeeds for an unreferenced account and restore brings it back", async () => {
    const result = await softDeleteBankAccount(accountA3Id, tenants.businessAId);
    expect(result.ok).toBe(true);

    const active = await listBankAccounts(tenants.businessAId, "active");
    expect(active.map((a) => String(a._id))).not.toContain(accountA3Id);

    await restoreBankAccount(accountA3Id, tenants.businessAId);
    const activeAgain = await listBankAccounts(tenants.businessAId, "active");
    expect(activeAgain.map((a) => String(a._id))).toContain(accountA3Id);
  });
});
