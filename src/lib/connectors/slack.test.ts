import { describe, expect, it } from "vitest";
import { postAsName } from "./slack";

describe("postAsName", () => {
  it("uses the first name", () => {
    expect(postAsName("Kritika Sharma")).toBe("Kritika's Chief");
    expect(postAsName("James")).toBe("James' Chief");
    expect(postAsName("")).toBe("Chief");
  });
});
