import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { buildMinutes } from "@/lib/meetings/minutes";
import { slackConfigured } from "@/lib/connectors/slack";
import { MeetingReview, type ReviewData } from "./review";

export const metadata = { title: "Meeting · Chief" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data: m } = await supabase.from("meetings").select("*, project:projects(id, name)").eq("id", id).maybeSingle();
  if (!m) notFound();

  const [{ data: items }, { data: projects }, { data: people }, { data: channels }, { data: prefs }, { data: emailDraft }, { data: google }] = await Promise.all([
    supabase.from("meeting_items").select("*").eq("meeting_id", id).order("position"),
    supabase.from("projects").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("people").select("id, name, slack_user_id").order("name"),
    supabase.from("channels").select("slack_channel_id, slack_channel_name, project_id").eq("active", true),
    supabase.from("preferences").select("timezone, target_channel_ids").eq("user_id", user.id).maybeSingle(),
    supabase.from("email_drafts").select("gmail_draft_id, to_emails, cc_emails").eq("meeting_id", id).maybeSingle(),
    supabase.from("connections").select("status").eq("provider", "google").maybeSingle(),
  ]);
  const minutes = m.status === "reviewed" && m.type === "client_call" ? await buildMinutes(supabase, user.id, id).catch(() => null) : null;
  const attendees = (m.attendees ?? []) as { name?: string; email?: string; is_external?: boolean }[];
  const externalDomain = attendees.find((a) => a.is_external && a.email)?.email?.split("@")[1] ?? "";

  const data: ReviewData = {
    meeting: { id: m.id, title: m.title, type: m.type, status: m.status, projectId: m.project?.id ?? null, transcript: m.transcript, summary: m.summary },
    items: (items ?? []).map((i) => ({
      id: i.id, kind: i.kind, text: i.text, status: i.status, is_decision: i.is_decision, destinations: i.destinations ?? [],
      owner_person_id: i.owner_person_id, owner_name: i.owner_name, due_date: i.due_date,
    })),
    projects: projects ?? [],
    people: people ?? [],
    channels: [
      ...(channels ?? []).map((c) => ({ id: c.slack_channel_id, name: c.slack_channel_name ?? c.slack_channel_id })),
      ...((prefs?.target_channel_ids ?? []) as string[]).map((cid) => ({ id: cid, name: "Your update channel" })),
    ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i),
    ruleHint: { title: (m.title ?? "").toLowerCase().split(/\s+/).slice(0, 3).join(" "), domain: externalDomain },
    minutes: minutes ? { text: minutes.text, to: emailDraft?.to_emails ?? minutes.externalEmails, cc: emailDraft?.cc_emails ?? minutes.cc, hasDraft: !!emailDraft } : null,
    googleConnected: google?.status === "connected",
    slackConfigured: slackConfigured(),
  };

  return (
    <>
      <Link href="/meetings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Meetings
      </Link>
      <PageHeader
        title={m.title ?? "Untitled meeting"}
        description={`${formatDateTime(m.started_at, prefs?.timezone)}${m.project ? ` · ${m.project.name}` : ""}${attendees.length ? ` · ${attendees.map((a) => a.name || a.email).filter(Boolean).slice(0, 5).join(", ")}` : ""}`}
        actions={m.fathom_url ? (
          <a href={m.fathom_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Open in Fathom <ExternalLink className="size-3.5" />
          </a>
        ) : undefined}
      />
      <div className="mb-4 flex gap-2">
        <Badge variant="outline">{m.type === "client_call" ? "Client call" : m.type === "standup" ? "Standup" : m.type === "ignore" ? "Ignored" : "Unassigned"}</Badge>
        {m.status === "reviewed" && <Badge variant="success">Reviewed</Badge>}
        {m.is_manual && <Badge variant="secondary">Your notes</Badge>}
      </div>
      <MeetingReview data={data} />
    </>
  );
}
