import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findNextCall } from "@/lib/connectors/google";
import { dMon, minutesHtml, minutesSubject, minutesText, type MinutesInput } from "./text";

/** Collects a reviewed call's accepted points, decisions and action items. */
export async function buildMinutes(db: SupabaseClient, userId: string, meetingId: string): Promise<{ input: MinutesInput; subject: string; text: string; html: string; externalEmails: string[]; cc: string[] } | null> {
  const { data: m } = await db.from("meetings").select("*, project:projects(name, email_cc)").eq("user_id", userId).eq("id", meetingId).single();
  if (!m) return null;
  const [{ data: items }, { data: prefs }, { data: profile }, { data: google }] = await Promise.all([
    db.from("meeting_items").select("*").eq("user_id", userId).eq("meeting_id", meetingId).eq("status", "accepted").order("position"),
    db.from("preferences").select("timezone, email_greeting, email_signoff").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    db.from("connections").select("status").eq("user_id", userId).eq("provider", "google").maybeSingle(),
  ]);
  const date = dMon(m.started_at ?? m.created_at, prefs?.timezone);
  let nextCall: string | null = m.next_call_at ? dMon(m.next_call_at, prefs?.timezone) : null;
  if (!nextCall && google?.status === "connected" && m.started_at) {
    const ev = await findNextCall(userId, new Date(m.started_at), m.recurring_event_id, m.title).catch(() => null);
    const when = ev?.start?.dateTime ?? ev?.start?.date;
    if (when) nextCall = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: ev?.start?.dateTime ? "2-digit" : undefined, minute: ev?.start?.dateTime ? "2-digit" : undefined, timeZone: prefs?.timezone ?? undefined }).format(new Date(when));
  }
  const input: MinutesInput = {
    project: m.project?.name ?? "Project",
    title: m.title ?? "Call",
    date,
    greeting: prefs?.email_greeting ?? "Hi all,",
    signoff: prefs?.email_signoff ?? "Best regards,",
    senderName: (profile?.full_name ?? "").split(" ")[0] || "",
    points: (items ?? []).filter((i) => i.kind === "key_point" && !i.is_decision).map((i) => i.text),
    decisions: (items ?? []).filter((i) => i.kind === "key_point" && i.is_decision).map((i) => i.text),
    actions: (items ?? []).filter((i) => i.kind === "action").map((i) => ({ text: i.text, owner: i.owner_name, due: i.due_date })),
    nextCall,
  };
  const attendees = (m.attendees ?? []) as { email?: string; is_external?: boolean }[];
  return {
    input,
    subject: minutesSubject(input.project, date),
    text: minutesText(input),
    html: minutesHtml(input),
    externalEmails: attendees.filter((a) => a.is_external && a.email).map((a) => a.email!),
    cc: (m.project?.email_cc ?? []) as string[],
  };
}
