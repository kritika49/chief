import { describe, expect, it } from "vitest";
import { projectSection } from "./brief";

describe("projectSection", () => {
  const text = "Bles\nPlanned vs Actual: On Track\nKey Updates:\n• A happened.\n• B happened.\n--------------------------------------------------\nItalica\nStatus: x\nKey Updates:\n• C.";
  it("extracts one project's key updates", () => {
    expect(projectSection(text, "Bles")).toEqual(["A happened.", "B happened."]);
    expect(projectSection(text, "italica")).toEqual(["C."]);
    expect(projectSection(text, "Nope")).toEqual([]);
  });
  it("also handles long-dash dividers", () => {
    expect(projectSection("Bles\nKey Updates:\n• A.\n——————————————————————\nX\nKey Updates:\n• Y.", "X")).toEqual(["Y."]);
  });
});
