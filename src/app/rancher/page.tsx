import { auth, signOut } from "@/auth";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Read-only operational view for the "rancher" role. This is NOT a data-entry
 * screen — field data (weights, deaths, moves, health events) is captured in
 * John's own app, and cost/revenue assumptions are maintained by the office
 * in the Excel pipeline; this dashboard has no legitimate write path for
 * either. Deliberately excludes $ cost/revenue and market/hedge position
 * data (Cost of Gain, Market Position) - those stay admin-only.
 */
export default async function RancherHome() {
  const session = await auth();
  const lots = listGlLots().filter((l) => (l.status ?? "").toLowerCase() === "open");

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-background px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, no benefit from next/image's raster optimizer */}
      <img src="/brand/logo-lockup.svg" alt="JFR Ranch" width={140} height={122} />
      <Card className="w-full max-w-4xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Hi, {session?.user?.name ?? "there"}</CardTitle>
            <CardDescription>Your open lots — read-only</CardDescription>
          </div>
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
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This is a read-only view. To log weights, deaths, moves, or health events, keep using
            the field app the way you do today — those updates flow into this dashboard
            automatically.
          </p>
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Feed type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Head on hand</TableHead>
                  <TableHead className="text-right">Avg DOF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l.lot}>
                    <TableCell className="font-medium">{l.lot}</TableCell>
                    <TableCell>{l.feed_type ?? "—"}</TableCell>
                    <TableCell>{l.location_type ?? "—"}</TableCell>
                    <TableCell className="text-right">{l.head_on_hand != null ? formatNumber(l.head_on_hand) : "—"}</TableCell>
                    <TableCell className="text-right">{l.avg_dof != null ? formatNumber(l.avg_dof) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
