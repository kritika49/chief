import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChiefLogo } from "@/components/shell/logo";
import { signInWithGoogle } from "./actions";

export const metadata = { title: "Sign in · Chief" };

function isConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.startsWith("PASTE_") && !key.startsWith("PASTE_"));
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const configured = isConfigured();

  if (configured) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next || "/today");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ChiefLogo className="mb-2 size-12" />
          <CardTitle className="text-2xl">Chief</CardTitle>
          <CardDescription>Your project chief of staff.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          {configured ? (
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next ?? "/today"} />
              <Button type="submit" className="w-full" size="lg">
                <GoogleIcon />
                Sign in with Google
              </Button>
            </form>
          ) : (
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Chief isn&apos;t connected to its database yet. Add the Supabase settings to
              <code className="mx-1">.env.local</code> (see SETUP_GUIDE.md), then restart.
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Use your company Google account.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
