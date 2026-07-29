import { Button } from "@/components/ui/button";
import { deleteAccountAction } from "./actions";

export function DeleteAccountButton() {
  return (
    <form action={deleteAccountAction}>
      <Button type="submit" variant="destructive">
        Delete my account permanently
      </Button>
    </form>
  );
}
