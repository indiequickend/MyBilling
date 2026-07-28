import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listSessionsForUser } from "@/lib/auth/session";
import { ProfileForm } from "./ProfileForm";
import { SessionsList } from "./SessionsList";
import { TotpEnrollment } from "./TotpEnrollment";
import { DeleteAccountButton } from "./DeleteAccountButton";

export default async function ProfilePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");

  const sessions = await listSessionsForUser(String(context.user._id));

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Profile</h1>
        <ProfileForm name={context.user.name} phone={context.user.phone ?? undefined} />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Two-factor authentication</h2>
        <TotpEnrollment enabled={context.user.totpEnabled} />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Active sessions</h2>
        <SessionsList sessions={sessions} />
      </div>

      <div>
        <h2 className="mb-4 text-base font-semibold text-red-700">Danger zone</h2>
        <DeleteAccountButton />
      </div>
    </div>
  );
}
