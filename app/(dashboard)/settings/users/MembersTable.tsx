import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const membershipId = String(m._id);
          return (
            <TableRow key={membershipId}>
              <TableCell>{m.user?.name ?? "—"}</TableCell>
              <TableCell>{m.user?.email ?? "—"}</TableCell>
              <TableCell>
                <form action={changeMembershipRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <select
                    name="roleId"
                    defaultValue={String(m.roleId)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {roles.map((r) => (
                      <option key={String(r._id)} value={String(r._id)}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              </TableCell>
              <TableCell>
                <Badge variant={m.status === "active" ? "success" : "outline"}>{m.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <form action={setMembershipStatusAction}>
                  <input type="hidden" name="membershipId" value={membershipId} />
                  <input
                    type="hidden"
                    name="status"
                    value={m.status === "active" ? "deactivated" : "active"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {m.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
