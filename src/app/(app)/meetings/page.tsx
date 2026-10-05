import Link from "next/link";
import { CalendarClock, ChevronRight, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/action-form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { todayIn } from "@/lib/dates";
import { upcomingClientCalls } from "@/lib/meetings/upcoming";
import { addManualMeeting } from "./actions";

export const metadata = { title: "Meetings · Chief" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "review", label: "Needs review" },
  { key: "client_call", label: "Client calls" },
  { key: "standup", label: "Standups" },
  { key: "unassigned", label: "Unassigned" },
] as const;

const TYPE_LABEL: Record<string, string> = { client_call: "Client call", standup: "Standup", ignore: "Ignored", unassigned: "Unassigned" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter = "all" } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("meetings").select("id, title, started_at, type, status, is_manual, project:projects(name)").order("started_at", { ascending: false }).limit(60);
  if (filter === "review") q = q.in("type", ["client_call", "standup"]).eq("status", "new");
  else if (filter === "client_call" || filter === "standup" || filter === "unassigned") q = q.eq("type", filter);
  else q = q.neq("status", "dismissed");
  const [{ data: meetings }, { data: projects }, { data: prefs }, upcoming] = await Promise.all([
    q,
    supabase.from("projects").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle(),
    upcomingClientCalls(supabase, user.id, 36).catch(() => []),
  ]);
  type Row = { id: string; title: string | null; started_at: string | null; type: string; status: string; is_manual: boolean; project: { name: string } | null };

  return (
    <>
      <PageHeader title="Meetings" description="Client calls and standups from Fathom (or your own notes). Review them to feed your update, minutes and tracker." />
      <div className="space-y-6">
        {upcoming.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">Upcoming client calls</CardTitle>
              <CardDescription>Open the brief before the call.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.map((u) => (
                <Link key={u.eventId} href={`/meetings/brief?event=${encodeURIComponent(u.eventId)}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent">
                  <span>
                    <b>{u.title}</b> <span className="text-muted-foreground">· {u.projectName} · {formatDateTime(u.start, prefs?.timezone)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-primary">Brief <ChevronRight className="size-4" /></span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/meetings?filter=${f.key}`} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium hover:bg-accent", filter === f.key && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}>
              {f.label}
            </Link>
          ))}
        </nav>

        {!meetings?.length ? (
          <EmptyState
            icon={CalendarClock}
            title={filter === "all" ? "No meetings yet" : "Nothing here"}
            description="When Fathom finishes a recorded call it appears here automatically. For calls that weren't recorded, add your notes below."
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {(meetings as unknown as Row[]).map((m) => (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.title ?? "Untitled meeting"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(m.started_at, prefs?.timezone)} · {m.project?.name ?? "No project"}{m.is_manual ? " · Your notes" : ""}
                    </div>
                  </div>
                  <Badge variant={m.type === "unassigned" ? "warning" : "outline"}>{TYPE_LABEL[m.type]}</Badge>
                  {m.status === "new" && m.type !== "unassigned" && <Badge variant="warning">Needs review</Badge>}
                  {m.status === "reviewed" && <Badge variant="success">Reviewed</Badge>}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4" /> Add notes for a call that wasn&apos;t recorded</CardTitle>
            <CardDescription>Paste your notes; Chief splits them into lines you can review just like a Fathom call.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addManualMeeting} label="Add & review" pendingLabel="Saving…">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="e.g. Bles weekly with Patrick" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" name="date" type="date" defaultValue={todayIn(prefs?.timezone)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project_id">Project</Label>
                  <Select id="project_id" name="project_id" required defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <Select id="type" name="type" defaultValue="client_call">
                    <option value="client_call">Client call</option>
                    <option value="standup">Standup</option>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notes">Notes (one point per line)</Label>
                  <Textarea id="notes" name="notes" rows={5} placeholder={"Agreed to proceed with the maintenance plan\nSplit payouts can be taken up later"} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="actions">Action items (one per line)</Label>
                  <Textarea id="actions" name="actions" rows={3} placeholder="Share the PostHog sign-up video with Patrick" />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
