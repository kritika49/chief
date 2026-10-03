import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import { savePreferences } from "./actions";

export const metadata = { title: "Preferences · Chief" };

export default async function PreferencesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("preferences")
    .select("timezone, target_channel_ids, email_greeting, email_signoff, morning_draft_time")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Preferences" description="Where your update goes, your timezone and email wording." />
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>Schedules (morning draft, reminders) become editable when the scheduler is built.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={savePreferences} label="Save" pendingLabel="Saving…">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue={p?.timezone ?? ""} placeholder="Asia/Kolkata" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target">Post my update to (Slack channel ID)</Label>
                <Input id="target" name="target_channel_ids" defaultValue={(p?.target_channel_ids ?? []).join(", ")} placeholder="C027NN9JC7M" />
                <p className="text-xs text-muted-foreground">Several? Separate with commas.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email_greeting">Email greeting</Label>
                <Input id="email_greeting" name="email_greeting" defaultValue={p?.email_greeting ?? "Hi all,"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email_signoff">Email sign-off</Label>
                <Input id="email_signoff" name="email_signoff" defaultValue={p?.email_signoff ?? "Best regards,"} />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
