import { RoleEditForm } from "./RoleEditForm";
import { Badge } from "@/components/ui/badge";
import type { PermissionMatrix } from "@/lib/db/models/Role";

type RoleRow = {
  _id: unknown;
  name: string;
  permissions: PermissionMatrix;
  isSystemDefault: boolean;
};

export function RolesList({ roles }: { roles: RoleRow[] }) {
  return (
    <div className="divide-y rounded-lg border">
      {roles.map((role) => (
        <details key={String(role._id)} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between">
            <span className="text-sm font-medium">{role.name}</span>
            {role.isSystemDefault ? <Badge variant="outline">default</Badge> : null}
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
