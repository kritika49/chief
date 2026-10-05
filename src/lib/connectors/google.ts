import "server-only";
import { z } from "zod";
import { readJson } from "@/lib/format";
import { env } from "@/lib/env";
import { getCredentials, markNeedsAttention, markSynced } from "./store";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export function googleConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID;
  return Boolean(id && !id.startsWith("PASTE_") && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(origin: string) {
  return `${origin}/api/connect/google/callback`;
}

export function googleAuthUrl(origin: string, state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

export async function exchangeCode(origin: string, code: string) {
  const res = await fetch(`${process.env.GOOGLE_OAUTH_BASE ?? "https://oauth2.googleapis.com"}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const json = (await readJson(res, "Google")) as Record<string, string>;
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Google didn't accept the sign-in.");
  return tokenResponse.parse(json);
}

/** Email inside a Google id_token (already verified by Google's token endpoint over TLS). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export type GoogleCredentials = { refresh_token: string };

export class GoogleAuthError extends Error {}

/** Gets a fresh access token for a user, marking the connection if it was revoked. */
export async function getAccessToken(userId: string): Promise<string> {
  const creds = await getCredentials<GoogleCredentials>(userId, "google");
  if (!creds?.refresh_token) throw new GoogleAuthError("Google isn't connected.");
  const res = await fetch(`${process.env.GOOGLE_OAUTH_BASE ?? "https://oauth2.googleapis.com"}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await readJson(res, "Google")) as Record<string, string>;
  if (!res.ok) {
    const msg =
      json.error === "invalid_grant"
        ? "Google access was removed or expired. Click Reconnect."
        : `Google said: ${json.error_description ?? json.error}`;
    await markNeedsAttention(userId, "google", msg);
    throw new GoogleAuthError(msg);
  }
  return tokenResponse.parse(json).access_token;
}

async function googleGet<T extends z.ZodTypeAny>(userId: string, url: string, schema: T): Promise<z.infer<T>> {
  const token = await getAccessToken(userId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = (await readJson(res, "Google")) as { error?: { message?: string } };
  if (!res.ok) {
    const reason = json.error?.message ?? res.statusText;
    if (res.status === 403 && /has not been used|is disabled/i.test(reason)) {
      throw new Error("The Google Calendar or Gmail API isn't switched on in Google Cloud yet (see SETUP_GUIDE.md).");
    }
    throw new Error(`Google said: ${reason}`);
  }
  return schema.parse(json);
}

const calendarListSchema = z.object({
  items: z.array(z.object({ id: z.string(), summary: z.string(), primary: z.boolean().optional(), accessRole: z.string().optional() }).passthrough()).default([]),
});
export type GoogleCalendar = z.infer<typeof calendarListSchema>["items"][number];

export async function listCalendars(userId: string): Promise<GoogleCalendar[]> {
  const r = await googleGet(userId, `${process.env.GOOGLE_CALENDAR_BASE ?? "https://www.googleapis.com"}/calendar/v3/users/me/calendarList?maxResults=250`, calendarListSchema);
  return r.items.sort((a, b) => Number(b.primary ?? false) - Number(a.primary ?? false) || a.summary.localeCompare(b.summary));
}

const eventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  recurringEventId: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
  end: z.object({ dateTime: z.string().optional(), date: z.string().optional() }).optional(),
  attendees: z.array(z.object({ email: z.string().optional(), displayName: z.string().optional(), self: z.boolean().optional() }).passthrough()).optional(),
  status: z.string().optional(),
}).passthrough();
export type CalendarEvent = z.infer<typeof eventSchema>;

export async function listEvents(userId: string, calendarId: string, timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const r = await googleGet(
    userId,
    `${process.env.GOOGLE_CALENDAR_BASE ?? "https://www.googleapis.com"}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    z.object({ items: z.array(eventSchema).default([]) }),
  );
  return r.items.filter((e) => e.status !== "cancelled");
}

/** Connection test: reads calendars, today's events, and the Gmail profile. */
export async function testGoogle(userId: string) {
  const calendars = await listCalendars(userId);
  const now = new Date();
  const dayEnd = new Date(now.getTime() + 24 * 3600 * 1000);
  const events = await listEvents(userId, "primary", now, dayEnd);
  const gmail = await googleGet(userId, `${process.env.GOOGLE_API_BASE ?? "https://gmail.googleapis.com"}/gmail/v1/users/me/profile`, z.object({ emailAddress: z.string() }));
  await markSynced(userId, "google");
  return { calendars: calendars.length, upcomingEvents: events.length, gmail: gmail.emailAddress };
}

/** Finds the calendar event for a recorded meeting (same start ± 20 min, title preferred). */
export async function findCalendarEvent(userId: string, startIso: string, title: string | null): Promise<CalendarEvent | null> {
  const start = new Date(startIso).getTime();
  const events = await listEvents(userId, "primary", new Date(start - 20 * 60000), new Date(start + 20 * 60000));
  if (!events.length) return null;
  const t = (title ?? "").toLowerCase();
  return events.find((e) => (e.summary ?? "").toLowerCase() === t) ?? events.find((e) => t && (e.summary ?? "").toLowerCase().includes(t.slice(0, 12))) ?? events[0];
}

/** Next occurrence of a recurring event (or same-titled event) within 45 days. */
export async function findNextCall(userId: string, after: Date, recurringEventId: string | null, title: string | null): Promise<CalendarEvent | null> {
  const events = await listEvents(userId, "primary", new Date(after.getTime() + 60 * 60000), new Date(after.getTime() + 45 * 86400000));
  return (
    events.find((e) => recurringEventId && e.recurringEventId === recurringEventId) ??
    events.find((e) => title && (e.summary ?? "").toLowerCase() === title.toLowerCase()) ??
    null
  );
}

function encodeHeader(s: string) {
  return /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=` : s;
}

/** Creates (or replaces) a Gmail draft. Chief never sends email. */
export async function saveGmailDraft(
  userId: string,
  mail: { to: string[]; cc: string[]; subject: string; text: string; html: string },
  existingDraftId?: string | null,
): Promise<{ id: string; messageId: string }> {
  const boundary = `chief_${Date.now().toString(36)}`;
  const mime = [
    mail.to.length ? `To: ${mail.to.join(", ")}` : null,
    mail.cc.length ? `Cc: ${mail.cc.join(", ")}` : null,
    `Subject: ${encodeHeader(mail.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(mail.text, "utf8").toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(mail.html, "utf8").toString("base64"),
    `--${boundary}--`,
  ]
    .filter((l) => l !== null)
    .join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64url");
  const token = await getAccessToken(userId);
  const base = `${process.env.GOOGLE_API_BASE ?? "https://gmail.googleapis.com"}/gmail/v1/users/me/drafts`;
  const send = (url: string, method: string) =>
    fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { raw } }), cache: "no-store" });
  let res = existingDraftId ? await send(`${base}/${existingDraftId}`, "PUT") : await send(base, "POST");
  if (existingDraftId && res.status === 404) res = await send(base, "POST"); // the PM deleted it in Gmail
  const json = (await readJson(res, "Gmail")) as { id?: string; message?: { id?: string }; error?: { message?: string } };
  if (!res.ok || !json.id) {
    const reason = json.error?.message ?? res.statusText;
    if (res.status === 403 && /has not been used|is disabled/i.test(reason)) throw new Error("The Gmail API isn't switched on in Google Cloud yet (see SETUP_GUIDE.md).");
    throw new Error(`Gmail said: ${reason}`);
  }
  return { id: json.id, messageId: json.message?.id ?? "" };
}
