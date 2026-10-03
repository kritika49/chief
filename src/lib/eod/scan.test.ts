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
  it("defaults to 48 hours", () => {
    expect(windowStart(null, now)).toBe(((now - 48 * 3600000) / 1000).toFixed(6));
  });
});
