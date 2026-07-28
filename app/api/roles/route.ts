import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { requireCsrf } from "@/lib/auth/csrf";
import { createRoleFromTemplateSchema, createRoleFromScratchSchema } from "@/lib/validation/roles";
import { listRolesForBusiness, createRole } from "@/lib/db/queries/roles";
import { ROLE_TEMPLATES, type RoleTemplateName } from "@/lib/rbac/templates";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function GET() {
  try {
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_roles");

    const roles = await listRolesForBusiness(context.businessId);
    return NextResponse.json({ roles });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_roles");

    const body = await request.json();

    if (body.template) {
      const parsed = createRoleFromTemplateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid input" },
          { status: 400 },
        );
      }
      const permissions = ROLE_TEMPLATES[parsed.data.template as RoleTemplateName];
      const role = await createRole({
        businessId: context.businessId,
        name: parsed.data.name,
        permissions,
      });
      return NextResponse.json({ role });
    }

    const parsed = createRoleFromScratchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const role = await createRole({
      businessId: context.businessId,
      name: parsed.data.name,
      permissions: parsed.data.permissions,
    });
    return NextResponse.json({ role });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
