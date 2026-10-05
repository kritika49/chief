import { describe, expect, it } from "vitest";
import { windowStart } from "./scan";

describe("windowStart", () => {
  const now = Date.UTC(2026, 9, 3, 12);
  it("uses the last posted update", () => {
    expect(windowStart("2026-10-02T09:00:00Z", now)).toBe((Date.UTC(2026, 9, 2, 9) / 1000).toFixed(6));
  });
  it("never looks back more than 4 days", () => {
    expect(windowStart("2026-09-01T00:00:00Z", now)).toBe(((now - 4 * 86400000) / 1000).toFixed(6));
  });
  it("nothing posted yet: from the previous working day (Monday → Friday, IST)", () => {
    const mondayIst = Date.UTC(2026, 9, 5, 3, 30); // Mon 5 Oct 09:00 IST
    const fridayMidnightIst = Date.UTC(2026, 9, 1, 18, 30); // Fri 2 Oct 00:00 IST
    expect(windowStart(null, mondayIst, "Asia/Kolkata")).toBe((fridayMidnightIst / 1000).toFixed(6));
  });
  it("nothing posted yet midweek: from yesterday", () => {
    const wedIst = Date.UTC(2026, 9, 7, 3, 30); // Wed 7 Oct 09:00 IST
    expect(windowStart(null, wedIst, "Asia/Kolkata")).toBe((Date.UTC(2026, 9, 5, 18, 30) / 1000).toFixed(6));
  });
});
