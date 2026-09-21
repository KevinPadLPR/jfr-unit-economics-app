"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center pb-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, no benefit from next/image's raster optimizer */}
          <img src="/brand/logo-lockup.svg" alt="JFR Ranch" width={160} height={140} />
          <CardTitle className="text-lg text-foreground">Position Desk</CardTitle>
          <CardDescription>Unit Economics &amp; Market Position</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground"
              />
            </label>
            {error && <p className="text-sm text-[#a12525]">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
