import { CreateBusinessForm } from "./CreateBusinessForm";

export default function NewBusinessPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Create a business</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        You&apos;ll be the Admin of this new business. It&apos;s separate from any other business
        you belong to.
      </p>
      <CreateBusinessForm />
    </div>
  );
}
