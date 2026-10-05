import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { buildBrief } from "@/lib/meetings/brief";
import { upcomingClientCalls } from "@/lib/meetings/upcoming";
import { dMon } from "@/lib/meetings/text";

export const metadata = { title: "Pre-call brief · Chief" };

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ event?: string; project?: string }> }) {
  const user = await requireUser();
  const { event, project } = await searchParams;
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle();
  let projectId = project ?? null;
  let title = "Client call";
  let when: string | null = null;
  if (event) {
    const calls = await upcomingClientCalls(supabase, user.id, 72).catch(() => []);
    const c = calls.find((x) => x.eventId === event);
    if (c) {
      projectId = c.projectId;
      title = c.title;
      when = c.start;
    }
  }
  const brief = projectId ? await buildBrief(supabase, user.id, projectId, prefs?.timezone) : null;

  return (
    <>
      <Link href="/meetings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Meetings</Link>
      {!brief ? (
        <EmptyState icon={ClipboardList} title="Brief not found" description="This call isn't in the next 3 days of your calendar, or it isn't matched to a project. Add a meeting rule in the project's settings so Chief recognises it." />
      ) : (
        <>
          <PageHeader title={`Brief: ${title}`} description={`${brief.projectName}${when ? ` · ${formatDateTime(when, prefs?.timezone)}` : ""}`} />
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="gap-3">
              <CardHeader><CardTitle className="text-base">Where things stand</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {brief.headerLines.map((l) => <div key={l}>{l}</div>)}
                <div className="pt-2 text-muted-foreground">Last client call: {brief.lastCall ?? "none recorded"}</div>
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader><CardTitle className="text-base">Open follow-ups</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {brief.followups.length === 0 ? <p className="text-muted-foreground">None open.</p> : brief.followups.map((f, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <span>{f.text}{f.owner ? <span className="text-muted-foreground"> — {f.owner}</span> : null}</span>
                    {f.due && <Badge variant={f.overdue ? "destructive" : "outline"}>{f.overdue ? "Overdue " : "Due "}{dMon(f.due)}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="gap-3 md:col-span-2">
              <CardHeader><CardTitle className="text-base">Updates since the last call</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {brief.updates.length === 0 ? <p className="text-muted-foreground">No posted updates since the last call.</p> : brief.updates.map((u, i) => (
                  <div key={i}>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">{u.date}</div>
                    <ul className="list-disc space-y-1 pl-5">{u.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="gap-3 md:col-span-2">
              <CardHeader><CardTitle className="text-base">Who&apos;s working on what</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                {brief.team.length === 0 && <p className="text-muted-foreground">No team members on this project.</p>}
                {brief.team.map((m) => (
                  <div key={m.name}>
                    <div className="font-medium">{m.name}</div>
                    {m.lastEod ? (
                      <div className="mt-1">
                        <div className="text-xs text-muted-foreground">Latest EOD · {m.lastEod.date}</div>
                        <ul className="list-disc space-y-0.5 pl-5">{m.lastEod.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{m.mode === "slack_scan" ? "No EOD in the last few days." : "Update typed by you in the draft."}</div>
                    )}
                    {m.openTasks.length > 0 && (
                      <div className="mt-1">
                        <div className="text-xs text-muted-foreground">To be worked on (open standup tasks)</div>
                        <ul className="list-disc space-y-0.5 pl-5">{m.openTasks.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    )}
                  </div>
                ))}
                <div>
                  <div className="font-medium">You</div>
                  {brief.myTodos.today.length + brief.myTodos.later.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No open to-dos for this project.</div>
                  ) : (
                    <>
                      {brief.myTodos.today.length > 0 && <><div className="mt-1 text-xs text-muted-foreground">Today</div><ul className="list-disc space-y-0.5 pl-5">{brief.myTodos.today.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
                      {brief.myTodos.later.length > 0 && <><div className="mt-1 text-xs text-muted-foreground">Later</div><ul className="list-disc space-y-0.5 pl-5">{brief.myTodos.later.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader><CardTitle className="text-base">Open to-dos from client calls</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {brief.todos.length === 0 ? <p className="text-muted-foreground">None.</p> : <ul className="list-disc space-y-1 pl-5">{brief.todos.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader><CardTitle className="text-base">Flagged blockers</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {brief.blockers.length === 0 ? <p className="text-muted-foreground">None this week.</p> : <ul className="list-disc space-y-1 pl-5">{brief.blockers.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
