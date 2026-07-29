import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findNoteTermTemplateById } from "@/lib/db/queries/noteTermTemplates";
import { NoteTermForm } from "../../NoteTermForm";

export default async function EditNoteTermTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to edit templates.</p>;
  }

  const template = await findNoteTermTemplateById(id, context.activeBusinessId);
  if (!template) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Edit note/term template</h1>
      <NoteTermForm
        mode="edit"
        templateId={String(template._id)}
        defaultValues={{
          docType: template.docType,
          kind: template.kind,
          title: template.title ?? "",
          body: template.body,
          isActive: template.isActive,
        }}
      />
    </div>
  );
}
