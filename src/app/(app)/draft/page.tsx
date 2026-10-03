import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/action-form";
import { slackConfigured } from "@/lib/connectors/slack";
import { todayIn } from "@/lib/dates";
import { formatDMon } from "@/lib/draft/format";
import type { DraftBullet } from "@/lib/draft/assemble";
import type { Project, TrackingMode } from "@/lib/types";
import { createDraft, type ScanMeta } from "./actions";
import { DraftEditor, SlackBar, type EditorProject } from "./draft-editor";

export const metadata = { title: "Draft · Chief" };

type MemberJoin = { project_id: string; tracking_mode: TrackingMode; person: { id: string; name: string } };

export default async function DraftPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: draft }, { data: prefs }, { count: projectCount }] = await Promise.all([
    supabase.from("drafts").select("id, for_date, manual_entries, updated_at").eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("preferences").select("timezone, target_channel_ids").eq("user_id", user.id).maybeSingle(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  if (!draft) {
    const { data: lastPost } = await supabase.from("posted_updates").select("posted_at").order("posted_at", { ascending: false }).limit(1).maybeSingle();
    const postedToday = lastPost ? todayIn(prefs?.timezone, new Date(lastPost.posted_at)) === todayIn(prefs?.timezone) : false;
    return (
      <>
        <PageHeader title="Draft & Post" description="Review, edit and post your daily project update." />
        {(projectCount ?? 0) === 0 ? (
          <EmptyState
            icon={FileText}
            title="Add a project first"
            description="Your daily update is built from your projects. Add one (or load your starter projects), then come back to start a draft."
            action={<Button asChild><Link href="/settings/projects">Go to Projects</Link></Button>}
          />
        ) : postedToday ? (
          <EmptyState
            icon={CheckCircle2}
            title="Today's update is posted"
            description="It's saved in your update history. You can start another draft if you need to post a correction."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline"><Link href="/history">View in History</Link></Button>
                <ActionForm action={createDraft} label="Start a new draft" variant="ghost" />
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="No draft open"
            description="Start today's draft: Chief lists each project with its status line, pinned lines and whose EOD is still awaited. Paste EODs, edit, then copy or post. Nothing is posted without you."
            action={<ActionForm action={createDraft} label="Start today's draft" pendingLabel="Assembling…" />}
          />
        )}
      </>
    );
  }

  const [{ data: projects }, { data: bullets }, { data: members }, { data: channels }] = await Promise.all([
    supabase.from("projects").select("id, name, type, header, sort_order, active").eq("active", true).order("sort_order"),
    supabase.from("draft_bullets").select("project_id, text, source, source_ref, source_url, position").eq("draft_id", draft.id).order("position"),
    supabase.from("project_members").select("project_id, tracking_mode, person:people(id, name)"),
    supabase.from("channels").select("project_id, eod_keyword, is_primary").eq("active", true),
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
      <PageHeader title="Draft & Post" description={`Update for ${formatDMon(draft.for_date)}. Edit anything — nothing is posted until you say so.`} />
      {slackConfigured() && (
        <SlackBar draftId={draft.id} scan={scanMeta ?? { at: "", unknown: [], errors: [] }} projectNames={Object.fromEntries(editorProjects.map((p) => [p.id, p.name]))} />
      )}
      <DraftEditor
        key={draft.updated_at}
        draftId={draft.id}
        today={todayIn(prefs?.timezone)}
        projects={editorProjects}
        canPost={slackConfigured() && (prefs?.target_channel_ids?.length ?? 0) > 0}
      />
    </>
  );
}
