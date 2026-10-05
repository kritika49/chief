import { describe, expect, it } from "vitest";
import { memberBullets, replaceMemberBullets, ruleBasedAssembler, type DraftBullet } from "./assemble";

const members = [
  { personId: "n", name: "Nileshwar", tracking: "slack_scan" as const },
  { personId: "m", name: "Manju", tracking: "slack_scan" as const },
  { personId: "s", name: "Shourya", tracking: "manual_entry" as const },
  { personId: "x", name: "Ghost", tracking: "none" as const },
];

describe("ruleBasedAssembler", () => {
  it("orders sections per spec and prefixes names", () => {
    const out = ruleBasedAssembler.assemble({
      members,
      eods: { n: [{ text: "EOD Update:\n• Worked on settings\n• Fixed dashboard", keyword: "EOD", url: "https://slack/x" }] },
      manualEntries: { s: "Updated the logo\n- Shared icons" },
      doneTodos: [{ id: "t1", text: "Sent the timeline to the client" }],
      callPoints: [{ id: "c1", text: "Client approved the design" }],
      standupLines: [],
      pinned: [{ id: "p1", text: "QA is ongoing." }, { id: "p2", text: "qa is ongoing" }],
    });
    expect(out.map((b) => b.text)).toEqual([
      "Nileshwar worked on settings.",
      "Nileshwar fixed dashboard.",
      "Manju's update is awaited.",
      "Shourya updated the logo.",
      "Shourya shared icons.",
      "Sent the timeline to the client.",
      "Client approved the design.",
      "QA is ongoing.",
    ]);
    expect(out[0].source_url).toBe("https://slack/x");
  });
});

describe("replaceMemberBullets", () => {
  it("swaps 'awaited' for pasted EOD in place, keeping PM edits", () => {
    const current: DraftBullet[] = [
      { text: "Nileshwar: A.", source: "eod", source_ref: "n" },
      { text: "Manju's update is awaited.", source: "missing_eod", source_ref: "m" },
      { text: "My own note.", source: "free_text" },
      { text: "QA is ongoing.", source: "pinned", source_ref: "p1" },
    ];
    const next = memberBullets(members[1], [{ text: "EOD:\n• Fixed payments\n• Reviewed Stripe", keyword: "EOD" }], undefined);
    expect(replaceMemberBullets(current, "m", next).map((b) => b.text)).toEqual([
      "Nileshwar: A.",
      "Manju fixed payments.",
      "Manju reviewed Stripe.",
      "My own note.",
      "QA is ongoing.",
    ]);
  });

  it("empty paste puts 'awaited' back", () => {
    const next = memberBullets(members[1], [], undefined);
    expect(next).toEqual([{ text: "Manju's update is awaited.", source: "missing_eod", source_ref: "m" }]);
  });
});
