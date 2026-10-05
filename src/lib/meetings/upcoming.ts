import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listEvents } from "@/lib/connectors/google";
import { classifyMeeting, type Rule } from "./classify";

export type UpcomingCall = { eventId: string; title: string; start: string; projectId: string; projectName: string; attendees: string[]; recurringEventId: string | null };

/** Client calls on the PM's watched calendars in the next `hours`, classified by the project rules. */
export async function upcomingClientCalls(db: SupabaseClient, userId: string, hours: number): Promise<UpcomingCall[]> {
  const [{ data: g }, { data: prefs }, { data: rules }, { data: projects }] = await Promise.all([
    db.from("connections").select("status, settings").eq("user_id", userId).eq("provider", "google").maybeSingle(),
    db.from("preferences").select("watched_calendar_ids").eq("user_id", userId).maybeSingle(),
    db.from("call_rules").select("project_id, meeting_type, match_kind, match_value").eq("user_id", userId),
    db.from("projects").select("id, name, active").eq("user_id", userId),
  ]);
  if (g?.status !== "connected" || !rules?.length) return [];
  const calendars = ((g.settings as { calendars?: string[] })?.calendars ?? prefs?.watched_calendar_ids ?? ["primary"]) as string[];
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600000);
  const out: UpcomingCall[] = [];
  const seen = new Set<string>();
  for (const cal of calendars.slice(0, 5)) {
    const events = await listEvents(userId, cal, now, until).catch(() => []);
    for (const e of events) {
      const start = e.start?.dateTime;
      if (!start || seen.has(e.id)) continue;
      const attendees = (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean);
      const c = classifyMeeting({ title: e.summary ?? null, attendeeEmails: attendees, recurringEventId: e.recurringEventId ?? null }, (rules ?? []) as Rule[]);
      const project = projects?.find((p) => p.id === c.project_id && p.active);
      if (c.type !== "client_call" || !project) continue;
      seen.add(e.id);
      out.push({ eventId: e.id, title: e.summary ?? "Client call", start, projectId: project.id, projectName: project.name, attendees, recurringEventId: e.recurringEventId ?? null });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
