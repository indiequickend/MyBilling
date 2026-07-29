import { STANDARD_MODULES, STANDARD_ACTIONS, SETTINGS_ACTIONS } from "@/lib/rbac/permissions";
import { permissionCheckboxName } from "@/lib/rbac/formParsing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { PermissionMatrix } from "@/lib/db/models/Role";

export function PermissionMatrixFields({
  defaultPermissions,
}: {
  defaultPermissions?: PermissionMatrix;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              {STANDARD_ACTIONS.map((action) => (
                <TableHead key={action} className="text-center capitalize">
                  {action}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {STANDARD_MODULES.map((moduleKey) => (
              <TableRow key={moduleKey}>
                <TableCell className="capitalize">{moduleKey.replace(/_/g, " ")}</TableCell>
                {STANDARD_ACTIONS.map((action) => (
                  <TableCell key={action} className="text-center">
                    <Checkbox
                      name={permissionCheckboxName(moduleKey, action)}
                      defaultChecked={defaultPermissions?.[moduleKey]?.[action] === true}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Settings</p>
        <div className="flex flex-wrap gap-4">
          {SETTINGS_ACTIONS.map((action) => (
            <label key={action} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                name={permissionCheckboxName("settings", action)}
                defaultChecked={defaultPermissions?.settings?.[action] === true}
              />
              {action.replace(/_/g, " ")}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
