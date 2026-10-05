import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/crypto";
import {
  fathomMeeting,
  getSummary,
  getTranscript,
  meetingTitle,
  transcriptText,
  verifyFathomSignature,
  type FathomCredentials,
} from "@/lib/connectors/fathom";
import type { ConnectionRow } from "@/lib/connectors/store";
import { ingestMeeting } from "@/lib/meetings/ingest";

/** Fathom calls this when a meeting's notes are ready (`new-meeting-content-ready`). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;
  const body = await request.text();
  const admin = createAdminClient();

  const { data } = await admin.from("connections").select("*").eq("provider", "fathom").eq("webhook_id", webhookId).maybeSingle();
  const conn = data as ConnectionRow | null;
  if (!conn?.credentials_encrypted) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });

  const creds = decryptJson<FathomCredentials>(conn.credentials_encrypted);
  if (!creds.webhook_secret) return NextResponse.json({ error: "Webhook secret not set" }, { status: 401 });

  const valid = verifyFathomSignature(
    creds.webhook_secret,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    body,
  );
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = fathomMeeting.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Unexpected payload" }, { status: 400 });
  const m = parsed.data;

  // Webhook normally includes everything; fetch from the API if not.
  let summary = m.default_summary?.markdown_formatted ?? null;
  let transcript = transcriptText(m);
  try {
    if (!summary) summary = await getSummary(creds.api_key, m.recording_id);
    if (!transcript) {
      const t = await getTranscript(creds.api_key, m.recording_id);
      transcript = t ? transcriptText({ ...m, transcript: t }) : null;
    }
  } catch {
    // Keep what we have; the meeting is still saved.
  }

  const title = meetingTitle(m);
  const startedAt = m.recording_start_time ?? m.scheduled_start_time ?? m.created_at ?? new Date().toISOString();
  const { data: saved, error } = await admin.from("meetings").upsert(
    {
      user_id: conn.user_id,
      fathom_id: m.recording_id,
      title,
      started_at: startedAt,
      fathom_url: m.share_url ?? m.url ?? null,
      attendees: m.calendar_invitees ?? [],
      summary,
      transcript,
      raw: json,
    },
    { onConflict: "user_id,fathom_id" },
  ).select("id").single();
  if (error || !saved) return NextResponse.json({ error: "Couldn't save meeting" }, { status: 500 });
  await ingestMeeting(admin, conn.user_id, saved.id).catch((e) => console.error("Fathom ingest failed", e));

  await admin
    .from("connections")
    .update({
      status: "connected",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      settings: { ...conn.settings, last_meeting: { title, at: startedAt } },
    })
    .eq("id", conn.id);

  return NextResponse.json({ ok: true });
}
