"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";
import { memberBullets, replaceMemberBullets, ruleBasedAssembler, type DraftBullet } from "@/lib/draft/assemble";
import { postMessage, slackConfigured } from "@/lib/connectors/slack";
import { logHeaderChanges } from "@/lib/header-history";
import type { ProjectHeader, TrackingMode } from "@/lib/types";

type Result = { ok: boolean; message: string };

const bulletSchema = z.object({
  text: z.string().max(2000),
  source: z.enum(["eod", "missing_eod", "manual_entry", "todo", "client_call", "standup", "pinned", "free_text"]),
  source_ref: z.string().nullish(),
  source_url: z.string().nullish(),
});

type MemberJoin = { tracking_mode: TrackingMode; person: { id: string; name: string } };

async function projectMembers(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_members").select("tracking_mode, person:people(id, name)").eq("project_id", projectId);
  return ((data ?? []) as unknown as MemberJoin[]).map((m) => ({ personId: m.person.id, name: m.person.name, tracking: m.tracking_mode }));
}

async function replaceProjectBullets(draftId: string, projectId: string, bullets: DraftBullet[]) {
  const supabase = await createClient();
  await supabase.from("draft_bullets").delete().eq("draft_id", draftId).eq("project_id", projectId);
  if (bullets.length) {
    await supabase.from("draft_bullets").insert(
      bullets.map((b, i) => ({ draft_id: draftId, project_id: projectId, text: b.text, position: i, source: b.source, source_ref: b.source_ref ?? null, source_url: b.source_url ?? null })),
    );
  }
}

/** Creates today's draft for all active projects (or returns the open one). */
export async function createDraft(): Promise<Result> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: open } = await supabase.from("drafts").select("id").eq("status", "draft").maybeSingle();
  if (open) return { ok: true, message: "Your draft is ready." };

  const { data: prefs } = await supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle();
  const { data: lastPost } = await supabase.from("posted_updates").select("posted_at").order("posted_at", { ascending: false }).limit(1).maybeSingle();
  const { data: projects } = await supabase.from("projects").select("id, header").eq("active", true).order("sort_order");
  if (!projects?.length) return { ok: false, message: "Add a project first (Settings → Projects)." };

  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({ for_date: todayIn(prefs?.timezone), since: lastPost?.posted_at ?? null, header_snapshot: Object.fromEntries(projects.map((p) => [p.id, p.header])) })
    .select("id")
    .single();
  if (error || !draft) return { ok: false, message: "Couldn't start the draft. Please try again." };

  for (const p of projects) {
    const [members, { data: pinned }] = await Promise.all([
      projectMembers(p.id),
      supabase.from("pinned_lines").select("id, text").eq("project_id", p.id).eq("active", true).order("created_at"),
    ]);
    // Slack EODs (Phase 7) and to-dos / call notes (later phases) plug in here.
    const bullets = ruleBasedAssembler.assemble({ members, eods: {}, manualEntries: {}, doneTodos: [], callPoints: [], standupLines: [], pinned: pinned ?? [] });
    await replaceProjectBullets(draft.id, p.id, bullets);
  }
  revalidatePath("/draft");
  revalidatePath("/today");
  return { ok: true, message: "Draft started." };
}

/** Saves a pasted EOD (slack_scan member) or typed update (manual_entry member). */
export async function saveMemberText(draftId: string, projectId: string, personId: string, text: string, keyword: string, current: DraftBullet[]) {
  await requireUser();
  const supabase = await createClient();
  const { data: draft } = await supabase.from("drafts").select("id, manual_entries").eq("id", draftId).eq("status", "draft").single();
  if (!draft) return { ok: false as const, message: "This draft is no longer open." };
  const member = (await projectMembers(projectId)).find((m) => m.personId === personId);
  if (!member) return { ok: false as const, message: "That person isn't on this project." };

  const entries = (draft.manual_entries ?? {}) as Record<string, Record<string, string>>;
  entries[projectId] = { ...(entries[projectId] ?? {}), [personId]: text };
  await supabase.from("drafts").update({ manual_entries: entries }).eq("id", draftId);

  const next = member.tracking === "slack_scan" ? memberBullets(member, text.trim() ? [{ text, keyword }] : [], undefined) : memberBullets(member, undefined, text);
  const bullets = replaceMemberBullets(z.array(bulletSchema).parse(current), personId, next);
  await replaceProjectBullets(draftId, projectId, bullets);
  return { ok: true as const, bullets };
}

/** Saves the PM's edited bullet list for one project. */
export async function saveProjectBullets(draftId: string, projectId: string, bullets: DraftBullet[]): Promise<Result> {
  await requireUser();
  const parsed = z.array(bulletSchema).max(200).safeParse(bullets);
  if (!parsed.success) return { ok: false, message: "Couldn't save those bullets." };
  const supabase = await createClient();
  const { data: draft } = await supabase.from("drafts").select("id").eq("id", draftId).eq("status", "draft").maybeSingle();
  if (!draft) return { ok: false, message: "This draft is no longer open." };
  await replaceProjectBullets(draftId, projectId, parsed.data.filter((b) => b.text.trim()));
  return { ok: true, message: "Saved." };
}

export async function pinBullet(projectId: string, text: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("pinned_lines").insert({ project_id: projectId, text: text.trim() }).select("id").single();
  if (error || !data) return { ok: false, message: "Couldn't pin that line." };
  return { ok: true, message: data.id };
}

export async function saveHeaderField(projectId: string, field: keyof ProjectHeader, value: string): Promise<Result> {
  await requireUser();
  if (!["planned_vs_actual", "dev_completion", "launch", "status", "design_started"].includes(field)) return { ok: false, message: "Unknown field." };
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("header").eq("id", projectId).single();
  if (!p) return { ok: false, message: "Project not found." };
  const oldH = (p.header ?? {}) as ProjectHeader;
  const newH = { ...oldH, [field]: value.trim() };
  await supabase.from("projects").update({ header: newH }).eq("id", projectId);
  await logHeaderChanges(projectId, oldH, newH);
  return { ok: true, message: "Saved." };
}

async function finishPosting(draftId: string, text: string, channelIds: string[], ts: Record<string, string>) {
  const supabase = await createClient();
  await supabase.from("posted_updates").insert({ draft_id: draftId, text, slack_channel_ids: channelIds, slack_ts: ts });
  await supabase.from("drafts").update({ status: "posted" }).eq("id", draftId);
  revalidatePath("/draft");
  revalidatePath("/history");
  revalidatePath("/today");
}

/** For when the PM copied the text and posted it in Slack themselves. */
export async function markPosted(draftId: string, text: string): Promise<Result> {
  await requireUser();
  if (!text.trim()) return { ok: false, message: "The update is empty." };
  await finishPosting(draftId, text, [], {});
  return { ok: true, message: "Saved to your update history." };
}

/** Approve & Post: sends the update to the PM's target channel(s). */
export async function postToSlack(draftId: string, text: string): Promise<Result> {
  const user = await requireUser();
  if (!slackConfigured()) return { ok: false, message: "The Slack app isn't set up yet — copy the update and post it yourself, then click “I posted it”." };
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("preferences").select("target_channel_ids").eq("user_id", user.id).single();
  const channels = (prefs?.target_channel_ids ?? []) as string[];
  if (!channels.length) return { ok: false, message: "Choose where your update goes first (Settings → Preferences)." };
  const ts: Record<string, string> = {};
  try {
    for (const c of channels) ts[c] = (await postMessage(c, text)).ts;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't post to Slack." };
  }
  await finishPosting(draftId, text, channels, ts);
  return { ok: true, message: "Posted to Slack." };
}

export async function discardDraft(draftId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("drafts").update({ status: "discarded" }).eq("id", draftId);
  revalidatePath("/draft");
  revalidatePath("/today");
  return { ok: true, message: "Draft discarded." };
}
