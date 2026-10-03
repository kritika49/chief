import { describe, expect, it } from "vitest";
import { cleanBullets, DIVIDER, formatDMon, normalizeBullet, renderUpdate } from "./format";

describe("format helpers", () => {
  it("formats dates as D Mon", () => {
    expect(formatDMon("2026-10-09")).toBe("9 Oct");
    expect(formatDMon(null)).toBe("—");
  });

  it("normalises bullets", () => {
    expect(normalizeBullet("  • QA is ongoing ")).toBe("QA is ongoing.");
    expect(normalizeBullet("Done!")).toBe("Done!");
    expect(normalizeBullet("Library (PNG only)")).toBe("Library (PNG only).");
  });

  it("de-duplicates", () => {
    expect(cleanBullets(["QA is ongoing", "QA is ongoing.", "", "Other"])).toEqual(["QA is ongoing.", "Other."]);
  });
});

describe("renderUpdate", () => {
  it("matches the spec template", () => {
    const text = renderUpdate([
      {
        name: "Bles",
        type: "dev",
        header: { planned_vs_actual: "On Track, Dev Ongoing", dev_completion: "2026-10-12", launch: "2026-10-21" },
        bullets: ["Nileshwar worked on settings", "Manju's update is awaited.", "QA is ongoing."],
      },
      {
        name: "Italica",
        type: "design_pm",
        header: { status: "Initial Design Phase", design_started: "2026-09-14" },
        bullets: ["Updated the prototype with the image assets shared by Tanay"],
      },
    ]);
    expect(text).toBe(
      [
        "Bles",
        "Planned vs Actual: On Track, Dev Ongoing",
        "Dev Completion: 12 Oct",
        "Launch: 21 Oct",
        "Key Updates:",
        "• Nileshwar worked on settings.",
        "• Manju's update is awaited.",
        "• QA is ongoing.",
        DIVIDER,
        "Italica",
        "Status: Initial Design Phase",
        "Design Started: 14 Sep",
        "Key Updates:",
        "• Updated the prototype with the image assets shared by Tanay.",
      ].join("\n"),
    );
  });
});
