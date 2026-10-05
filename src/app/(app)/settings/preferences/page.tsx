import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import { savePreferences } from "./actions";

export const metadata = { title: "Preferences · Chief" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayPicker({ name, value }: { name: string; value: number[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {DAYS.map((d, i) => (
        <label key={d} className="flex items-center gap-1.5"><input type="checkbox" name={name} value={i + 1} defaultChecked={value.includes(i + 1)} /> {d}</label>
      ))}
    </div>
  );
}

export default async function PreferencesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("preferences").select("*").eq("user_id", user.id).maybeSingle();
  const n = (p?.notifications ?? {}) as Record<string, boolean>;

  return (
    <>
      <PageHeader title="Preferences" description="Where your update goes, the nightly EOD check, email wording and matching." />
      <ActionForm action={savePreferences} label="Save preferences" pendingLabel="Saving…" className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue={p?.timezone ?? ""} placeholder="Asia/Kolkata" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target">Post my update to (Slack channel ID)</Label>
              <Input id="target" name="target_channel_ids" defaultValue={(p?.target_channel_ids ?? []).join(", ")} placeholder="C027NN9JC7M" />
              <p className="text-xs text-muted-foreground">Several? Separate with commas.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Working days</Label>
              <DayPicker name="working_days" value={p?.working_days ?? [1, 2, 3, 4, 5]} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nightly EOD check — 11:00 pm IST, Mon–Fri</CardTitle>
            <CardDescription>
              Once a night Chief reads the day&apos;s EODs from Slack and matches them to standup tasks. Everything else
              (your draft, pre-call briefs, follow-ups) stays on the platform — no other messages are sent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="n_dev_nudges" defaultChecked={n.dev_nudges ?? true} className="mt-0.5" />
              <span><b>Remind developers whose EOD is missing</b><span className="block text-xs text-muted-foreground">A gentle Slack DM: &ldquo;Chief here 👋 friendly reminder to drop your EOD when you get a moment.&rdquo; You can switch it off per person in a project&apos;s Team section.</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="n_pm_nightly" defaultChecked={n.pm_nightly ?? true} className="mt-0.5" />
              <span><b>Send me a summary and a to-do cross-check reminder</b><span className="block text-xs text-muted-foreground">Who posted, who was reminded, and a link to tick off today&apos;s to-dos.</span></span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Meeting minutes email</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="greet">Greeting</Label>
              <Input id="greet" name="email_greeting" defaultValue={p?.email_greeting ?? "Hi all,"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sign">Sign-off</Label>
              <Input id="sign" name="email_signoff" defaultValue={p?.email_signoff ?? "Best regards,"} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="auto_gmail_draft" defaultChecked={p?.auto_gmail_draft ?? true} /> Create the Gmail draft automatically when I finish reviewing a client call</label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blockers &amp; task matching</CardTitle>
            <CardDescription>How Chief flags blockers in EODs and matches standup tasks to EODs.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="blockers">Blocker words</Label>
              <Input id="blockers" name="blocker_keywords" defaultValue={(p?.blocker_keywords ?? []).join(", ")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="high">Auto-match at score ≥</Label>
              <Input id="high" name="match_high_threshold" type="number" step="0.05" min={0.1} max={1} defaultValue={p?.match_high_threshold ?? 0.6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="medium">Suggest at score ≥</Label>
              <Input id="medium" name="match_medium_threshold" type="number" step="0.05" min={0.05} max={1} defaultValue={p?.match_medium_threshold ?? 0.3} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stale">Flag tasks with no match after (working days)</Label>
              <Input id="stale" name="stale_task_days" type="number" min={1} max={30} defaultValue={p?.stale_task_days ?? 2} />
            </div>
          </CardContent>
        </Card>
      </ActionForm>
    </>
  );
}
