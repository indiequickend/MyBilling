import { RoleEditForm } from "./RoleEditForm";
import type { PermissionMatrix } from "@/lib/db/models/Role";

type RoleRow = {
  _id: unknown;
  name: string;
  permissions: PermissionMatrix;
  isSystemDefault: boolean;
};

export function RolesList({ roles }: { roles: RoleRow[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
      {roles.map((role) => (
        <details key={String(role._id)} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="text-sm font-medium text-slate-900">{role.name}</span>
            {role.isSystemDefault ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                default
              </span>
            ) : null}
          </summary>
          <div className="mt-4">
            <RoleEditForm
              roleId={String(role._id)}
              name={role.name}
              permissions={role.permissions}
              isSystemDefault={role.isSystemDefault}
            />
          </div>
        </details>
      ))}
    </div>
  );
}
