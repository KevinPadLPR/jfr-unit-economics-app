import Image from "next/image";
import { auth, signOut } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function RancherHome() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Image src="/brand/logo-lockup.svg" alt="JFR Ranch" width={140} height={122} priority />
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Hi, {session?.user?.name ?? "there"}</CardTitle>
          <CardDescription>Rancher data entry</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Field data entry (weights, deaths, moves, health events) is coming in the next phase
            of the Position Desk build. For now, keep sending updates the way you do today.
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
