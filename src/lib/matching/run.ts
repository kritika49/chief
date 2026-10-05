import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchScore } from "./score";

type Prefs = { match_high_threshold?: number | null; match_medium_threshold?: number | null };

/**
 * Compares open standup tasks with EOD bullets from the same person and project
 * posted on/after the standup. High → auto-done; medium → suggested. Pairs
 * already scored (incl. rejected) are never re-suggested.
 */
export async function runMatching(db: SupabaseClient, userId: string, prefs?: Prefs) {
  const high = Number(prefs?.match_high_threshold ?? 0.6);
  const medium = Number(prefs?.match_medium_threshold ?? 0.3);
  const { data: tasks } = await db
    .from("action_items")
    .select("id, text, project_id, assignee_person_id, created_at, meeting:meetings(started_at)")
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("source", "standup")
    .not("assignee_person_id", "is", null);
  if (!tasks?.length) return { auto: 0, suggested: 0 };

  let auto = 0;
  let suggested = 0;
  for (const t of tasks as unknown as { id: string; text: string; project_id: string; assignee_person_id: string; created_at: string; meeting: { started_at: string | null } | null }[]) {
    const since = t.meeting?.started_at ?? t.created_at;
    const [{ data: bullets }, { data: seen }] = await Promise.all([
      db.from("eod_bullets")
        .select("id, text, message:slack_messages!inner(posted_at)")
        .eq("user_id", userId)
        .eq("person_id", t.assignee_person_id)
        .eq("project_id", t.project_id)
        .gte("message.posted_at", since),
      db.from("task_matches").select("eod_bullet_id").eq("user_id", userId).eq("task_id", t.id),
    ]);
    const skip = new Set((seen ?? []).map((s) => s.eod_bullet_id));
    let best: { id: string; score: number } | null = null;
    for (const b of (bullets ?? []) as { id: string; text: string }[]) {
      if (skip.has(b.id)) continue;
      const score = matchScore(t.text, b.text);
      if (!best || score > best.score) best = { id: b.id, score };
    }
    if (!best || best.score < medium) continue;
    const isHigh = best.score >= high;
    await db.from("task_matches").insert({ user_id: userId, task_id: t.id, eod_bullet_id: best.id, score: Number(best.score.toFixed(2)), status: isHigh ? "auto" : "suggested" });
    if (isHigh) {
      await db.from("action_items").update({ status: "done", done_at: new Date().toISOString() }).eq("user_id", userId).eq("id", t.id);
      auto++;
    } else suggested++;
  }
  return { auto, suggested };
}

/** Working days between two dates (Mon–Fri), for "stale" standup tasks. */
export function workingDaysSince(fromIso: string, now = new Date()): number {
  let d = new Date(fromIso);
  let n = 0;
  while (d < now) {
    d = new Date(d.getTime() + 86400000);
    if (d > now) break;
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}
