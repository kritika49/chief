import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Account · Chief" };

export default async function AccountPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle();

  return (
    <>
      <PageHeader title="Account" description="Your profile and sign-in." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {user.name}
            {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
          </CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex justify-between border-t pt-4">
            <span className="text-muted-foreground">Timezone</span>
            <span>{prefs?.timezone ?? "Detecting from your browser…"}</span>
          </div>
          <form action="/auth/sign-out" method="post" className="border-t pt-4">
            <Button type="submit" variant="outline">
              <LogOut /> Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
