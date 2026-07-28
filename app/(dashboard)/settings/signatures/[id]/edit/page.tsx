import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findSignatureById } from "@/lib/db/queries/signatures";
import { SignatureForm } from "../../SignatureForm";

export default async function EditSignaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_document_settings")) {
    return <p className="text-sm text-red-700">You don&apos;t have permission to edit signatures.</p>;
  }

  const signature = await findSignatureById(id, context.activeBusinessId);
  if (!signature) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-slate-900">Edit signature</h1>
      <SignatureForm
        mode="edit"
        signatureId={String(signature._id)}
        defaultValues={{ name: signature.name, imageUrl: signature.imageUrl }}
      />
    </div>
  );
}
