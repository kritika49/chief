import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { deleteMyData, disconnectAll } from "./actions";

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Disconnect all</CardTitle>
          <CardDescription>Removes Chief&apos;s access to your Google account and Fathom, and unlinks your Slack account. Your projects and history stay.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={disconnectAll} label="Disconnect all" variant="outline" confirm="Disconnect Google, Slack and Fathom?" />
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Delete my data</CardTitle>
          <CardDescription>Permanently deletes your Chief account: projects, people, to-dos, meetings, drafts and update history. This can&apos;t be undone. Messages already posted in Slack and Gmail drafts stay where they are.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={deleteMyData} label="Delete everything" variant="destructive" confirm="Permanently delete your Chief account and all its data?">
            <Input name="confirm" placeholder="Type DELETE to confirm" className="max-w-xs" autoComplete="off" />
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
