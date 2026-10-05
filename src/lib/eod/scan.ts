import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authTest, channelHistory, displayName, permalink, threadReplies, userInfo, type SlackMessage } from "@/lib/connectors/slack";
import { containsKeyword, isBlocker, parseEod } from "./parse";
import type { EodInput } from "@/lib/draft/assemble";

export type UnknownAuthor = { slackUserId: string; name: string; channelName: string; projectId: string };
export type ScanResult = { eods: Record<string, EodInput[]>; unknown: UnknownAuthor[]; errors: string[] };

type ChannelRow = { id: string; slack_channel_id: string; slack_channel_name: string | null; eod_keyword: string };
type MemberRow = { tracking_mode: string; person: { id: string; slack_user_id: string | null } };

const DEFAULT_BLOCKERS = ["blocked", "blocker", "waiting on", "dependency", "issue", "stuck"];

/** Minutes the timezone is ahead of UTC at a given moment. */
function tzOffsetMinutes(at: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Midnight at the start of today, in the PM's timezone (epoch ms). */
export function localDayStart(now: number, timezone = "UTC"): number {
  const offset = tzOffsetMinutes(new Date(now), timezone) * 60000;
  const local = new Date(now + offset);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return day - tzOffsetMinutes(new Date(day - offset), timezone) * 60000;
}

/** Midnight at the start of the previous working day (Mon → Fri), in the PM's timezone. */
export function previousWorkingDayStart(now: number, timezone = "UTC", workingDays: number[] = [1, 2, 3, 4, 5]): number {
  const offset = tzOffsetMinutes(new Date(now), timezone) * 60000;
  const local = new Date(now + offset); // wall-clock time as if UTC
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  for (let i = 0; i < 7; i++) {
    day -= 86400000;
    const iso = new Date(day).getUTCDay() || 7; // 1 = Mon … 7 = Sun
    if (workingDays.includes(iso)) break;
  }
  return day - tzOffsetMinutes(new Date(day - offset), timezone) * 60000;
}

/**
 * Slack ts for the scan window start: the last posted update (at most 4 days
 * back); if nothing was posted from Chief yet, the previous working day.
 */
export function windowStart(lastPostedAt: string | null | undefined, now = Date.now(), timezone?: string | null): string {
  const floor = now - 4 * 24 * 3600 * 1000;
  const start = lastPostedAt ? Math.max(new Date(lastPostedAt).getTime(), floor) : Math.max(previousWorkingDayStart(now, timezone ?? "UTC"), floor);
  return (start / 1000).toFixed(6);
}

let workspaceUrlCache: string | null = null;
async function workspaceUrl() {
  if (!workspaceUrlCache) workspaceUrlCache = (await authTest()).url;
  return workspaceUrlCache;
}

/**
 * Reads a project's active channels for EOD messages since `oldest`, saves raw
 * messages + parsed bullets, and returns EOD text per tracked person.
 * Works with a user-scoped client (RLS) or the admin client (pass userId).
 */
export async function scanProjectEods(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  oldest: string,
  blockerKeywords: string[] = DEFAULT_BLOCKERS,
): Promise<ScanResult> {
  const result: ScanResult = { eods: {}, unknown: [], errors: [] };
  const [{ data: channels }, { data: members }] = await Promise.all([
    supabase.from("channels").select("id, slack_channel_id, slack_channel_name, eod_keyword").eq("project_id", projectId).eq("active", true),
    supabase.from("project_members").select("tracking_mode, person:people(id, slack_user_id)").eq("project_id", projectId),
  ]);
  const bySlackId = new Map<string, string>();
  const anyMember = new Set<string>();
  for (const m of (members ?? []) as unknown as MemberRow[]) {
    if (!m.person.slack_user_id) continue;
    anyMember.add(m.person.slack_user_id);
    if (m.tracking_mode === "slack_scan") bySlackId.set(m.person.slack_user_id, m.person.id);
  }
  if (!channels?.length) return result;
  const wsUrl = await workspaceUrl().catch(() => "https://slack.com");
  const unknownSeen = new Set<string>();

  for (const ch of channels as ChannelRow[]) {
    let messages: SlackMessage[];
    try {
      messages = await channelHistory(ch.slack_channel_id, oldest);
    } catch (e) {
      result.errors.push(`#${ch.slack_channel_name ?? ch.slack_channel_id}: ${e instanceof Error ? e.message : "couldn't read"}`);
      continue;
    }
    // Thread replies containing the keyword count too (capped per channel).
    const threads = messages.filter((m) => (m.reply_count ?? 0) > 0 && m.latest_reply && Number(m.latest_reply) >= Number(oldest)).slice(0, 15);
    for (const t of threads) {
      try {
        messages.push(...(await threadReplies(ch.slack_channel_id, t.ts, oldest)));
      } catch {
        // Skip unreadable threads.
      }
    }

    const eodMessages = messages
      .filter((m) => m.user && (!m.subtype || m.subtype === "thread_broadcast") && containsKeyword(m.text, ch.eod_keyword))
      .sort((a, b) => Number(a.ts) - Number(b.ts));

    for (const m of eodMessages) {
      const personId = bySlackId.get(m.user!);
      if (!personId) {
        if (!anyMember.has(m.user!) && !unknownSeen.has(m.user!)) {
          unknownSeen.add(m.user!);
          const info = await userInfo(m.user!);
          result.unknown.push({ slackUserId: m.user!, name: info ? displayName(info) : "Someone", channelName: ch.slack_channel_name ?? ch.slack_channel_id, projectId });
        }
        continue;
      }
      const url = permalink(wsUrl, ch.slack_channel_id, m.ts, m.thread_ts);
      (result.eods[personId] ??= []).push({ text: m.text, keyword: ch.eod_keyword, url });

      // Keep the raw message and parsed bullets (used later for task matching).
      const { data: saved } = await supabase
        .from("slack_messages")
        .upsert(
          {
            user_id: userId,
            project_id: projectId,
            channel_id: ch.id,
            person_id: personId,
            slack_channel_id: ch.slack_channel_id,
            slack_user_id: m.user!,
            slack_ts: m.ts,
            thread_ts: m.thread_ts ?? null,
            permalink: url,
            raw_text: m.text,
            posted_at: new Date(Number(m.ts) * 1000).toISOString(),
          },
          { onConflict: "user_id,slack_channel_id,slack_ts" },
        )
        .select("id")
        .single();
      if (saved) {
        await supabase.from("eod_bullets").delete().eq("slack_message_id", saved.id);
        const bullets = parseEod(m.text, ch.eod_keyword);
        if (bullets.length) {
          await supabase.from("eod_bullets").insert(
            bullets.map((text, position) => ({ user_id: userId, slack_message_id: saved.id, project_id: projectId, person_id: personId, text, position, is_blocker: isBlocker(text, blockerKeywords) })),
          );
        }
      }
    }
  }
  return result;
}
