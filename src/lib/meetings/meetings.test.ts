import { describe, expect, it } from "vitest";
import { classifyMeeting, type Rule } from "./classify";
import { matchPerson, minutesText, standupMessage, summaryLines } from "./text";

const rules: Rule[] = [
  { project_id: "bles", meeting_type: "client_call", match_kind: "attendee_domain", match_value: "bles.com" },
  { project_id: "bles", meeting_type: "standup", match_kind: "title_keyword", match_value: "standup" },
  { project_id: "dbl", meeting_type: "client_call", match_kind: "recurring_event_id", match_value: "abc123" },
];

describe("classifyMeeting", () => {
  it("matches by title, domain, recurring id", () => {
    expect(classifyMeeting({ title: "Bles Daily Standup", attendeeEmails: [], recurringEventId: null }, rules)).toEqual({ project_id: "bles", type: "standup" });
    expect(classifyMeeting({ title: "Weekly", attendeeEmails: ["patrick@bles.com"], recurringEventId: null }, rules)).toEqual({ project_id: "bles", type: "client_call" });
    expect(classifyMeeting({ title: "Standup", attendeeEmails: [], recurringEventId: "abc123" }, rules)).toEqual({ project_id: "dbl", type: "client_call" });
  });
  it("unmatched → unassigned", () => {
    expect(classifyMeeting({ title: "Random", attendeeEmails: ["x@y.com"], recurringEventId: null }, rules)).toEqual({ project_id: null, type: "unassigned" });
  });
});

describe("summaryLines", () => {
  it("splits markdown into clean lines", () => {
    const md = "## Key Takeaways\n- **Maintenance plan** agreed with [PostHog](https://posthog.com) dashboard\n- Split payouts later\n\n### Next Steps\n1. Share video";
    expect(summaryLines(md)).toEqual(["Maintenance plan agreed with PostHog dashboard", "Split payouts later", "Share video"]);
  });
});

describe("matchPerson", () => {
  const people = [
    { id: "1", name: "Nileshwar", email: "nileshwar@byldd.com", aliases: ["Nilesh"] },
    { id: "2", name: "Manju Bhuvan", email: null, aliases: [] },
  ];
  it("by email, alias, first name", () => {
    expect(matchPerson({ email: "NILESHWAR@byldd.com" }, people)?.id).toBe("1");
    expect(matchPerson({ name: "Nilesh" }, people)?.id).toBe("1");
    expect(matchPerson({ name: "Manju" }, people)?.id).toBe("2");
    expect(matchPerson({ name: "Tanay" }, people)).toBeNull();
  });
});

describe("standupMessage", () => {
  it("formats per spec", () => {
    expect(standupMessage("5 Oct", [
      { slackUserId: "U1", name: "A", text: "Fix login.", due: null },
      { slackUserId: null, name: "Tanay", text: "Send assets", due: "2026-10-07" },
    ])).toBe("Standup tasks — 5 Oct\n• <@U1> Fix login\n• Tanay: Send assets (due 7 Oct)");
  });
});

describe("minutesText", () => {
  it("includes sections that have content", () => {
    const t = minutesText({ project: "Bles", title: "Weekly", date: "5 Oct", greeting: "Hi all,", signoff: "Best regards,", senderName: "Kritika", points: ["A"], decisions: [], actions: [{ text: "Send timeline", owner: "Kritika", due: "2026-10-07" }], nextCall: null });
    expect(t).toContain("Key points:\n• A");
    expect(t).not.toContain("Decisions:");
    expect(t).toContain("• Send timeline — Kritika (by 7 Oct)");
  });
});
