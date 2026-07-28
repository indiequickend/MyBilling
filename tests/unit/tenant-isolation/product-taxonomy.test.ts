import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listProductCategories,
  findProductCategoryById,
  isOwnedProductCategory,
  createProductCategory,
} from "@/lib/db/queries/productCategories";
import {
  listProductGroups,
  findProductGroupById,
  isOwnedProductGroup,
  createProductGroup,
} from "@/lib/db/queries/productGroups";
import {
  listPriceLists,
  findPriceListById,
  findOwnedPriceListIds,
  createPriceList,
} from "@/lib/db/queries/priceLists";
import { ProductCategory } from "@/lib/db/models/ProductCategory";
import { ProductGroup } from "@/lib/db/models/ProductGroup";
import { PriceList } from "@/lib/db/models/PriceList";

describe("product taxonomy (categories/groups/price lists) — tenant isolation", () => {
  let tenants: TwoTenants;
  let categoryAId: string;
  let categoryBId: string;
  let groupAId: string;
  let groupBId: string;
  let priceListAId: string;
  let priceListBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("product-taxonomy");
    const categoryA = await createProductCategory({
      businessId: tenants.businessAId,
      name: "Electronics",
    });
    const categoryB = await createProductCategory({
      businessId: tenants.businessBId,
      name: "Electronics",
    });
    categoryAId = String(categoryA._id);
    categoryBId = String(categoryB._id);

    const groupA = await createProductGroup({ businessId: tenants.businessAId, name: "Seasonal" });
    const groupB = await createProductGroup({ businessId: tenants.businessBId, name: "Seasonal" });
    groupAId = String(groupA._id);
    groupBId = String(groupB._id);

    const priceListA = await createPriceList({
      businessId: tenants.businessAId,
      name: "Wholesale",
    });
    const priceListB = await createPriceList({
      businessId: tenants.businessBId,
      name: "Wholesale",
    });
    priceListAId = String(priceListA._id);
    priceListBId = String(priceListB._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      ProductCategory.deleteMany({ businessId: { $in: businessIds } }),
      ProductGroup.deleteMany({ businessId: { $in: businessIds } }),
      PriceList.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listProductCategories/findProductCategoryById never cross businesses", async () => {
    const categoriesA = await listProductCategories(tenants.businessAId);
    expect(categoriesA.map((c) => String(c._id))).toContain(categoryAId);
    expect(categoriesA.map((c) => String(c._id))).not.toContain(categoryBId);
    expect(await findProductCategoryById(categoryBId, tenants.businessAId)).toBeNull();
  });

  it("isOwnedProductCategory rejects a category belonging to another business", async () => {
    expect(await isOwnedProductCategory(categoryAId, tenants.businessAId)).toBe(true);
    expect(await isOwnedProductCategory(categoryBId, tenants.businessAId)).toBe(false);
  });

  it("listProductGroups/findProductGroupById never cross businesses", async () => {
    const groupsA = await listProductGroups(tenants.businessAId);
    expect(groupsA.map((g) => String(g._id))).toContain(groupAId);
    expect(groupsA.map((g) => String(g._id))).not.toContain(groupBId);
    expect(await findProductGroupById(groupBId, tenants.businessAId)).toBeNull();
  });

  it("isOwnedProductGroup rejects a group belonging to another business", async () => {
    expect(await isOwnedProductGroup(groupAId, tenants.businessAId)).toBe(true);
    expect(await isOwnedProductGroup(groupBId, tenants.businessAId)).toBe(false);
  });

  it("listPriceLists/findPriceListById never cross businesses", async () => {
    const priceListsA = await listPriceLists(tenants.businessAId);
    expect(priceListsA.map((p) => String(p._id))).toContain(priceListAId);
    expect(priceListsA.map((p) => String(p._id))).not.toContain(priceListBId);
    expect(await findPriceListById(priceListBId, tenants.businessAId)).toBeNull();
  });

  it("findOwnedPriceListIds drops ids that belong to another business", async () => {
    const owned = await findOwnedPriceListIds([priceListAId, priceListBId], tenants.businessAId);
    expect(owned).toEqual([priceListAId]);
  });
});
