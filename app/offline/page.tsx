import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "You're offline — MyBilling",
};

// Standalone, no auth/session/DB dependency — this is what the service
// worker serves when a navigation fails with no network reachable.
export default function OfflinePage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <WifiOff className="size-6" />
          </div>
          <CardTitle className="text-lg">You&apos;re offline</CardTitle>
          <CardDescription>
            MyBilling needs a connection to load your data. Check your network and try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/">Try again</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
