import { describe, expect, it } from "vitest";
import { containsKeyword, isBlocker, parseEod, slackToPlain } from "./parse";

describe("slackToPlain", () => {
  it("converts mentions, links and formatting", () => {
    expect(slackToPlain("*Hi* <@U123|Asha> see <https://x.com/a|the doc> `code`")).toBe("Hi @Asha see the doc code");
  });
});

describe("containsKeyword", () => {
  it("is case-insensitive and whole-word", () => {
    expect(containsKeyword("EoD Update: done", "EOD")).toBe(true);
    expect(containsKeyword("*EOD Update:*", "EOD")).toBe(true);
    expect(containsKeyword("geode fixes", "EOD")).toBe(false);
  });
});

describe("parseEod", () => {
  it("bold heading with mention, bullet lines", () => {
    const raw = "*EOD Update: <@U1|Priya>*\n• Went through the payment bugs.\n• Reviewed the docs\n• Fixed a few bugs ";
    expect(parseEod(raw)).toEqual(["Went through the payment bugs.", "Reviewed the docs", "Fixed a few bugs"]);
  });

  it("heading that is itself bulleted", () => {
    const raw = "• *EOD Update: <@U1|Priya>*\n• Added the *Start* button.\n• Fixed redirects.";
    expect(parseEod(raw)).toEqual(["Added the Start button.", "Fixed redirects."]);
  });

  it("dated headings, two days in one message", () => {
    const raw = "EoD Update 29 Sept :<@U1|Priya>\n• Removed refund\n• TKT-122\nEoD Update 30 Sept :<@U1|Priya>\n• TKT-80\n";
    expect(parseEod(raw)).toEqual(["Removed refund", "TKT-122", "TKT-80"]);
  });

  it("numbered list", () => {
    expect(parseEod("EoD Update: <@U1|P>\n1. Admin Overview\n2. Resolve issues in Review")).toEqual(["Admin Overview", "Resolve issues in Review"]);
  });

  it("double markers '• -' are stripped", () => {
    expect(parseEod("EoD Update:\n• - identify pricing\n• bug fixes")).toEqual(["identify pricing", "bug fixes"]);
  });

  it("lead-in line before bullets", () => {
    expect(parseEod("EoD Update: <@U1|P>\nFixed these bugs\n• TKT-68\n• TKT-67")).toEqual(["Fixed these bugs: TKT-68", "Fixed these bugs: TKT-67"]);
  });

  it("no bullet lines → each line is a bullet", () => {
    expect(parseEod("EOD Update:\n\nWorked on promo codes.\nWorked on saving cards.")).toEqual(["Worked on promo codes.", "Worked on saving cards."]);
  });

  it("single paragraph → one bullet", () => {
    expect(parseEod("EOD: finished the checkout page and fixed login")).toEqual(["finished the checkout page and fixed login"]);
  });

  it("indented sub-bullets fold into the parent", () => {
    const raw = "EOD Update:\n\n• Library — completed\n  • PNG only\n  • Confirm before activating\n• Fixed totals";
    expect(parseEod(raw)).toEqual(["Library — completed (PNG only; Confirm before activating)", "Fixed totals"]);
  });

  it("dash bullets with nested dashes", () => {
    const raw = "EOD Update:\n\n- Batch steps — completed\n  - Purchase labels\n- Activity logs — in progress";
    expect(parseEod(raw)).toEqual(["Batch steps — completed (Purchase labels)", "Activity logs — in progress"]);
  });

  it("unmarked lines after a bullet continue it", () => {
    const raw = "*EOD Update:*\n• Worked on the *Landing Page*:\nAdded the waitlist CTA.\n• WIP: contacts";
    expect(parseEod(raw)).toEqual(["Worked on the Landing Page: Added the waitlist CTA.", "WIP: contacts"]);
  });

  it("first bullet indented: sub-bullets still fold correctly", () => {
    const raw = "EOD Update *Friday*:\n\n  • Card form opens directly\n• Import — completed\n  • Handles blank rows\n  • Sample added\n• Filter is a dropdown";
    expect(parseEod(raw)).toEqual(["Card form opens directly", "Import — completed (Handles blank rows; Sample added)", "Filter is a dropdown"]);
  });

  it("custom keyword", () => {
    expect(parseEod("Daily: \n- a\n- b", "Daily")).toEqual(["a", "b"]);
  });
});

describe("isBlocker", () => {
  it("matches blocker keywords as words", () => {
    const k = ["blocked", "waiting on", "issue"];
    expect(isBlocker("Waiting on API keys from client", k)).toBe(true);
    expect(isBlocker("Resolved issues in admin", k)).toBe(false);
    expect(isBlocker("Fixed an issue", k)).toBe(true);
  });
});
