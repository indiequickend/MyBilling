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
    return <p className="text-sm text-slate-500">No active sessions.</p>;
  }

  return (
    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
      {sessions.map((s) => {
        const id = String(s._id);
        const revoke = revokeSessionAction.bind(null, id);
        return (
          <li key={id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-900">{s.userAgent ?? "Unknown device"}</p>
              <p className="text-xs text-slate-500">
                {s.ip ? `${s.ip} · ` : ""}last active {new Date(s.lastActiveAt).toLocaleString()}
              </p>
            </div>
            <form action={revoke}>
              <button
                type="submit"
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Revoke
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
