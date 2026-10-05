import { describe, expect, it } from "vitest";
import { toPersonSentence as s } from "./sentence";

describe("toPersonSentence", () => {
  it("past-tense starts become sentences", () => {
    expect(s("Shlok", "Worked on card rotation across batches.")).toBe("Shlok worked on card rotation across batches");
    expect(s("Manju", "Fixed a few bugs ")).toBe("Manju fixed a few bugs");
    expect(s("Manju", "Went through the payment bugs")).toBe("Manju went through the payment bugs");
    expect(s("Manju", "Reviewed the Stripe documentation")).toBe("Manju reviewed the Stripe documentation");
  });
  it("base-form verbs become past tense", () => {
    expect(s("Nileshwar", "Resolve Issues in Admin Payout")).toBe("Nileshwar resolved Issues in Admin Payout");
    expect(s("Nileshwar", "Implement performer verification")).toBe("Nileshwar implemented performer verification");
  });
  it("work in progress", () => {
    expect(s("Shlok", "WIP: Account deletion and restoration")).toBe("Shlok is working on account deletion and restoration");
    expect(s("Shlok", "In progress - Contact support flow")).toBe("Shlok is working on contact support flow");
  });
  it("keeps the name prefix when there's no action word", () => {
    expect(s("Nileshwar", "BLE-155, BLE-156 is done")).toBe("Nileshwar: BLE-155, BLE-156 is done");
    expect(s("Shlok", "EasyPost unlocked batch purchases")).toBe("Shlok: EasyPost unlocked batch purchases");
    expect(s("Manju", "bug fixing")).toBe("Manju: bug fixing");
    expect(s("Manju", "Speed improvements")).toBe("Manju: Speed improvements");
  });
});

import { toPastTense } from "./sentence";

describe("toPastTense", () => {
  it("turns a to-do into an update line", () => {
    expect(toPastTense("Share revised timeline with Patrick")).toBe("Shared revised timeline with Patrick");
    expect(toPastTense("Send updated timeline (call 5 Oct)")).toBe("Sent updated timeline");
    expect(toPastTense("follow up with EasyPost on batch purchase")).toBe("followed up with EasyPost on batch purchase");
    expect(toPastTense("Onboard Satya for Dontbelated QA")).toBe("Onboarded Satya for Dontbelated QA");
    expect(toPastTense("Give KT to Satya")).toBe("Gave KT to Satya");
    expect(toPastTense("To schedule Corey's check-in for Tuesday")).toBe("Scheduled Corey's check-in for Tuesday");
  });
  it("leaves past tense and unknown starts alone", () => {
    expect(toPastTense("Updated the prototype with Tanay's assets")).toBe("Updated the prototype with Tanay's assets");
    expect(toPastTense("Patrick's attorney feedback on SaaS wording")).toBe("Patrick's attorney feedback on SaaS wording");
    expect(toPastTense("QA kickoff")).toBe("QA kickoff");
  });
});
