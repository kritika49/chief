import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, FileText, ListChecks, UserX } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { appUrl } from "@/lib/env";
import { createDraftFor, syncDraftSources } from "@/lib/draft/build";
import { createDraft } from "../draft/actions";
import { DraftSection, ProjectOverview } from "./draft-section";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupChecklist, type SetupStep } from "@/components/setup-checklist";
import { StarterDataCard } from "@/components/starter-data-card";
import { isDue, todayIn } from "@/lib/dates";
import { formatHeaderDate } from "@/lib/draft/format";
import { listEvents } from "@/lib/connectors/google";
import { dMon } from "@/lib/meetings/text";
import { workingDaysSince } from "@/lib/matching/run";
import type { ProjectHeader } from "@/lib/types";
import { TimezoneSync } from "./timezone-sync";

export const metadata = { title: "Home · Chief" };

export default async function TodayPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: connections }, { data: profile }, { data: prefs }, projectsRes, drafts] = await Promise.all([
    supabase.from("connections").select("provider, status"),
    supabase.from("profiles").select("slack_user_id").eq("id", user.id).maybeSingle(),
    supabase.from("preferences").select("timezone, stale_task_days, target_channel_ids").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id, name, type, header").eq("active", true).order("sort_order"),
    supabase.from("drafts").select("id", { count: "exact", head: true }),
  ]);
  const projects = (projectsRes.data ?? []) as { id: string; name: string; type: string; header: ProjectHeader }[];
  const today = todayIn(prefs?.timezone);

  const connected = (p: string) => connections?.some((c) => c.provider === p && c.status === "connected") ?? false;
  const steps: SetupStep[] = [
    { label: "Connect Google", help: "So Chief can see your calendar and prepare Gmail drafts.", href: "/connectors/google", done: connected("google") },
    { label: "Connect Slack", help: "Link your Slack account so Chief can read EODs and post updates.", href: "/connectors/slack", done: Boolean(profile?.slack_user_id) },
    { label: "Connect Fathom", help: "So call notes and standup tasks arrive automatically.", href: "/connectors/fathom", done: connected("fathom") },
    { label: "Create your first project", help: "Add a project, its Slack channel and its team.", href: "/settings/projects/new", done: projects.length > 0 },
    { label: "Generate your first draft", help: "Chief assembles your daily update for you to review.", href: "/today", done: (drafts.count ?? 0) > 0 },
  ];
  const setupDone = steps.every((s) => s.done);

  const [{ data: openDraft }, { data: lastPost }, { data: toReview }, { data: unassigned }, { data: overdue }, { data: openTasks }, { data: suggested }] = await Promise.all([
    supabase.from("drafts").select("id, for_date, manual_entries, updated_at").eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("posted_updates").select("posted_at").order("posted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("meetings").select("id, title, type, started_at").eq("status", "new").in("type", ["client_call", "standup"]).order("started_at", { ascending: false }).limit(10),
    supabase.from("meetings").select("id, title, started_at").eq("type", "unassigned").neq("status", "dismissed").order("started_at", { ascending: false }).limit(10),
    supabase.from("followups").select("id, text, due_date, project:projects(name)").eq("status", "open").lte("due_date", today).order("due_date"),
    supabase.from("action_items").select("id, text, created_at, assignee:people(name), meeting:meetings(started_at), matches:task_matches(status)").eq("status", "open").eq("source", "standup"),
    supabase.from("task_matches").select("id").eq("status", "suggested"),
  ]);
  const postedToday = lastPost ? todayIn(prefs?.timezone, new Date(lastPost.posted_at)) === today : false;

  // Today's draft is assembled automatically the first time Home opens each day,
  // unless today's update was already posted or a draft was discarded today.
  // It stays a draft: nothing is posted until the PM presses Post.
  let draft = openDraft;
  if (!draft && projects.length > 0 && !postedToday) {
    const { count: discardedToday } = await supabase.from("drafts").select("id", { count: "exact", head: true }).eq("status", "discarded").eq("for_date", today);
    if (!discardedToday) {
      const r = await createDraftFor(supabase, user.id, appUrl());
      if (r.ok && r.draftId) {
        await syncDraftSources(supabase, user.id, r.draftId, appUrl()).catch(() => false);
        const { data } = await supabase.from("drafts").select("id, for_date, manual_entries, updated_at").eq("id", r.draftId).single();
        draft = data;
      }
    }
  } else if (draft) {
    if (await syncDraftSources(supabase, user.id, draft.id, appUrl()).catch(() => false)) {
      const { data } = await supabase.from("drafts").select("id, for_date, manual_entries, updated_at").eq("id", draft.id).single();
      draft = data ?? draft;
    }
  }
  const { data: missing } = draft
    ? await supabase.from("draft_bullets").select("text, project:projects(name)").eq("draft_id", draft.id).eq("source", "missing_eod")
    : { data: [] };
  const headerFlags = projects.flatMap((p) =>
    p.type === "dev"
      ? (["dev_completion", "launch"] as const).filter((k) => isDue(p.header?.[k], today)).map((k) => `${p.name}: ${k === "launch" ? "Launch" : "Dev Completion"} ${formatHeaderDate(p.header[k])} reached — mark done or revise.`)
      : [],
  );
  const staleDays = prefs?.stale_task_days ?? 2;
  const stale = ((openTasks ?? []) as unknown as { id: string; text: string; created_at: string; assignee: { name: string } | null; meeting: { started_at: string | null } | null; matches: { status: string }[] }[])
    .filter((t) => !t.matches.some((m) => m.status === "suggested") && workingDaysSince(t.meeting?.started_at ?? t.created_at) >= staleDays);

  let meetingsToday: { id: string; title: string; time: string }[] = [];
  if (connected("google")) {
    const start = new Date(new Date().setHours(0, 0, 0, 0));
    const events = await listEvents(user.id, "primary", new Date(), new Date(start.getTime() + 36 * 3600000)).catch(() => []);
    meetingsToday = events
      .filter((e) => e.start?.dateTime && todayIn(prefs?.timezone, new Date(e.start.dateTime)) === today)
      .map((e) => ({ id: e.id, title: e.summary ?? "Meeting", time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: prefs?.timezone ?? undefined }).format(new Date(e.start!.dateTime!)) }));
  }

  const firstName = user.name.split(" ")[0];
  const attention = (missing?.length ?? 0) + headerFlags.length + (toReview?.length ?? 0) + (unassigned?.length ?? 0) + (overdue?.length ?? 0) + stale.length + (suggested?.length ?? 0);

  return (
    <>
      {!prefs?.timezone && <TimezoneSync />}
      <PageHeader title={`${greeting(prefs?.timezone)}, ${firstName}`} description={attention ? "Here's what needs your attention, then today's update." : "Nothing needs your attention. Today's update is below."} />
      <div className="flex flex-col gap-6">
        {!setupDone && <SetupChecklist steps={steps} />}
        <StarterDataCard email={user.email} />

        <div className="grid gap-4 md:grid-cols-2">
          {(missing?.length ?? 0) > 0 && (
            <Panel icon={UserX} title="Missing EODs" href="#draft">
              {(missing as unknown as { text: string; project: { name: string } | null }[]).map((m, i) => <Line key={i}>{m.text} <span className="text-muted-foreground">· {m.project?.name}</span></Line>)}
            </Panel>
          )}
          {headerFlags.length > 0 && (
            <Panel icon={AlertTriangle} title="Dates reached" href="/settings/projects">
              {headerFlags.map((f) => <Line key={f}>{f}</Line>)}
            </Panel>
          )}
          {meetingsToday.length > 0 && (
            <Panel icon={CalendarClock} title="Today's meetings" href="/meetings">
              {meetingsToday.map((m) => <Line key={m.id}><span className="tabular-nums text-muted-foreground">{m.time}</span> {m.title}</Line>)}
              <p className="pt-1 text-xs text-muted-foreground">Client-call briefs (who&apos;s working on what) are under Meetings → Upcoming client calls.</p>
            </Panel>
          )}
          {(toReview?.length ?? 0) > 0 && (
            <Panel icon={CalendarClock} title="Meetings awaiting review" href="/meetings?filter=review">
              {toReview!.map((m) => <Line key={m.id} href={`/meetings/${m.id}`}>{m.title ?? "Meeting"} <Badge variant="outline" className="ml-1">{m.type === "standup" ? "Standup" : "Client call"}</Badge></Line>)}
            </Panel>
          )}
          {(unassigned?.length ?? 0) > 0 && (
            <Panel icon={CalendarClock} title="Unassigned meetings" href="/meetings?filter=unassigned">
              {unassigned!.map((m) => <Line key={m.id} href={`/meetings/${m.id}`}>{m.title ?? "Meeting"} <span className="text-muted-foreground">· {dMon(m.started_at)}</span></Line>)}
            </Panel>
          )}
          {(overdue?.length ?? 0) > 0 && (
            <Panel icon={ListChecks} title="Follow-ups due" href="/tracker">
              {(overdue as unknown as { id: string; text: string; due_date: string; project: { name: string } | null }[]).map((f) => (
                <Line key={f.id}>
                  {f.text} <span className="text-muted-foreground">· {f.project?.name}</span>{" "}
                  {f.due_date < today ? <Badge variant="destructive" className="ml-1">overdue since {dMon(f.due_date)}</Badge> : <Badge variant="warning" className="ml-1">due today</Badge>}
                </Line>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">Chief doesn&apos;t message you about these — check here.</p>
            </Panel>
          )}
          {stale.length > 0 && (
            <Panel icon={ListChecks} title="Stale standup tasks" href="/tracker?tab=tasks">
              {stale.slice(0, 8).map((t) => <Line key={t.id}>{t.text} <span className="text-muted-foreground">· {t.assignee?.name ?? "unassigned"}</span></Line>)}
            </Panel>
          )}
          {(suggested?.length ?? 0) > 0 && (
            <Panel icon={ListChecks} title="Suggested task matches" href="/tracker?tab=tasks">
              <Line>{suggested!.length} standup task{suggested!.length === 1 ? "" : "s"} may be done — confirm or reject in the Tracker.</Line>
            </Panel>
          )}
        </div>
        {setupDone && attention === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" /> Nothing else needs you right now.</p>
        )}

        <section id="draft" className="flex scroll-mt-4 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><FileText className="size-4" /> {draft ? `Update for ${formatHeaderDate(draft.for_date)}` : "Projects"}</h2>
            <p className="text-sm text-muted-foreground">
              {draft ? "A draft for you to review. Nothing is posted or emailed until you press Post." : postedToday ? "Today's update is posted." : ""}
            </p>
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Add a project first"
              description="Your daily update is built from your projects. Add one (or load your starter projects) and it appears here."
              action={<Button asChild><Link href="/settings/projects">Go to Projects</Link></Button>}
            />
          ) : draft ? (
            <DraftSection supabase={supabase} draft={draft} today={today} targetChannels={prefs?.target_channel_ids?.length ?? 0} />
          ) : (
            <>
              <Card className="gap-3">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {postedToday ? "Posted today — it's in History. Start another draft only if you need a correction." : "No draft open (today's was discarded)."}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {postedToday && <Button asChild variant="outline" size="sm"><Link href="/history">View in History</Link></Button>}
                    <ActionForm action={createDraft} label={postedToday ? "Start another draft" : "Start today's draft"} pendingLabel="Assembling…" variant={postedToday ? "ghost" : "default"} />
                  </span>
                </CardContent>
              </Card>
              <ProjectOverview supabase={supabase} />
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Panel({ icon: Icon, title, href, children }: { icon: typeof FileText; title: string; href: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Icon className="size-4" /> {title}</span>
          <Link href={href} className="text-xs font-normal text-primary hover:underline">Open</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">{children}</CardContent>
    </Card>
  );
}

function Line({ children, href }: { children: React.ReactNode; href?: string }) {
  return href ? (
    <Link href={href} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-accent">
      <span className="min-w-0">{children}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
    </Link>
  ) : (
    <div className="px-1 py-0.5">{children}</div>
  );
}

function greeting(timezone?: string | null) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone ?? undefined }).format(new Date()));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
