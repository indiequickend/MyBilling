import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { NoteTermForm } from "../NoteTermForm";

export default async function NewNoteTermTemplatePage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to create templates.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">New note/term template</h1>
      <NoteTermForm mode="create" />
    </div>
  );
}
