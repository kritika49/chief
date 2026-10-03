import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readJson } from "@/lib/format";

const BASE = "https://api.fathom.ai/external/v1";

export type FathomCredentials = { api_key: string; webhook_secret?: string; fathom_webhook_id?: string };

export class FathomError extends Error {}

async function fathom<T extends z.ZodTypeAny>(
  apiKey: string,
  path: string,
  schema: T,
  init: { method?: string; body?: unknown } = {},
): Promise<z.infer<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new FathomError("Fathom didn't accept that API key. Copy it again from Fathom → Settings → API Access.");
  if (res.status === 429) throw new FathomError("Fathom is busy (too many requests). Try again in a minute.");
  if (!res.ok) throw new FathomError(`Fathom returned an error (${res.status}). Try again in a moment.`);
  if (res.status === 204) return schema.parse({});
  return schema.parse(await readJson(res, "Fathom"));
}

// ---- Meeting payload (same shape for list items and the webhook) ----------

const person = z.object({ name: z.string().nullish(), email: z.string().nullish() }).passthrough();

export const fathomMeeting = z.object({
  recording_id: z.union([z.number(), z.string()]).transform(String),
  title: z.string().nullish(),
  meeting_title: z.string().nullish(),
  url: z.string().nullish(),
  share_url: z.string().nullish(),
  created_at: z.string().nullish(),
  scheduled_start_time: z.string().nullish(),
  recording_start_time: z.string().nullish(),
  calendar_invitees: z
    .array(person.extend({ is_external: z.boolean().nullish(), email_domain: z.string().nullish() }))
    .nullish(),
  recorded_by: person.nullish(),
  default_summary: z.object({ template_name: z.string().nullish(), markdown_formatted: z.string().nullish() }).passthrough().nullish(),
  transcript: z
    .array(z.object({ speaker: z.object({ display_name: z.string().nullish() }).passthrough().nullish(), text: z.string(), timestamp: z.string().nullish() }).passthrough())
    .nullish(),
  action_items: z
    .array(z.object({ description: z.string(), completed: z.boolean().nullish(), assignee: person.nullish(), recording_playback_url: z.string().nullish() }).passthrough())
    .nullish(),
}).passthrough();
export type FathomMeeting = z.infer<typeof fathomMeeting>;

export function meetingTitle(m: FathomMeeting) {
  return m.meeting_title || m.title || "Untitled meeting";
}

export function transcriptText(m: FathomMeeting): string | null {
  if (!m.transcript?.length) return null;
  return m.transcript
    .map((t) => `${t.timestamp ? `[${t.timestamp}] ` : ""}${t.speaker?.display_name ?? "Speaker"}: ${t.text}`)
    .join("\n");
}

// ---- API calls -------------------------------------------------------------

/** Validates a key; returns the most recent meeting (if any). */
export async function testApiKey(apiKey: string) {
  const r = await fathom(apiKey, "/meetings", z.object({ items: z.array(fathomMeeting).default([]) }).passthrough());
  return { latest: r.items[0] ?? null };
}

export async function getSummary(apiKey: string, recordingId: string) {
  const r = await fathom(apiKey, `/recordings/${recordingId}/summary`, z.object({ summary: z.object({ markdown_formatted: z.string().nullish() }).passthrough().nullish() }).passthrough());
  return r.summary?.markdown_formatted ?? null;
}

export async function getTranscript(apiKey: string, recordingId: string) {
  const r = await fathom(apiKey, `/recordings/${recordingId}/transcript`, z.object({ transcript: fathomMeeting.shape.transcript }).passthrough());
  return r.transcript ?? null;
}

/** Registers Chief's webhook with Fathom; Fathom returns the signing secret. */
export async function createWebhook(apiKey: string, destinationUrl: string) {
  return fathom(
    apiKey,
    "/webhooks",
    z.object({ id: z.union([z.string(), z.number()]).transform(String), secret: z.string() }).passthrough(),
    {
      method: "POST",
      body: {
        destination_url: destinationUrl,
        triggered_for: ["my_recordings"],
        include_transcript: true,
        include_summary: true,
        include_action_items: true,
        include_crm_matches: false,
      },
    },
  );
}

export async function deleteWebhook(apiKey: string, webhookId: string) {
  try {
    await fathom(apiKey, `/webhooks/${webhookId}`, z.any(), { method: "DELETE" });
  } catch {
    // Already gone or key revoked: nothing to clean up.
  }
}

// ---- Webhook signature (Standard Webhooks) --------------------------------

/**
 * Verifies `webhook-signature` = "v1,<base64 HMAC-SHA256>" (space-separated list)
 * over `${webhook-id}.${webhook-timestamp}.${body}`, keyed with the base64 part
 * of the `whsec_...` secret. Rejects timestamps more than 5 minutes off.
 */
export function verifyFathomSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
