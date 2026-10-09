import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slackConfigured } from "@/lib/connectors/slack";
import type { DraftBullet } from "@/lib/draft/assemble";
import type { ScanMeta } from "@/lib/draft/build";
import { formatHeaderDate } from "@/lib/draft/format";
import { HEADER_FIELDS, type Project, type ProjectHeader, type ProjectType, type TrackingMode } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftEditor, SlackBar, TodoMini, CallsMini, type EditorProject, type ProjectSide, type TodoLite } from "../draft/draft-editor";

type MemberJoin = { project_id: string; tracking_mode: TrackingMode; person: { id: string; name: string } };

/** Per-project to-dos (today + done, not yet archived) and meetings awaiting review. */
export async function loadProjectSide(supabase: SupabaseClient): Promise<Record<string, ProjectSide>> {
  const [{ data: todos }, { data: calls }] = await Promise.all([
    supabase.from("todos").select("id, project_id, text, list").is("archived_at", null).order("sort_order").order("created_at"),
    supabase.from("meetings").select("id, project_id, title, type").eq("status", "new").in("type", ["client_call", "standup"]).order("started_at", { ascending: false }),
  ]);
  const side: Record<string, ProjectSide> = {};
  const get = (id: string) => (side[id] ??= { todos: [], laterCount: 0, calls: [] });
  for (const t of todos ?? []) {
    if (!t.project_id) continue;
    if (t.list === "later") get(t.project_id).laterCount++;
    else get(t.project_id).todos.push({ id: t.id, text: t.text, list: t.list } as TodoLite);
  }
  for (const m of calls ?? []) if (m.project_id) get(m.project_id).calls.push({ id: m.id, title: m.title, type: m.type });
  return side;
}

/** The open draft: Slack bar, project cards with editable update lines, preview and post. */
export async function DraftSection({ supabase, draft, today, targetChannels }: {
  supabase: SupabaseClient;
  draft: { id: string; manual_entries: unknown; updated_at: string };
  today: string;
  targetChannels: number;
}) {
  const [{ data: projects }, { data: bullets }, { data: members }, { data: channels }, side] = await Promise.all([
    supabase.from("projects").select("id, name, type, header, sort_order, active").eq("active", true).order("sort_order"),
    supabase.from("draft_bullets").select("project_id, text, source, source_ref, source_url, position").eq("draft_id", draft.id).order("position"),
    supabase.from("project_members").select("project_id, tracking_mode, person:people(id, name)"),
    supabase.from("channels").select("project_id, eod_keyword, is_primary").eq("active", true),
    loadProjectSide(supabase),
  ]);
  const { _scan: scanMeta, ...entries } = (draft.manual_entries ?? {}) as Record<string, Record<string, string>> & { _scan?: ScanMeta };
  const memberRows = (members ?? []) as unknown as MemberJoin[];

  const editorProjects: EditorProject[] = ((projects ?? []) as Project[]).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    header: p.header ?? {},
    keyword: channels?.find((c) => c.project_id === p.id && c.is_primary)?.eod_keyword ?? channels?.find((c) => c.project_id === p.id)?.eod_keyword ?? "EOD",
    members: memberRows
      .filter((m) => m.project_id === p.id && m.tracking_mode !== "none")
      .map((m) => ({ personId: m.person.id, name: m.person.name, tracking: m.tracking_mode, text: entries[p.id]?.[m.person.id] ?? "" })),
    bullets: (bullets ?? []).filter((b) => b.project_id === p.id).map<DraftBullet>((b) => ({ text: b.text, source: b.source, source_ref: b.source_ref, source_url: b.source_url })),
  }));

  return (
    <>
      {slackConfigured() && (
        <SlackBar draftId={draft.id} scan={scanMeta ?? { at: "", unknown: [], errors: [] }} projectNames={Object.fromEntries(editorProjects.map((p) => [p.id, p.name]))} />
      )}
      <DraftEditor
        key={draft.updated_at}
        draftId={draft.id}
        today={today}
        projects={editorProjects}
        side={side}
        canPost={slackConfigured() && targetChannels > 0}
      />
    </>
  );
}

/** Read-only project cards (after today's update is posted): stored status and dates, to-dos, calls. */
export async function ProjectOverview({ supabase }: { supabase: SupabaseClient }) {
  const [{ data: projects }, side] = await Promise.all([
    supabase.from("projects").select("id, name, type, header").eq("active", true).order("sort_order"),
    loadProjectSide(supabase),
  ]);
  return (
    <div className="flex flex-col gap-4">
      {((projects ?? []) as { id: string; name: string; type: ProjectType; header: ProjectHeader }[]).map((p) => {
        const s = side[p.id] ?? { todos: [], laterCount: 0, calls: [] };
        return (
          <Card key={p.id} className="gap-3">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Link href={`/meetings/brief?project=${p.id}`} className="text-primary hover:underline">Brief</Link>
                  <Link href={`/settings/projects/${p.id}`} className="hover:underline">Settings</Link>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {HEADER_FIELDS[p.type].map((f) => {
                  const v = p.header?.[f.key];
                  return `${f.label}: ${f.kind === "date" ? (v ? formatHeaderDate(v) : "—") : v || "—"}`;
                }).join(" · ")}
              </p>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <TodoMini projectId={p.id} initial={s.todos} laterCount={s.laterCount} />
              <CallsMini calls={s.calls} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
