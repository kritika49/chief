import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyMeeting, type Rule } from "./classify";
import { dMon, matchPerson, standupMessage, summaryLines, type PersonLite } from "./text";
import { findCalendarEvent } from "@/lib/connectors/google";
import { postAsName, postMessage, slackConfigured } from "@/lib/connectors/slack";

export async function loadPeople(db: SupabaseClient, userId: string): Promise<(PersonLite & { slack_user_id: string | null })[]> {
  const { data } = await db.from("people").select("id, name, email, slack_user_id, aliases:person_aliases(alias)").eq("user_id", userId);
  return ((data ?? []) as unknown as { id: string; name: string; email: string | null; slack_user_id: string | null; aliases: { alias: string }[] }[]).map((p) => ({
    id: p.id, name: p.name, email: p.email, slack_user_id: p.slack_user_id, aliases: p.aliases.map((a) => a.alias),
  }));
}

type Raw = {
  action_items?: { description: string; assignee?: { name?: string | null; email?: string | null } | null }[] | null;
  calendar_invitees?: { email?: string | null }[] | null;
};

/**
 * After a meeting arrives (webhook or manual notes): match it to a calendar event,
 * classify it with the project rules, and create its review items (summary lines
 * and action items, all pending). Standups on projects with auto-post ON are posted.
 */
export async function ingestMeeting(db: SupabaseClient, userId: string, meetingId: string) {
  const { data: m } = await db.from("meetings").select("*").eq("user_id", userId).eq("id", meetingId).single();
  if (!m) return;
  const raw = (m.raw ?? {}) as Raw;

  // Calendar match (best effort) for recurring-event rules and attendee emails.
  let recurringEventId: string | null = m.recurring_event_id;
  let calendarEventId: string | null = m.calendar_event_id;
  let attendeeEmails = (raw.calendar_invitees ?? []).map((i) => i.email ?? "").filter(Boolean);
  if (m.started_at && !m.is_manual) {
    const { data: g } = await db.from("connections").select("status").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (g?.status === "connected") {
      const ev = await findCalendarEvent(userId, m.started_at, m.title).catch(() => null);
      if (ev) {
        calendarEventId = ev.id;
        recurringEventId = ev.recurringEventId ?? null;
        if (!attendeeEmails.length) attendeeEmails = (ev.attendees ?? []).map((a) => a.email ?? "").filter(Boolean);
      }
    }
  }

  let projectId: string | null = m.project_id;
  let type = m.type as string;
  if (!projectId || type === "unassigned") {
    const { data: rules } = await db.from("call_rules").select("project_id, meeting_type, match_kind, match_value").eq("user_id", userId);
    const c = classifyMeeting({ title: m.title, attendeeEmails, recurringEventId }, (rules ?? []) as Rule[]);
    projectId = c.project_id;
    type = c.type;
  }
  await db
    .from("meetings")
    .update({ project_id: projectId, type, calendar_event_id: calendarEventId, recurring_event_id: recurringEventId, status: type === "ignore" ? "dismissed" : m.status })
    .eq("user_id", userId)
    .eq("id", meetingId);

  // Review items (only once).
  const { count } = await db.from("meeting_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("meeting_id", meetingId);
  if (!count) {
    const people = await loadPeople(db, userId);
    const lines = summaryLines(m.summary);
    const actions = raw.action_items ?? [];
    const rows = [
      ...lines.map((text, i) => ({
        user_id: userId, meeting_id: meetingId, kind: "key_point", text, position: i,
        owner_person_id: null, owner_name: null, destinations: [] as string[],
      })),
      ...actions.map((a, i) => {
        const owner = matchPerson(a.assignee, people);
        return {
          user_id: userId, meeting_id: meetingId, kind: "action", text: a.description, position: 1000 + i,
          owner_person_id: owner?.id ?? null, owner_name: owner?.name ?? a.assignee?.name ?? null,
          destinations: type === "standup" ? ["slack"] : ["todo"],
        };
      }),
    ];
    if (rows.length) {
      const { error } = await db.from("meeting_items").insert(rows);
      if (error) throw new Error(`Couldn't save the meeting's review items: ${error.message}`);
    }
  }

  if (type === "standup" && projectId) {
    const { data: p } = await db.from("projects").select("auto_post_standup").eq("user_id", userId).eq("id", projectId).single();
    if (p?.auto_post_standup) await postStandupTasks(db, userId, meetingId).catch(() => {});
  }
}

/**
 * Posts ONE message with a meeting's accepted standup tasks (destination slack)
 * to the project's primary channel, and records them as open tasks.
 * Items still pending are treated as accepted (used by auto-post).
 */
export async function postStandupTasks(db: SupabaseClient, userId: string, meetingId: string): Promise<{ ok: boolean; message: string }> {
  const { data: m } = await db.from("meetings").select("id, project_id, started_at, title").eq("user_id", userId).eq("id", meetingId).single();
  if (!m?.project_id) return { ok: false, message: "Choose the project first." };
  const [{ data: items }, { data: channel }, { data: prefs }, { data: profile }, people] = await Promise.all([
    db.from("meeting_items").select("*").eq("user_id", userId).eq("meeting_id", meetingId).eq("kind", "action").neq("status", "dismissed").order("position"),
    db.from("channels").select("slack_channel_id").eq("user_id", userId).eq("project_id", m.project_id).eq("active", true).order("is_primary", { ascending: false }).limit(1).maybeSingle(),
    db.from("preferences").select("timezone").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    loadPeople(db, userId),
  ]);
  const tasks = (items ?? []).filter((i) => (i.destinations ?? []).includes("slack") || (i.destinations ?? []).includes("todo"));
  if (!tasks.length) return { ok: false, message: "No tasks to post." };

  const slackTasks = tasks.filter((i) => (i.destinations ?? []).includes("slack"));
  let ts: string | null = null;
  if (slackTasks.length) {
    if (!slackConfigured()) return { ok: false, message: "The Slack app isn't set up yet." };
    if (!channel) return { ok: false, message: "This project has no Slack channel yet (Settings → Projects)." };
    const byId = new Map(people.map((p) => [p.id, p]));
    const text = standupMessage(
      dMon(m.started_at ?? new Date().toISOString(), prefs?.timezone),
      slackTasks.map((t) => ({ slackUserId: t.owner_person_id ? byId.get(t.owner_person_id)?.slack_user_id ?? null : null, name: t.owner_name, text: t.text, due: t.due_date })),
    );
    ts = (await postMessage(channel.slack_channel_id, text, { username: postAsName(profile?.full_name) })).ts;
  }

  for (const t of tasks) {
    const dest: string[] = t.destinations ?? [];
    if (dest.includes("slack")) {
      await db.from("action_items").insert({
        user_id: userId, project_id: m.project_id, meeting_id: meetingId, assignee_person_id: t.owner_person_id, assignee_raw: t.owner_name,
        text: t.text, due_date: t.due_date, status: "open", source: "standup", slack_ts: ts,
      });
    }
    if (dest.includes("todo")) {
      await db.from("todos").insert({ user_id: userId, project_id: m.project_id, text: t.text, list: "later", source: "standup", meeting_id: meetingId });
    }
    await db.from("meeting_items").update({ status: "accepted" }).eq("user_id", userId).eq("id", t.id);
  }
  await db.from("meetings").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("user_id", userId).eq("id", meetingId);
  return { ok: true, message: slackTasks.length ? `Posted ${slackTasks.length} task${slackTasks.length === 1 ? "" : "s"} to Slack.` : "Saved." };
}
