import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import {
  createProject,
  listProjects,
  findProjectById,
  softDeleteProject,
  restoreProject,
  getProjectProfitAndLoss,
} from "@/lib/db/queries/projects";
import { createInvoice, listInvoices, type InvoiceWriteInput } from "@/lib/db/queries/invoices";
import { createPurchase, listPurchases, type PurchaseWriteInput } from "@/lib/db/queries/purchases";
import { createExpense, listExpenses } from "@/lib/db/queries/expenses";
import { Project } from "@/lib/db/models/Project";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Expense } from "@/lib/db/models/Expense";
import { Payment } from "@/lib/db/models/Payment";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import { Business } from "@/lib/db/models/Business";

describe("projects — tenant isolation", () => {
  let tenants: TwoTenants;
  let projectAId: string;
  let projectBId: string;
  let customerAId: string;
  let vendorAId: string;
  let bankAId: string;
  let bankBId: string;
  let categoryAId: string;

  const baseLineItems = [
    {
      description: "Widget",
      quantity: 1,
      unitPriceMinor: 100_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 18,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("projects");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    // Same name in both businesses — deliberately, to prove nothing leaks via name collision.
    const projectA = await createProject({ businessId: tenants.businessAId, name: "Alpha" });
    const projectB = await createProject({ businessId: tenants.businessBId, name: "Alpha" });
    projectAId = String(projectA._id);
    projectBId = String(projectB._id);

    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    if (!customerA.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);

    const vendorA = await createVendor({ businessId: tenants.businessAId, displayName: "Vendor A" });
    if (!vendorA.ok) throw new Error("setup failed");
    vendorAId = String(vendorA.vendor._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
    bankBId = String(bankB._id);

    const categoryA = await createExpenseCategory({ businessId: tenants.businessAId, name: "Materials" });
    categoryAId = String(categoryA._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Project.deleteMany({ businessId: { $in: businessIds } }),
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      Expense.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
      ExpenseCategory.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listProjects never returns another business's projects", async () => {
    const items = await listProjects(tenants.businessAId);
    expect(items.map((p) => String(p._id))).toContain(projectAId);
    expect(items.map((p) => String(p._id))).not.toContain(projectBId);
  });

  it("findProjectById refuses a project belonging to a different business", async () => {
    expect(await findProjectById(projectBId, tenants.businessAId)).toBeNull();
    expect(await findProjectById(projectAId, tenants.businessAId)).not.toBeNull();
  });

  it("createInvoice rejects a projectId belonging to a different business", async () => {
    const input: InvoiceWriteInput = {
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      projectId: projectBId,
    };
    const result = await createInvoice({ ...input, createdByUserId: tenants.userAId, finalize: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_project");
  });

  it("createPurchase rejects a projectId belonging to a different business", async () => {
    const input: PurchaseWriteInput = {
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      projectId: projectBId,
    };
    const result = await createPurchase({ ...input, createdByUserId: tenants.userAId, finalize: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_project");
  });

  it("createExpense rejects a projectId belonging to a different business", async () => {
    const result = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
      projectId: projectBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_project");
  });

  it("Invoices/Purchases/Expenses tagged to a project are listed only for that business+project, never leaking a same-named project's documents from another business", async () => {
    const invoiceResult = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      projectId: projectAId,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const purchaseResult = await createPurchase({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      projectId: projectAId,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const expenseResult = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 20_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
      projectId: projectAId,
    });
    expect(invoiceResult.ok).toBe(true);
    expect(purchaseResult.ok).toBe(true);
    expect(expenseResult.ok).toBe(true);
    if (!invoiceResult.ok || !purchaseResult.ok || !expenseResult.ok) return;

    const invoicesForA = await listInvoices(tenants.businessAId, { projectId: projectAId });
    expect(invoicesForA.items.map((i) => String(i._id))).toContain(String(invoiceResult.invoice._id));

    const invoicesForB = await listInvoices(tenants.businessBId, { projectId: projectBId });
    expect(invoicesForB.items.map((i) => String(i._id))).not.toContain(String(invoiceResult.invoice._id));

    const purchasesForA = await listPurchases(tenants.businessAId, { projectId: projectAId });
    expect(purchasesForA.items.map((p) => String(p._id))).toContain(String(purchaseResult.purchase._id));

    const purchasesForB = await listPurchases(tenants.businessBId, { projectId: projectBId });
    expect(purchasesForB.items.map((p) => String(p._id))).not.toContain(
      String(purchaseResult.purchase._id),
    );

    const expensesForA = await listExpenses(tenants.businessAId, { projectId: projectAId });
    expect(expensesForA.items.map((e) => String(e._id))).toContain(String(expenseResult.expense._id));

    const expensesForB = await listExpenses(tenants.businessBId, { projectId: projectBId });
    expect(expensesForB.items.map((e) => String(e._id))).not.toContain(
      String(expenseResult.expense._id),
    );

    // getProjectProfitAndLoss for Business A's project must reflect only A's documents, even
    // though Business B has a same-named project with zero documents of its own.
    const plA = await getProjectProfitAndLoss(tenants.businessAId, projectAId);
    expect(plA.revenueMinor).toBeGreaterThan(0);
    expect(plA.purchaseCostMinor).toBeGreaterThan(0);
    expect(plA.expenseCostMinor).toBe(20_000);

    const plB = await getProjectProfitAndLoss(tenants.businessBId, projectBId);
    expect(plB.revenueMinor).toBe(0);
    expect(plB.purchaseCostMinor).toBe(0);
    expect(plB.expenseCostMinor).toBe(0);
  });

  it("soft-delete moves a project out of the active list without hard-deleting it, and restore brings it back", async () => {
    const project = await createProject({ businessId: tenants.businessAId, name: "Temp Project" });
    const id = String(project._id);

    await softDeleteProject(id, tenants.businessAId);
    const active = await listProjects(tenants.businessAId, "active");
    expect(active.map((p) => String(p._id))).not.toContain(id);
    const deleted = await listProjects(tenants.businessAId, "deleted");
    expect(deleted.map((p) => String(p._id))).toContain(id);

    const stillExists = await Project.findById(id);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.deletedAt).toBeInstanceOf(Date);

    await restoreProject(id, tenants.businessAId);
    const activeAfterRestore = await listProjects(tenants.businessAId, "active");
    expect(activeAfterRestore.map((p) => String(p._id))).toContain(id);
  });
});
