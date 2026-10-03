"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { randomId } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";
import { disconnect, getConnection, getCredentials, markNeedsAttention, markSynced, saveConnection } from "@/lib/connectors/store";
import { displayName, listUsers, lookupUserByEmail, sendDm, SlackError } from "@/lib/connectors/slack";
import { listCalendars, testGoogle, type GoogleCredentials } from "@/lib/connectors/google";
import { createWebhook, deleteWebhook, testApiKey, meetingTitle, type FathomCredentials } from "@/lib/connectors/fathom";

function errorMessage(e: unknown, fallback: string) {
  if (!(e instanceof Error) || !e.message || e.message === "fetch failed") return fallback;
  return serverKeyHint(e);
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

async function linkSlackUser(userId: string, slackUserId: string, slackName: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ slack_user_id: slackUserId, slack_user_name: slackName })
    .eq("id", userId);
  if (error) throw new Error("Couldn't save your Slack link.");
  await saveConnection(userId, "slack", {
    status: "connected",
    account_label: slackName,
    settings: { slack_user_id: slackUserId },
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
}

/** Finds the user's Slack account by their sign-in email. */
export async function autoLinkSlack(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const found = await lookupUserByEmail(user.email);
    if (!found) return { ok: false, message: `No Slack account uses ${user.email}. Pick yourself from the list below.` };
    await linkSlackUser(user.id, found.id, displayName(found));
    revalidatePath("/connectors", "layout");
    return { ok: true, message: `Linked to ${displayName(found)}.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e, "Couldn't reach Slack.") };
  }
}

export async function pickSlackUser(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.string().regex(/^[UW][A-Z0-9]+$/).safeParse(formData.get("slack_user_id"));
  if (!id.success) return { ok: false, message: "Please choose your name from the list." };
  try {
    const all = await listUsers();
    const match = all.find((u) => u.id === id.data);
    if (!match) return { ok: false, message: "That Slack user wasn't found." };
    await linkSlackUser(user.id, match.id, displayName(match));
    revalidatePath("/connectors", "layout");
    return { ok: true, message: `Linked to ${displayName(match)}.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e, "Couldn't reach Slack.") };
  }
}

export async function testSlack(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("slack_user_id, slack_user_name").eq("id", user.id).maybeSingle();
  const conn = await getConnection(user.id, "slack").catch(() => null);
  const slackUserId = (conn?.settings?.slack_user_id as string | undefined) ?? profile?.slack_user_id ?? undefined;
  if (!slackUserId) return { ok: false, message: "Link your Slack account first." };
  try {
    await sendDm(slackUserId, "Chief here 👋 just testing our connection. All good — you'll get your draft-ready notes here.");
  } catch (e) {
    const msg = errorMessage(e, "Couldn't reach Slack.");
    if (e instanceof SlackError && ["invalid_auth", "account_inactive"].includes(e.code)) {
      await markNeedsAttention(user.id, "slack", msg).catch(() => {});
    }
    return { ok: false, message: msg };
  }
  try {
    await saveConnection(user.id, "slack", {
      status: "connected",
      account_label: profile?.slack_user_name ?? conn?.account_label ?? null,
      settings: { ...conn?.settings, slack_user_id: slackUserId },
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
  } catch (e) {
    return { ok: false, message: `The DM was sent, but Chief couldn't save the connection: ${serverKeyHint(e)}` };
  }
  revalidatePath("/connectors", "layout");
  return { ok: true, message: "Sent! Check your Slack direct messages from Chief." };
}

/** Plain-language hint when the Supabase secret (service role) key is wrong. */
function serverKeyHint(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/SUPABASE_SERVICE_ROLE_KEY|Invalid API key|JWS|JWT|signature/i.test(m)) {
    return "the SUPABASE_SERVICE_ROLE_KEY setting in Netlify looks wrong. Copy the service_role key again from Supabase (Project Settings → API Keys → Legacy) and paste it in every box, then redeploy.";
  }
  return m;
}

export async function unlinkSlack(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("profiles").update({ slack_user_id: null, slack_user_name: null }).eq("id", user.id);
  await disconnect(user.id, "slack");
  revalidatePath("/connectors", "layout");
  return { ok: true, message: "Slack unlinked." };
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

export async function testGoogleAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const r = await testGoogle(user.id);
    revalidatePath("/connectors", "layout");
    return {
      ok: true,
      message: `Working: ${r.calendars} calendar${r.calendars === 1 ? "" : "s"}, ${r.upcomingEvents} event${r.upcomingEvents === 1 ? "" : "s"} in the next 24 hours, Gmail ${r.gmail}.`,
    };
  } catch (e) {
    revalidatePath("/connectors", "layout");
    return { ok: false, message: errorMessage(e, "Couldn't reach Google.") };
  }
}

export async function saveCalendars(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const chosen = formData.getAll("calendar").map(String).filter(Boolean);
  if (chosen.length === 0) return { ok: false, message: "Pick at least one calendar." };
  try {
    const available = new Set((await listCalendars(user.id)).map((c) => c.id));
    const valid = chosen.filter((c) => available.has(c) || c === "primary");
    const conn = await getConnection(user.id, "google");
    await saveConnection(user.id, "google", { settings: { ...conn?.settings, calendars: valid } });
    const supabase = await createClient();
    await supabase.from("preferences").update({ watched_calendar_ids: valid }).eq("user_id", user.id);
    revalidatePath("/connectors", "layout");
    return { ok: true, message: `Watching ${valid.length} calendar${valid.length === 1 ? "" : "s"}.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e, "Couldn't save calendars.") };
  }
}

export async function disconnectGoogle(): Promise<ActionResult> {
  const user = await requireUser();
  const creds = await getCredentials<GoogleCredentials>(user.id, "google").catch(() => null);
  if (creds?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.refresh_token)}`, { method: "POST" }).catch(() => {});
  }
  await disconnect(user.id, "google");
  revalidatePath("/connectors", "layout");
  return { ok: true, message: "Google disconnected." };
}

// ---------------------------------------------------------------------------
// Fathom
// ---------------------------------------------------------------------------

export async function saveFathomKey(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const key = String(formData.get("api_key") ?? "").trim();
  if (key.length < 10 || /[^\x21-\x7e]/.test(key)) return { ok: false, message: "That doesn't look like a Fathom API key. Copy it again from Fathom." };

  let latestTitle: string | null = null;
  try {
    const r = await testApiKey(key);
    latestTitle = r.latest ? meetingTitle(r.latest) : null;
  } catch (e) {
    return { ok: false, message: errorMessage(e, "Couldn't reach Fathom.") };
  }

  const existing = await getConnection(user.id, "fathom");
  const oldCreds = await getCredentials<FathomCredentials>(user.id, "fathom").catch(() => null);
  if (oldCreds?.fathom_webhook_id) await deleteWebhook(oldCreds.api_key, oldCreds.fathom_webhook_id);

  const webhookId = existing?.webhook_id ?? randomId(12);
  const destination = `${appUrl()}/api/webhooks/fathom/${webhookId}`;
  const creds: FathomCredentials = { api_key: key };
  let auto = false;
  try {
    const hook = await createWebhook(key, destination);
    creds.webhook_secret = hook.secret;
    creds.fathom_webhook_id = hook.id;
    auto = true;
  } catch {
    // Fall back to manual setup in Fathom's settings.
  }

  try {
    await saveConnection(user.id, "fathom", {
      status: auto ? "connected" : "needs_attention",
      account_label: `API key ending ${key.slice(-4)}`,
      credentials: creds,
      webhook_id: webhookId,
      settings: { ...existing?.settings, webhook_mode: auto ? "auto" : "manual" },
      last_sync_at: new Date().toISOString(),
      last_error: auto ? null : "Add the webhook in Fathom (steps below) to finish.",
    });
  } catch (e) {
    // Don't leave a webhook in Fathom that Chief has no record of.
    if (creds.fathom_webhook_id) await deleteWebhook(key, creds.fathom_webhook_id);
    return { ok: false, message: `Your key works, but Chief couldn't save it: ${serverKeyHint(e)}` };
  }
  revalidatePath("/connectors", "layout");
  const latest = latestTitle ? ` Latest meeting: “${latestTitle}”.` : "";
  return auto
    ? { ok: true, message: `Connected, and the webhook was set up automatically.${latest}` }
    : { ok: true, message: `Key works.${latest} One more step: add the webhook in Fathom (below).` };
}

export async function saveFathomSecret(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const secret = String(formData.get("webhook_secret") ?? "").trim();
  if (!/^whsec_[A-Za-z0-9+/=]+$/.test(secret)) {
    return { ok: false, message: "The webhook secret should start with whsec_. Copy it again from Fathom." };
  }
  const creds = await getCredentials<FathomCredentials>(user.id, "fathom").catch(() => null);
  if (!creds) return { ok: false, message: "Add your Fathom API key first." };
  try {
    await saveConnection(user.id, "fathom", { status: "connected", credentials: { ...creds, webhook_secret: secret }, last_error: null });
  } catch (e) {
    return { ok: false, message: `Couldn't save: ${serverKeyHint(e)}` };
  }
  revalidatePath("/connectors", "layout");
  return { ok: true, message: "Saved. New meetings will now arrive automatically." };
}

export async function testFathom(): Promise<ActionResult> {
  const user = await requireUser();
  const creds = await getCredentials<FathomCredentials>(user.id, "fathom").catch(() => null);
  if (!creds) return { ok: false, message: "Add your Fathom API key first." };
  try {
    const r = await testApiKey(creds.api_key);
    if (creds.webhook_secret) await markSynced(user.id, "fathom");
    revalidatePath("/connectors", "layout");
    return {
      ok: true,
      message: r.latest ? `Working. Latest meeting in Fathom: “${meetingTitle(r.latest)}”.` : "Working. No meetings in Fathom yet.",
    };
  } catch (e) {
    const msg = errorMessage(e, "Couldn't reach Fathom.");
    await markNeedsAttention(user.id, "fathom", msg).catch(() => {});
    revalidatePath("/connectors", "layout");
    return { ok: false, message: msg };
  }
}

export async function disconnectFathom(): Promise<ActionResult> {
  const user = await requireUser();
  const creds = await getCredentials<FathomCredentials>(user.id, "fathom").catch(() => null);
  if (creds?.fathom_webhook_id) await deleteWebhook(creds.api_key, creds.fathom_webhook_id);
  await disconnect(user.id, "fathom");
  revalidatePath("/connectors", "layout");
  return { ok: true, message: "Fathom disconnected." };
}
