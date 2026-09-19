import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { can } from "@/lib/rbac/can";
import type { ModuleKey, ActionKey } from "@/lib/rbac/permissions";
import { listCustomers, findCustomerById } from "@/lib/db/queries/customers";
import { listVendors, findVendorById } from "@/lib/db/queries/vendors";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 30;

/** Anyone who can pick a customer/vendor on a form already receives that party list from the form's
 * own page, so search is open to the same set of permissions (not just customers/vendors.view). */
const ALLOWED: Record<"customer" | "vendor", Array<[ModuleKey, ActionKey]>> = {
  customer: [
    ["customers", "view"],
    ["sales_invoices", "create"],
    ["sales_invoices", "edit"],
    ["sales_credit_notes", "create"],
    ["sales_credit_notes", "edit"],
    ["quotations", "create"],
    ["quotations", "edit"],
    ["sales_orders", "create"],
    ["sales_orders", "edit"],
    ["proforma_invoices", "create"],
    ["proforma_invoices", "edit"],
    ["indirect_income", "create"],
    ["indirect_income", "edit"],
    ["payments", "create"],
  ],
  vendor: [
    ["vendors", "view"],
    ["purchases", "create"],
    ["purchases", "edit"],
    ["purchase_orders", "create"],
    ["purchase_orders", "edit"],
    ["debit_notes", "create"],
    ["debit_notes", "edit"],
    ["expenses", "create"],
    ["expenses", "edit"],
    ["payments", "create"],
  ],
};

/** Server-side search behind the customer/vendor pickers — the pickers only preload the first page
 * of parties, so typing must query the whole business, not filter that preloaded slice.
 * GET, read-only, tenant-scoped via the session's active business. */
export async function GET(request: Request) {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();

    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    if (type !== "customer" && type !== "vendor") {
      return NextResponse.json({ error: "type must be customer or vendor" }, { status: 400 });
    }
    if (!ALLOWED[type].some(([moduleKey, action]) => can(context.membership, moduleKey, action))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const partyLabel = (p: { displayName: string; companyName?: string | null }) =>
      p.companyName ? `${p.displayName} (${p.companyName})` : p.displayName;

    // ?id= resolves one party's label — used to display a saved selection that isn't among the
    // preloaded options (e.g. an older customer on an edit form).
    const id = params.get("id");
    if (id !== null) {
      if (!/^[0-9a-f]{24}$/i.test(id)) return NextResponse.json({ parties: [] });
      const party =
        type === "customer"
          ? await findCustomerById(id, context.businessId)
          : await findVendorById(id, context.businessId);
      return NextResponse.json({
        parties: party && !party.deletedAt ? [{ value: String(party._id), label: partyLabel(party) }] : [],
      });
    }

    const search = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const result =
      type === "customer"
        ? await listCustomers(context.businessId, { search, pageSize: RESULT_LIMIT })
        : await listVendors(context.businessId, { search, pageSize: RESULT_LIMIT });

    return NextResponse.json({
      parties: result.items.map((p) => ({ value: String(p._id), label: partyLabel(p) })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
