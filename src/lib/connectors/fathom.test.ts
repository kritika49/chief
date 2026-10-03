import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { fathomMeeting, transcriptText, verifyFathomSignature } from "./fathom";

const secret = "whsec_" + Buffer.from("super-secret-key-material").toString("base64");
function sign(id: string, ts: string, body: string) {
  const key = Buffer.from(secret.slice(6), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
}

describe("verifyFathomSignature", () => {
  const body = JSON.stringify({ recording_id: 1 });
  const now = 1_800_000_000;
  const ts = String(now);

  it("accepts a valid signature (also within a list)", () => {
    expect(verifyFathomSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
    expect(verifyFathomSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });

  it("rejects wrong body, missing headers and old timestamps", () => {
    expect(verifyFathomSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body + " ", now)).toBe(false);
    expect(verifyFathomSignature(secret, { id: null, timestamp: ts, signature: "v1,x" }, body, now)).toBe(false);
    expect(verifyFathomSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now + 301)).toBe(false);
  });
});

describe("fathomMeeting", () => {
  it("parses a webhook payload and formats the transcript", () => {
    const m = fathomMeeting.parse({
      recording_id: 123,
      meeting_title: "Bles weekly",
      calendar_invitees: [{ name: "Tanay", email: "t@client.com", is_external: true }],
      transcript: [{ speaker: { display_name: "Kritika" }, text: "Hi", timestamp: "00:00:01" }],
      action_items: [{ description: "Send prototype", assignee: { name: "Kritika" } }],
      extra_field: "ignored",
    });
    expect(m.recording_id).toBe("123");
    expect(transcriptText(m)).toBe("[00:00:01] Kritika: Hi");
  });
});
