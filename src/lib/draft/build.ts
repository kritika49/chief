import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIn } from "@/lib/dates";
import { toPastTense } from "@/lib/draft/sentence";
import { ruleBasedAssembler, type DraftBullet, type EodInput, type MemberInput } from "@/lib/draft/assemble";
import { slackConfigured } from "@/lib/connectors/slack";
import { scanProjectEods, windowStart, type UnknownAuthor } from "@/lib/eod/scan";
import { runMatching } from "@/lib/matching/run";
import type { TrackingMode } from "@/lib/types";

// Draft building shared by the Draft page (user client, RLS) and the scheduler
// (admin client). Every query filters by userId and every insert sets user_id.

type MemberJoin = { tracking_mode: TrackingMode; person: { id: string; name: string } };

export async function projectMembers(db: SupabaseClient, userId: string, projectId: string): Promise<MemberInput[]> {
  const { data } = await db.from("project_members").select("tracking_mode, person:people(id, name)").eq("user_id", userId).eq("project_id", projectId);
  return ((data ?? []) as unknown as MemberJoin[]).map((m) => ({ personId: m.person.id, name: m.person.name, tracking: m.tracking_mode }));
}

export async function replaceProjectBullets(db: SupabaseClient, userId: string, draftId: string, projectId: string, bullets: DraftBullet[]) {
  await db.from("draft_bullets").delete().eq("user_id", userId).eq("draft_id", draftId).eq("project_id", projectId);
  if (bullets.length) {
    await db.from("draft_bullets").insert(
      bullets.map((b, i) => ({
        user_id: userId, draft_id: draftId, project_id: projectId, text: b.text, position: i,
        source: b.source, source_ref: b.source_ref ?? null, source_url: b.source_url ?? null,
      })),
    );
  }
}

/** Non-EOD sources for a project: done to-dos, accepted call points, standup lines, pinned lines. */
export async function projectSources(db: SupabaseClient, userId: string, projectId: string, appUrl: string) {
  const [{ data: todos }, { data: meetings }, { data: pinned }] = await Promise.all([
    db.from("todos").select("id, text").eq("user_id", userId).eq("project_id", projectId).eq("list", "done").is("included_in_posted_update_id", null).is("archived_at", null).order("done_at"),
    db.from("meetings").select("id, type").eq("user_id", userId).eq("project_id", projectId).eq("status", "reviewed").in("type", ["client_call", "standup"]).is("included_in_posted_update_id", null),
    db.from("pinned_lines").select("id, text").eq("user_id", userId).eq("project_id", projectId).eq("active", true).order("sort_order").order("created_at"),
  ]);
  const meetingIds = (meetings ?? []).map((m) => m.id);
  const { data: items } = meetingIds.length
    ? await db.from("meeting_items").select("id, meeting_id, text, kind").eq("user_id", userId).in("meeting_id", meetingIds).eq("status", "accepted").in("kind", ["key_point", "decision"]).order("position")
    : { data: [] as { id: string; meeting_id: string; text: string; kind: string }[] };
  const typeOf = new Map((meetings ?? []).map((m) => [m.id, m.type]));
  const link = (meetingId: string) => `${appUrl}/meetings/${meetingId}`;
  return {
    doneTodos: (todos ?? []).map((t) => ({ id: t.id, text: toPastTense(t.text) })),
    callPoints: (items ?? []).filter((i) => typeOf.get(i.meeting_id) === "client_call").map((i) => ({ id: i.id, text: i.text, url: link(i.meeting_id) })),
    standupLines: (items ?? []).filter((i) => typeOf.get(i.meeting_id) === "standup").map((i) => ({ id: i.id, text: i.text, url: link(i.meeting_id) })),
    pinned: pinned ?? [],
  };
}

export type CreateDraftResult = { ok: boolean; message: string; draftId?: string; created?: boolean };

/** Creates today's draft for all active projects (or returns the open one). */
export async function createDraftFor(db: SupabaseClient, userId: string, appUrl: string): Promise<CreateDraftResult> {
  const { data: open } = await db.from("drafts").select("id").eq("user_id", userId).eq("status", "draft").maybeSingle();
  if (open) return { ok: true, message: "Your draft is ready.", draftId: open.id, created: false };

  const [{ data: prefs }, { data: lastPost }, { data: projects }] = await Promise.all([
    db.from("preferences").select("timezone, blocker_keywords, match_high_threshold, match_medium_threshold").eq("user_id", userId).maybeSingle(),
    db.from("posted_updates").select("posted_at").eq("user_id", userId).order("posted_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("projects").select("id, type, header").eq("user_id", userId).eq("active", true).order("sort_order"),
  ]);
  if (!projects?.length) return { ok: false, message: "Add a project first (Settings → Projects)." };

  const { data: draft, error } = await db
    .from("drafts")
    .insert({ user_id: userId, for_date: todayIn(prefs?.timezone), since: lastPost?.posted_at ?? null, header_snapshot: Object.fromEntries(projects.map((p) => [p.id, p.header])) })
    .select("id")
    .single();
  if (error || !draft) return { ok: false, message: "Couldn't start the draft. Please try again." };

  const unknown: UnknownAuthor[] = [];
  const errors: string[] = [];
  const oldest = windowStart(lastPost?.posted_at, Date.now(), prefs?.timezone);
  for (const p of projects) {
    let eods: Record<string, EodInput[]> = {};
    if (p.type === "dev" && slackConfigured()) {
      const r = await scanProjectEods(db, userId, p.id, oldest, prefs?.blocker_keywords ?? undefined).catch((e) => ({
        eods: {}, unknown: [], errors: [e instanceof Error ? e.message : "Couldn't read Slack."],
      }));
      eods = r.eods;
      unknown.push(...r.unknown);
      errors.push(...r.errors);
    }
    const [members, sources] = await Promise.all([projectMembers(db, userId, p.id), projectSources(db, userId, p.id, appUrl)]);
    const bullets = ruleBasedAssembler.assemble({ members, eods, manualEntries: {}, ...sources });
    await replaceProjectBullets(db, userId, draft.id, p.id, bullets);
  }
  if (slackConfigured()) await saveScanMeta(db, userId, draft.id, unknown, errors);
  await runMatching(db, userId, prefs ?? undefined).catch(() => {});
  return {
    ok: true,
    draftId: draft.id,
    created: true,
    message: errors.length ? `Draft started, but some channels couldn't be read: ${errors.join("; ")}` : "Draft started.",
  };
}

export type ScanMeta = { at: string; unknown: UnknownAuthor[]; errors: string[] };

export async function saveScanMeta(db: SupabaseClient, userId: string, draftId: string, unknown: UnknownAuthor[], errors: string[]) {
  const { data } = await db.from("drafts").select("manual_entries").eq("user_id", userId).eq("id", draftId).single();
  const entries = { ...(data?.manual_entries ?? {}), _scan: { at: new Date().toISOString(), unknown, errors } satisfies ScanMeta };
  await db.from("drafts").update({ manual_entries: entries }).eq("user_id", userId).eq("id", draftId);
}

/** After posting: save history, close the draft, archive included to-dos and call notes. */
export async function finishPosting(db: SupabaseClient, userId: string, draftId: string, text: string, channelIds: string[], ts: Record<string, string>) {
  const { data: posted } = await db
    .from("posted_updates")
    .insert({ user_id: userId, draft_id: draftId, text, slack_channel_ids: channelIds, slack_ts: ts })
    .select("id")
    .single();
  await db.from("drafts").update({ status: "posted" }).eq("user_id", userId).eq("id", draftId);
  if (!posted) return;
  const { data: bullets } = await db.from("draft_bullets").select("source, source_ref").eq("user_id", userId).eq("draft_id", draftId);
  const todoIds = (bullets ?? []).filter((b) => b.source === "todo" && b.source_ref).map((b) => b.source_ref as string);
  const itemIds = (bullets ?? []).filter((b) => (b.source === "client_call" || b.source === "standup") && b.source_ref).map((b) => b.source_ref as string);
  const now = new Date().toISOString();
  if (todoIds.length) await db.from("todos").update({ included_in_posted_update_id: posted.id, archived_at: now }).eq("user_id", userId).in("id", todoIds);
  if (itemIds.length) {
    const { data: items } = await db.from("meeting_items").select("meeting_id").eq("user_id", userId).in("id", itemIds);
    const meetingIds = [...new Set((items ?? []).map((i) => i.meeting_id))];
    if (meetingIds.length) await db.from("meetings").update({ included_in_posted_update_id: posted.id }).eq("user_id", userId).in("id", meetingIds);
  }
}
