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
