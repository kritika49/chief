import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Not allowed · Chief" };

export default function NotAllowedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>This account can&apos;t use Chief</CardTitle>
          <CardDescription>
            Chief is only open to your company&apos;s Google accounts. Try signing in with your work
            email, or ask your admin to add your email domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
