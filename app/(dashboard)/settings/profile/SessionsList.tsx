import { Button } from "@/components/ui/button";
import { revokeSessionAction } from "./actions";

type SessionRow = {
  _id: unknown;
  userAgent?: string | null;
  ip?: string | null;
  lastActiveAt: Date;
  expiresAt: Date;
};

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No active sessions.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {sessions.map((s) => {
        const id = String(s._id);
        const revoke = revokeSessionAction.bind(null, id);
        return (
          <li key={id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.userAgent ?? "Unknown device"}</p>
              <p className="text-xs text-muted-foreground">
                {s.ip ? `${s.ip} · ` : ""}last active {new Date(s.lastActiveAt).toLocaleString()}
              </p>
            </div>
            <form action={revoke}>
              <Button type="submit" variant="outline" size="sm" className="shrink-0">
                Revoke
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
