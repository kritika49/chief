import { describe, expect, it } from "vitest";
import { matchScore } from "./score";

describe("matchScore", () => {
  it("high for the same work", () => {
    expect(matchScore("Fix the Stripe payout bug", "Fixed the Stripe payout bug in admin")).toBeGreaterThanOrEqual(0.6);
    expect(matchScore("Complete BLE-155", "BLE-155, BLE-156 is done")).toBeGreaterThanOrEqual(0.6);
  });
  it("medium for partial overlap", () => {
    const s = matchScore("Build account settings for Performer and Organizer", "Account Settings for Performer in progress");
    expect(s).toBeGreaterThanOrEqual(0.3);
  });
  it("low for unrelated work", () => {
    expect(matchScore("Add pagination to bookings", "Reviewed the Stripe documentation")).toBeLessThan(0.3);
  });
});
