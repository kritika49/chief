import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StarterDataCard } from "@/components/starter-data-card";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SetupChecklist, type SetupStep } from "@/components/setup-checklist";
import { TimezoneSync } from "./timezone-sync";

export const metadata = { title: "Today · Chief" };

export default async function TodayPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: connections }, { data: profile }, { data: prefs }, projects, drafts] = await Promise.all([
    supabase.from("connections").select("provider, status"),
    supabase.from("profiles").select("slack_user_id").eq("id", user.id).maybeSingle(),
    supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("drafts").select("id", { count: "exact", head: true }),
  ]);
  const [{ data: openDraft }, { data: lastPost }] = await Promise.all([
    supabase.from("drafts").select("id").eq("status", "draft").maybeSingle(),
    supabase.from("posted_updates").select("posted_at").order("posted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const postedToday = lastPost ? todayIn(prefs?.timezone, new Date(lastPost.posted_at)) === todayIn(prefs?.timezone) : false;

  const connected = (p: string) => connections?.some((c) => c.provider === p && c.status === "connected") ?? false;
  const steps: SetupStep[] = [
    { label: "Connect Google", help: "So Chief can see your calendar and prepare Gmail drafts.", href: "/connectors/google", done: connected("google") },
    { label: "Connect Slack", help: "Link your Slack account so Chief can read EODs and post updates.", href: "/connectors/slack", done: Boolean(profile?.slack_user_id) },
    { label: "Connect Fathom", help: "So call notes and standup tasks arrive automatically.", href: "/connectors/fathom", done: connected("fathom") },
    { label: "Create your first project", help: "Add a project, its Slack channel and its team.", href: "/settings/projects/new", done: (projects.count ?? 0) > 0 },
    { label: "Generate your first draft", help: "Chief assembles your daily update for you to review.", href: "/draft", done: (drafts.count ?? 0) > 0 },
  ];
  const setupDone = steps.every((s) => s.done);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      {!prefs?.timezone && <TimezoneSync />}
      <PageHeader title={`${greeting(prefs?.timezone)}, ${firstName}`} description="Here's what needs your attention today." />
      <div className="flex flex-col gap-6">
        {!setupDone && <SetupChecklist steps={steps} />}
        <StarterDataCard email={user.email} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Today&apos;s update</CardTitle>
            <CardDescription>
              {postedToday
                ? "Posted today. Nice work."
                : openDraft
                  ? "Your draft is open — paste any EODs, review, then copy or post."
                  : "Not started yet. Chief assembles it from your projects; you review before anything is posted."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant={openDraft ? "default" : "outline"}>
              <Link href="/draft">{openDraft ? "Continue draft" : postedToday ? "View draft page" : "Start today's draft"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function greeting(timezone?: string | null) {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone ?? undefined }).format(new Date()),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
