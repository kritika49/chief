import { describe, expect, it } from "vitest";
import { isDueNow, localNow } from "./clock";

describe("clock", () => {
  it("local time in a timezone", () => {
    const n = localNow("Asia/Kolkata", new Date(Date.UTC(2026, 9, 5, 2, 5))); // 07:35 IST Mon
    expect(n).toMatchObject({ date: "2026-10-05", time: "07:35", weekday: 1 });
  });
  it("due window", () => {
    const n = localNow("Asia/Kolkata", new Date(Date.UTC(2026, 9, 5, 2, 5)));
    expect(isDueNow(n, "07:30")).toBe(true);
    expect(isDueNow(n, "07:40")).toBe(false);
    expect(isDueNow(n, "03:00")).toBe(false); // more than 3h ago
  });
});
