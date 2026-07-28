import { changeMembershipRoleAction, setMembershipStatusAction } from "./actions";

type MemberRow = {
  _id: unknown;
  status: "active" | "deactivated";
  user: { name: string; email: string } | null;
  role: { name: string } | null;
  roleId: unknown;
};

export function MembersTable({
  members,
  roles,
}: {
  members: MemberRow[];
  roles: Array<{ _id: unknown; name: string }>;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Email</th>
          <th className="py-2 pr-4 font-medium">Role</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const membershipId = String(m._id);
          return (
            <tr key={membershipId} className="border-b border-slate-100">
              <td className="py-2 pr-4">{m.user?.name ?? "—"}</td>
              <td className="py-2 pr-4">{m.user?.email ?? "—"}</td>
              <td className="py-2 pr-4">
                <form action={changeMembershipRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <select
                    name="roleId"
                    defaultValue={String(m.roleId)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    {roles.map((r) => (
                      <option key={String(r._id)} value={String(r._id)}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Save
                  </button>
                </form>
              </td>
              <td className="py-2 pr-4">
                <span
                  className={
                    m.status === "active"
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  }
                >
                  {m.status}
                </span>
              </td>
              <td className="py-2 text-right">
                <form action={setMembershipStatusAction}>
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <input
                    type="hidden"
                    name="status"
                    value={m.status === "active" ? "deactivated" : "active"}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {m.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
