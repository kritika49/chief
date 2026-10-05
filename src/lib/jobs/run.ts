import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";
import { sendDm, slackConfigured } from "@/lib/connectors/slack";
import { localDayStart, scanProjectEods } from "@/lib/eod/scan";
import { runMatching } from "@/lib/matching/run";
import { localNow, type LocalNow } from "./clock";

// The scheduler runs ONCE a night (11:00 pm IST on weekdays — see
// netlify/functions/scheduler.mts). It reads the day's EODs, reminds developers
// whose EOD is missing, and sends the PM one summary DM. Nothing else is sent:
// drafts, briefs and follow-ups live on the platform.

type Prefs = {
  user_id: string;
  timezone: string | null;
  working_days: number[];
  blocker_keywords: string[] | null;
  match_high_threshold: number;
  match_medium_threshold: number;
  notifications: Record<string, boolean> | null;
};

export const NUDGE = "Chief here 👋 friendly reminder to drop your EOD when you get a moment.";

/** Claims a job key once per user (unique index). Returns false if it already ran. */
async function claim(db: SupabaseClient, userId: string, key: string) {
  const { error } = await db.from("job_runs").insert({ user_id: userId, job_key: key, status: "running" });
  return !error;
}

type MemberRow = { nudge: boolean; tracking_mode: string; project_id: string; person: { id: string; name: string; slack_user_id: string | null } };

/** Nightly sync for one PM: read EODs, match tasks, nudge missing EODs, DM the PM a summary. */
export async function nightlySync(db: SupabaseClient, prefs: Prefs, pmSlackUserId: string | null, now: LocalNow) {
  const uid = prefs.user_id;
  const notify = prefs.notifications ?? {};
  const since = (localDayStart(Date.now(), prefs.timezone ?? "UTC") / 1000).toFixed(6);
  const [{ data: projects }, { data: overrides }] = await Promise.all([
    db.from("projects").select("id, name").eq("user_id", uid).eq("active", true).eq("type", "dev").order("sort_order"),
    db.from("schedule_overrides").select("project_id, working_days, nudges_enabled").eq("user_id", uid),
  ]);

  const posted: string[] = [];
  const reminded: string[] = [];
  const missingNoSlack: string[] = [];
  const nudgedToday = new Set<string>();
  for (const p of projects ?? []) {
    const o = overrides?.find((x) => x.project_id === p.id);
    if (!((o?.working_days ?? prefs.working_days) as number[]).includes(now.weekday)) continue;
    const scan = await scanProjectEods(db, uid, p.id, since, prefs.blocker_keywords ?? undefined).catch(() => null);
    if (!scan) continue;
    const { data: members } = await db
      .from("project_members")
      .select("nudge, tracking_mode, project_id, person:people(id, name, slack_user_id)")
      .eq("user_id", uid)
      .eq("project_id", p.id)
      .eq("tracking_mode", "slack_scan");
    for (const m of (members ?? []) as unknown as MemberRow[]) {
      const label = `${m.person.name} (${p.name})`;
      if (scan.eods[m.person.id]?.length) {
        posted.push(label);
        continue;
      }
      const canNudge = notify.dev_nudges !== false && o?.nudges_enabled !== false && m.nudge && !!m.person.slack_user_id && slackConfigured();
      if (!canNudge) {
        missingNoSlack.push(label);
        continue;
      }
      if (nudgedToday.has(m.person.id)) {
        reminded.push(label);
        continue;
      }
      const { count } = await db.from("nudges").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("person_id", m.person.id).eq("for_date", now.date);
      if (!count) {
        const r = await sendDm(m.person.slack_user_id!, NUDGE);
        await db.from("nudges").insert({ user_id: uid, project_id: p.id, person_id: m.person.id, kind: "missing_eod", for_date: now.date, slack_ts: r.ts });
      }
      nudgedToday.add(m.person.id);
      reminded.push(label);
    }
  }
  const matched = await runMatching(db, uid, prefs).catch(() => ({ auto: 0, suggested: 0 }));

  if (notify.pm_nightly !== false && pmSlackUserId && slackConfigured()) {
    const { count: todayTodos } = await db.from("todos").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("list", "today").is("archived_at", null);
    const lines = [`Chief here 👋 tonight's EOD check is done.`];
    if (posted.length) lines.push(`✅ EOD posted: ${posted.join(", ")}`);
    if (reminded.length) lines.push(`🔔 Reminded: ${reminded.join(", ")}`);
    if (missingNoSlack.length) lines.push(`⏳ No EOD yet: ${missingNoSlack.join(", ")}`);
    if (matched.auto || matched.suggested) lines.push(`🧩 Standup tasks: ${matched.auto} matched to EODs${matched.suggested ? `, ${matched.suggested} to confirm` : ""}.`);
    lines.push(
      todayTodos
        ? `Time to cross-check your to-dos — ${todayTodos} still in Today: ${appUrl()}/todos`
        : `Time to cross-check your to-dos — tick off what you finished today: ${appUrl()}/todos`,
    );
    await sendDm(pmSlackUserId, lines.join("\n"));
  }
  return { posted: posted.length, reminded: reminded.length, matched };
}

/** One scheduler run for every PM. Idempotent per PM per day. */
export async function runTick(budgetMs = 20000): Promise<string[]> {
  const started = Date.now();
  const db = createAdminClient();
  const [{ data: prefs }, { data: profiles }] = await Promise.all([
    db.from("preferences").select("user_id, timezone, working_days, blocker_keywords, match_high_threshold, match_medium_threshold, notifications"),
    db.from("profiles").select("id, slack_user_id"),
  ]);
  const log: string[] = [];
  for (const p of (prefs ?? []) as Prefs[]) {
    if (Date.now() - started > budgetMs) {
      log.push("time budget reached");
      break;
    }
    const now = localNow(p.timezone);
    if (!p.working_days?.includes(now.weekday)) continue;
    const key = `nightly:${now.date}`;
    if (!(await claim(db, p.user_id, key))) continue;
    try {
      const detail = await nightlySync(db, p, profiles?.find((x) => x.id === p.user_id)?.slack_user_id ?? null, now);
      await db.from("job_runs").update({ status: "done", detail }).eq("user_id", p.user_id).eq("job_key", key);
      log.push(`${p.user_id.slice(0, 8)} ${key}`);
    } catch (e) {
      await db.from("job_runs").delete().eq("user_id", p.user_id).eq("job_key", key); // retry next run
      log.push(`${p.user_id.slice(0, 8)} ${key} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return log;
}
