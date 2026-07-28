import { STANDARD_MODULES, STANDARD_ACTIONS, SETTINGS_ACTIONS } from "@/lib/rbac/permissions";
import { permissionCheckboxName } from "@/lib/rbac/formParsing";
import type { PermissionMatrix } from "@/lib/db/models/Role";

export function PermissionMatrixFields({
  defaultPermissions,
}: {
  defaultPermissions?: PermissionMatrix;
}) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">Module</th>
              {STANDARD_ACTIONS.map((action) => (
                <th key={action} className="px-2 py-2 text-center font-medium capitalize">
                  {action}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STANDARD_MODULES.map((moduleKey) => (
              <tr key={moduleKey} className="border-b border-slate-100">
                <td className="py-2 pr-4">{moduleKey.replace(/_/g, " ")}</td>
                {STANDARD_ACTIONS.map((action) => (
                  <td key={action} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      name={permissionCheckboxName(moduleKey, action)}
                      defaultChecked={defaultPermissions?.[moduleKey]?.[action] === true}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Settings</p>
        <div className="flex flex-wrap gap-4">
          {SETTINGS_ACTIONS.map((action) => (
            <label key={action} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
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
