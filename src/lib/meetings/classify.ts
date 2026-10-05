// Meeting classification (Section 5 "Meeting rules"). Pure.

export type MeetingType = "client_call" | "standup" | "ignore" | "unassigned";
export type Rule = { project_id: string; meeting_type: Exclude<MeetingType, "unassigned">; match_kind: "title_keyword" | "attendee_domain" | "recurring_event_id"; match_value: string };
export type MeetingFacts = { title: string | null; attendeeEmails: string[]; recurringEventId: string | null };

/** First matching rule wins; recurring-event rules are checked first (most specific). */
export function classifyMeeting(m: MeetingFacts, rules: Rule[]): { project_id: string | null; type: MeetingType } {
  const order = { recurring_event_id: 0, title_keyword: 1, attendee_domain: 2 } as const;
  const sorted = [...rules].sort((a, b) => order[a.match_kind] - order[b.match_kind]);
  const title = (m.title ?? "").toLowerCase();
  const domains = new Set(m.attendeeEmails.map((e) => e.toLowerCase().split("@")[1]).filter(Boolean));
  for (const r of sorted) {
    const v = r.match_value.trim().toLowerCase();
    if (!v) continue;
    const hit =
      (r.match_kind === "recurring_event_id" && m.recurringEventId?.toLowerCase() === v) ||
      (r.match_kind === "title_keyword" && title.includes(v)) ||
      (r.match_kind === "attendee_domain" && domains.has(v.replace(/^@/, "")));
    if (hit) return { project_id: r.project_id, type: r.meeting_type };
  }
  return { project_id: null, type: "unassigned" };
}
