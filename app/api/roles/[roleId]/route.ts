import { NextResponse } from "next/server";
import { getApiBusinessContext } from "@/lib/auth/apiContext";
import { requirePermission } from "@/lib/rbac/can";
import { requireCsrf } from "@/lib/auth/csrf";
import { updateRoleSchema } from "@/lib/validation/roles";
import { updateRole, deleteRole } from "@/lib/db/queries/roles";
import { apiErrorResponse, UnauthorizedError } from "@/lib/api/handleApiError";

export async function PATCH(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  try {
    await requireCsrf(request);
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_roles");

    const { roleId } = await params;
    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const updated = await updateRole(roleId, context.businessId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    return NextResponse.json({ role: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    await requireCsrf(request);
    const context = await getApiBusinessContext();
    if (!context) throw new UnauthorizedError();
    requirePermission(context.membership, "settings", "manage_roles");

    const { roleId } = await params;
    const result = await deleteRole(roleId, context.businessId);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      const messages = {
        not_found: "Role not found.",
        system_default: "The default Admin role can't be deleted.",
        in_use: "Reassign members away from this role before deleting it.",
      } as const;
      return NextResponse.json({ error: messages[result.reason] }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return apiErrorResponse(err);
  }
}
