"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ingestMeeting, postStandupTasks } from "@/lib/meetings/ingest";
import { buildMinutes } from "@/lib/meetings/minutes";
import { dMon } from "@/lib/meetings/text";
import { saveGmailDraft } from "@/lib/connectors/google";
import { postAsName, postMessage, slackConfigured } from "@/lib/connectors/slack";

type Result = { ok: boolean; message: string; link?: string };
const uuid = z.string().uuid();
const meetingType = z.enum(["client_call", "standup", "ignore"]);

function refresh(id?: string) {
  revalidatePath("/meetings");
  if (id) revalidatePath(`/meetings/${id}`);
  revalidatePath("/today");
  revalidatePath("/todos");
  revalidatePath("/tracker");
  revalidatePath("/decisions");
}

function msg(e: unknown, fallback: string) {
  return e instanceof Error && e.message && e.message !== "fetch failed" ? e.message : fallback;
}

/** Sets a meeting's project + type; optionally saves a rule so future ones sort themselves. */
export async function assignMeeting(meetingId: string, projectId: string, type: string, rule?: { kind: "title_keyword" | "attendee_domain"; value: string } | null): Promise<Result> {
  const user = await requireUser();
  const supabase = await createClient();
  const t = meetingType.parse(type);
  const pid = t === "ignore" && !projectId ? null : uuid.parse(projectId);
  await supabase.from("meetings").update({ project_id: pid, type: t, status: t === "ignore" ? "dismissed" : "new" }).eq("id", uuid.parse(meetingId));
  if (rule?.value.trim() && pid) {
    await supabase.from("call_rules").insert({ project_id: pid, meeting_type: t, match_kind: rule.kind, match_value: rule.value.trim().toLowerCase() });
  }
  // Standup items default to Slack, client-call items to To-do.
  await supabase.from("meeting_items").update({ destinations: t === "standup" ? ["slack"] : ["todo"] }).eq("meeting_id", meetingId).eq("kind", "action").eq("status", "pending");
  await ingestMeeting(supabase, user.id, meetingId).catch(() => {});
  refresh(meetingId);
  return { ok: true, message: rule?.value ? "Saved, and future meetings like this will be sorted automatically." : "Saved." };
}

/** Manual notes for a call that wasn't recorded. */
export async function addManualMeeting(_: unknown, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const type = meetingType.safeParse(formData.get("type"));
  const notes = String(formData.get("notes") ?? "").trim();
  const actions = String(formData.get("actions") ?? "").split(/\r?\n/).map((l) => l.replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, "").trim()).filter(Boolean);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !type.success || !uuid.safeParse(projectId).success) {
    return { ok: false, message: "Fill in the title, date, project and type." };
  }
  if (!notes && !actions.length) return { ok: false, message: "Add some notes or action items." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      title, started_at: new Date(`${date}T12:00:00Z`).toISOString(), project_id: projectId, type: type.data, is_manual: true,
      summary: notes, raw: { action_items: actions.map((description) => ({ description })) },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't save the notes." };
  await ingestMeeting(supabase, user.id, data.id);
  refresh(data.id);
  redirect(`/meetings/${data.id}`);
}

const reviewItem = z.object({
  id: uuid,
  text: z.string().trim().min(1).max(2000),
  kind: z.enum(["key_point", "action"]),
  include: z.boolean().default(false), // key points: into next update / minutes
  decision: z.boolean().default(false),
  dest: z.enum(["todo", "followup", "both", "dismiss", "slack", "slack_todo"]).optional(),
  owner_person_id: uuid.nullish(),
  owner_name: z.string().trim().max(120).nullish(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal("")),
});
export type ReviewItem = z.infer<typeof reviewItem>;

/** Saves a client-call review: key points, decisions, and routed action items. */
export async function saveClientReview(meetingId: string, raw: ReviewItem[]): Promise<Result> {
  const user = await requireUser();
  const items = z.array(reviewItem).max(300).parse(raw);
  const supabase = await createClient();
  const { data: m } = await supabase.from("meetings").select("id, project_id, started_at, created_at").eq("id", uuid.parse(meetingId)).single();
  if (!m?.project_id) return { ok: false, message: "Choose the project first." };
  const { data: prefs } = await supabase.from("preferences").select("timezone, auto_gmail_draft").eq("user_id", user.id).maybeSingle();
  const { data: before } = await supabase.from("meeting_items").select("id, status").eq("meeting_id", meetingId);
  const wasPending = new Set((before ?? []).filter((b) => b.status === "pending").map((b) => b.id));
  const callDate = dMon(m.started_at ?? m.created_at, prefs?.timezone);
  const decidedOn = (m.started_at ?? m.created_at).slice(0, 10);

  for (const it of items) {
    const due = it.due_date || null;
    if (it.kind === "key_point") {
      const accepted = it.include || it.decision;
      await supabase.from("meeting_items").update({ text: it.text, is_decision: it.decision, status: accepted ? "accepted" : "dismissed" }).eq("id", it.id).eq("meeting_id", meetingId);
      if (it.decision && wasPending.has(it.id)) {
        await supabase.from("decisions").insert({ project_id: m.project_id, meeting_id: meetingId, text: it.text, decided_on: decidedOn });
      }
      continue;
    }
    const dest = it.dest ?? "todo";
    const dests = dest === "both" ? ["todo", "followup"] : dest === "dismiss" ? [] : [dest];
    await supabase
      .from("meeting_items")
      .update({ text: it.text, destinations: dests, owner_person_id: it.owner_person_id ?? null, owner_name: it.owner_name ?? null, due_date: due, status: dest === "dismiss" ? "dismissed" : "accepted" })
      .eq("id", it.id)
      .eq("meeting_id", meetingId);
    if (!wasPending.has(it.id)) continue; // don't create duplicates on re-save
    if (dests.includes("todo")) {
      await supabase.from("todos").insert({ project_id: m.project_id, text: `${it.text} (call ${callDate})`, list: "later", source: "client_call", meeting_id: meetingId });
    }
    if (dests.includes("followup")) {
      await supabase.from("followups").insert({ project_id: m.project_id, meeting_id: meetingId, text: it.text, owner_person_id: it.owner_person_id ?? null, owner_name: it.owner_name ?? null, due_date: due });
    }
  }
  await supabase.from("meetings").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", meetingId);

  let extra = "";
  if (prefs?.auto_gmail_draft !== false) {
    const { data: g } = await supabase.from("connections").select("status").eq("provider", "google").maybeSingle();
    if (g?.status === "connected") {
      const r = await createMinutesDraft(meetingId, null, null);
      extra = r.ok ? " A Gmail draft of the minutes is ready." : ` (Gmail draft not created: ${r.message})`;
    }
  }
  refresh(meetingId);
  return { ok: true, message: `Review saved.${extra}` };
}

/** Saves a standup review, then posts ONE task message to the project's primary channel. */
export async function saveStandupReview(meetingId: string, raw: ReviewItem[], post: boolean): Promise<Result> {
  const user = await requireUser();
  const items = z.array(reviewItem).max(300).parse(raw);
  const supabase = await createClient();
  for (const it of items) {
    if (it.kind === "key_point") {
      await supabase.from("meeting_items").update({ text: it.text, status: it.include ? "accepted" : "dismissed" }).eq("id", it.id).eq("meeting_id", meetingId);
      continue;
    }
    const dest = it.dest ?? "slack";
    const dests = dest === "slack_todo" ? ["slack", "todo"] : dest === "dismiss" ? [] : [dest];
    await supabase
      .from("meeting_items")
      .update({ text: it.text, destinations: dests, owner_person_id: it.owner_person_id ?? null, owner_name: it.owner_name ?? null, due_date: it.due_date || null, status: dest === "dismiss" ? "dismissed" : "pending" })
      .eq("id", it.id)
      .eq("meeting_id", meetingId);
  }
  if (!post) {
    refresh(meetingId);
    return { ok: true, message: "Saved. Click Post when you're ready." };
  }
  try {
    const r = await postStandupTasks(supabase, user.id, meetingId);
    refresh(meetingId);
    return r;
  } catch (e) {
    return { ok: false, message: msg(e, "Couldn't post to Slack.") };
  }
}

export async function createMinutesDraft(meetingId: string, to: string[] | null, cc: string[] | null): Promise<Result> {
  const user = await requireUser();
  const supabase = await createClient();
  const mins = await buildMinutes(supabase, user.id, uuid.parse(meetingId));
  if (!mins) return { ok: false, message: "Meeting not found." };
  const emails = z.array(z.string().trim().email());
  const toList = to ? emails.safeParse(to) : { success: true as const, data: mins.externalEmails };
  const ccList = cc ? emails.safeParse(cc) : { success: true as const, data: mins.cc };
  if (!toList.success || !ccList.success) return { ok: false, message: "One of the email addresses doesn't look right." };
  const { data: existing } = await supabase.from("email_drafts").select("gmail_draft_id").eq("meeting_id", meetingId).maybeSingle();
  try {
    const d = await saveGmailDraft(user.id, { to: toList.data, cc: ccList.data, subject: mins.subject, text: mins.text, html: mins.html }, existing?.gmail_draft_id);
    await supabase.from("email_drafts").upsert({ meeting_id: meetingId, gmail_draft_id: d.id, subject: mins.subject, to_emails: toList.data, cc_emails: ccList.data }, { onConflict: "meeting_id" });
    refresh(meetingId);
    return { ok: true, message: existing ? "Gmail draft updated." : "Gmail draft created.", link: gmailLink(d.messageId) };
  } catch (e) {
    return { ok: false, message: msg(e, "Couldn't reach Gmail.") };
  }
}

function gmailLink(messageId: string) {
  return messageId ? `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}` : "https://mail.google.com/mail/u/0/#drafts";
}

export async function postMinutesToSlack(meetingId: string, channelId: string): Promise<Result> {
  const user = await requireUser();
  if (!slackConfigured()) return { ok: false, message: "The Slack app isn't set up yet." };
  if (!/^[CG][A-Z0-9]+$/.test(channelId)) return { ok: false, message: "Choose a channel." };
  const supabase = await createClient();
  const mins = await buildMinutes(supabase, user.id, uuid.parse(meetingId));
  if (!mins) return { ok: false, message: "Meeting not found." };
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const body = [`*${mins.subject}*`, ...mins.text.split("\n").slice(2, -2)].join("\n").trim();
  try {
    await postMessage(channelId, body, { username: postAsName(profile?.full_name) });
    return { ok: true, message: "Minutes posted to Slack." };
  } catch (e) {
    return { ok: false, message: msg(e, "Couldn't post to Slack.") };
  }
}

export async function dismissMeeting(meetingId: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("meetings").update({ status: "dismissed", type: "ignore" }).eq("id", uuid.parse(meetingId));
  refresh(meetingId);
  return { ok: true, message: "Dismissed." };
}
