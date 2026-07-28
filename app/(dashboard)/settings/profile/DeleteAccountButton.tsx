import { deleteAccountAction } from "./actions";

export function DeleteAccountButton() {
  return (
    <form action={deleteAccountAction}>
      <button
        type="submit"
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
      >
        Delete my account permanently
      </button>
    </form>
  );
}
