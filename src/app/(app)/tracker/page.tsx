import Link from "next/link";
import { ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionForm } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { todayIn } from "@/lib/dates";
import { dMon } from "@/lib/meetings/text";
import { workingDaysSince } from "@/lib/matching/run";
import { addFollowup } from "./actions";
import { FollowupStatus, MatchButtons, TaskStatus } from "./buttons";

export const metadata = { title: "Tracker · Chief" };

type Followup = { id: string; text: string; owner_name: string | null; due_date: string | null; status: string; meeting_id: string | null; project: { name: string } | null; meeting: { title: string | null; started_at: string | null } | null };
type Task = {
  id: string; text: string; status: string; due_date: string | null; created_at: string; assignee_raw: string | null; meeting_id: string | null;
  project: { name: string } | null; assignee: { name: string } | null; meeting: { started_at: string | null } | null;
  matches: { id: string; status: string; score: number; bullet: { text: string } | null }[];
};

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string }> }) {
  const user = await requireUser();
  const { tab = "followups", show = "open" } = await searchParams;
  const supabase = await createClient();
  const [{ data: prefs }, { data: projects }] = await Promise.all([
    supabase.from("preferences").select("timezone, stale_task_days").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id, name").eq("active", true).order("sort_order"),
  ]);
  const today = todayIn(prefs?.timezone);
  const staleDays = prefs?.stale_task_days ?? 2;
  const tabs = [
    { key: "followups", label: "Follow-ups" },
    { key: "tasks", label: "Standup tasks" },
  ];

  return (
    <>
      <PageHeader title="Tracker" description="What you promised clients, and what was assigned in standups." />
      <nav className="mb-6 flex gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={`/tracker?tab=${t.key}`} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium hover:bg-accent", tab === t.key && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>{t.label}</Link>
        ))}
        <Link href={`/tracker?tab=${tab}&show=${show === "open" ? "all" : "open"}`} className="ml-auto self-center text-sm text-muted-foreground hover:underline">
          {show === "open" ? "Show done too" : "Only open"}
        </Link>
      </nav>
      {tab === "tasks" ? <Tasks show={show} today={today} staleDays={staleDays} /> : <Followups show={show} today={today} projects={projects ?? []} />}
    </>
  );
}

async function Followups({ show, today, projects }: { show: string; today: string; projects: { id: string; name: string }[] }) {
  const supabase = await createClient();
  let q = supabase.from("followups").select("id, text, owner_name, due_date, status, meeting_id, project:projects(name), meeting:meetings(title, started_at)").order("due_date", { nullsFirst: false }).order("created_at");
  if (show === "open") q = q.eq("status", "open");
  const { data } = await q;
  const rows = (data ?? []) as unknown as Followup[];
  // Promised vs delivered per call.
  const { data: all } = await supabase.from("followups").select("status, meeting_id, meeting:meetings(title, started_at)").not("meeting_id", "is", null);
  const perCall = new Map<string, { title: string; date: string | null; promised: number; delivered: number }>();
  for (const f of (all ?? []) as unknown as { status: string; meeting_id: string; meeting: { title: string | null; started_at: string | null } | null }[]) {
    const e = perCall.get(f.meeting_id) ?? { title: f.meeting?.title ?? "Call", date: f.meeting?.started_at ?? null, promised: 0, delivered: 0 };
    e.promised += f.status === "cancelled" ? 0 : 1;
    e.delivered += f.status === "done" ? 1 : 0;
    perCall.set(f.meeting_id, e);
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <EmptyState icon={ListChecks} title="No follow-ups" description="When you route a client-call action item to Follow-up, it lands here with its owner and due date. You can also add one below." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((f) => {
            const overdue = f.status === "open" && !!f.due_date && f.due_date < today;
            return (
              <li key={f.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 text-sm", overdue && "bg-destructive/5")}>
                <div className="min-w-0 flex-1">
                  <div className={cn(f.status !== "open" && "text-muted-foreground line-through")}>{f.text}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.project?.name}{f.owner_name ? ` · ${f.owner_name}` : ""}
                    {f.meeting_id && <> · <Link href={`/meetings/${f.meeting_id}`} className="hover:underline">{f.meeting?.title ?? "call"}{f.meeting?.started_at ? ` (${dMon(f.meeting.started_at)})` : ""}</Link></>}
                  </div>
                </div>
                {f.due_date && <Badge variant={overdue ? "destructive" : "outline"}>{overdue ? "Overdue · " : "Due "}{dMon(f.due_date)}</Badge>}
                <FollowupStatus id={f.id} status={f.status} />
              </li>
            );
          })}
        </ul>
      )}

      {perCall.size > 0 && (
        <Card className="gap-3">
          <CardHeader><CardTitle className="text-base">Promised vs delivered, per call</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[...perCall.entries()].sort((a, b) => (b[1].date ?? "").localeCompare(a[1].date ?? "")).slice(0, 10).map(([id, c]) => (
              <div key={id} className="flex items-center justify-between gap-2">
                <Link href={`/meetings/${id}`} className="hover:underline">{c.title}{c.date ? ` · ${dMon(c.date)}` : ""}</Link>
                <span className={cn("tabular-nums", c.delivered < c.promised ? "text-muted-foreground" : "text-success")}>{c.delivered} of {c.promised} delivered</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="gap-3">
        <CardHeader><CardTitle className="text-base">Add a follow-up</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={addFollowup} label="Add" variant="secondary">
            <div className="grid gap-2 sm:grid-cols-4">
              <Input name="text" placeholder="e.g. Share PostHog setup steps" className="sm:col-span-2" required />
              <Select name="project_id" defaultValue="" required>
                <option value="" disabled>Project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input name="due_date" type="date" aria-label="Due date" />
              <Input name="owner_name" placeholder="Owner (optional)" className="sm:col-span-2" />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

async function Tasks({ show, today, staleDays }: { show: string; today: string; staleDays: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("action_items")
    .select("id, text, status, due_date, created_at, assignee_raw, meeting_id, project:projects(name), assignee:people(name), meeting:meetings(started_at), matches:task_matches(id, status, score, bullet:eod_bullets(text))")
    .eq("source", "standup")
    .order("created_at", { ascending: false })
    .limit(100);
  if (show === "open") q = q.eq("status", "open");
  const { data } = await q;
  const rows = (data ?? []) as unknown as Task[];
  if (!rows.length) {
    return <EmptyState icon={ListChecks} title="No standup tasks" description="Tasks you post from a standup review appear here. Chief checks each one against the assignee's EODs and marks it done when they match." />;
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((t) => {
        const auto = t.matches.find((m) => m.status === "auto" || m.status === "confirmed");
        const suggested = t.matches.find((m) => m.status === "suggested");
        const stale = t.status === "open" && !suggested && workingDaysSince(t.meeting?.started_at ?? t.created_at) >= staleDays;
        const overdue = t.status === "open" && !!t.due_date && t.due_date < today;
        return (
          <li key={t.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className={cn(t.status === "done" && "text-muted-foreground line-through")}>{t.text}</div>
                <div className="text-xs text-muted-foreground">
                  {t.assignee?.name ?? t.assignee_raw ?? "Unassigned"} · {t.project?.name}
                  {t.meeting_id && <> · <Link href={`/meetings/${t.meeting_id}`} className="hover:underline">standup {t.meeting?.started_at ? dMon(t.meeting.started_at) : ""}</Link></>}
                </div>
              </div>
              {t.due_date && <Badge variant={overdue ? "destructive" : "outline"}>Due {dMon(t.due_date)}</Badge>}
              {stale && <Badge variant="warning">No matching EOD for {staleDays}+ working days</Badge>}
              {auto && <Badge variant="success">{auto.status === "auto" ? "Auto-matched" : "Matched"}</Badge>}
              <TaskStatus id={t.id} status={t.status} />
            </div>
            {auto?.bullet && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-success/10 p-2 text-xs">
                <span className="flex-1">EOD: “{auto.bullet.text}”</span>
                {auto.status === "auto" && <MatchButtons id={auto.id} kind="auto" />}
              </div>
            )}
            {suggested?.bullet && t.status === "open" && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-warning/15 p-2 text-xs">
                <span className="flex-1">Suggested match: “{suggested.bullet.text}”</span>
                <MatchButtons id={suggested.id} kind="suggested" />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
