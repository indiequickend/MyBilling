import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listSessionsForUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./ProfileForm";
import { SessionsList } from "./SessionsList";
import { TotpEnrollment } from "./TotpEnrollment";
import { DeleteAccountButton } from "./DeleteAccountButton";

export default async function ProfilePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");

  const sessions = await listSessionsForUser(String(context.user._id));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Profile</h1>
      </div>

      <Card>
        <CardContent>
          <ProfileForm name={context.user.name} phone={context.user.phone ?? undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <TotpEnrollment enabled={context.user.totpEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsList sessions={sessions} />
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton />
        </CardContent>
      </Card>
    </div>
  );
}
