import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";
import { createDraftFor } from "@/lib/draft/build";
import { sendDm, slackConfigured } from "@/lib/connectors/slack";
import { localDayStart, previousWorkingDayStart, scanProjectEods } from "@/lib/eod/scan";
import { runMatching } from "@/lib/matching/run";
import { buildBrief, briefText } from "@/lib/meetings/brief";
import { upcomingClientCalls } from "@/lib/meetings/upcoming";
import { dMon } from "@/lib/meetings/text";
import { isDueNow, localNow, toMinutes, type LocalNow } from "./clock";

type Prefs = {
  user_id: string;
  timezone: string | null;
  working_days: number[];
  morning_draft_time: string;
  eod_cutoff_time: string;
  evening_reminders: { days: number[]; time: string }[];
  pre_call_lead_minutes: number;
  blocker_keywords: string[] | null;
  match_high_threshold: number;
  match_medium_threshold: number;
  notifications: Record<string, boolean> | null;
};
type Ctx = { db: SupabaseClient; prefs: Prefs; now: LocalNow; slackUserId: string | null; pmName: string | null; log: string[] };

const NUDGE = "Chief here 👋 friendly reminder to drop your EOD when you get a moment.";

/** Claims a job key once per user (unique index). Returns false if it already ran. */
async function claim(db: SupabaseClient, userId: string, key: string): Promise<boolean> {
  const { error } = await db.from("job_runs").insert({ user_id: userId, job_key: key, status: "running" });
  return !error;
}
async function finish(db: SupabaseClient, userId: string, key: string, detail?: unknown) {
  await db.from("job_runs").update({ status: "done", detail: detail ?? null }).eq("user_id", userId).eq("job_key", key);
}
async function release(db: SupabaseClient, userId: string, key: string) {
  await db.from("job_runs").delete().eq("user_id", userId).eq("job_key", key);
}

/** Runs `fn` once for `key`; if it throws, the claim is released so the next tick retries. */
async function once(ctx: Ctx, key: string, fn: () => Promise<unknown>) {
  const uid = ctx.prefs.user_id;
  if (!(await claim(ctx.db, uid, key))) return;
  try {
    const detail = await fn();
    await finish(ctx.db, uid, key, detail);
    ctx.log.push(`${uid.slice(0, 8)} ${key}`);
  } catch (e) {
    await release(ctx.db, uid, key);
    ctx.log.push(`${uid.slice(0, 8)} ${key} failed: ${e instanceof Error ? e.message : e}`);
  }
}

const notify = (ctx: Ctx, k: string) => ctx.prefs.notifications?.[k] !== false && !!ctx.slackUserId && slackConfigured();

async function morningDraft(ctx: Ctx) {
  if (!isDueNow(ctx.now, ctx.prefs.morning_draft_time, 240)) return;
  await once(ctx, `morning_draft:${ctx.now.date}`, async () => {
    const r = await createDraftFor(ctx.db, ctx.prefs.user_id, appUrl());
    if (r.ok && r.created && notify(ctx, "draft_ready")) {
      await sendDm(ctx.slackUserId!, `Chief here 👋 your project update draft for ${dMon(ctx.now.date)} is ready to review: ${appUrl()}/draft`);
    }
    return { draft: r.draftId ?? null, message: r.message };
  });
}

async function eodNudges(ctx: Ctx) {
  if (!slackConfigured()) return;
  const uid = ctx.prefs.user_id;
  const [{ data: projects }, { data: overrides }] = await Promise.all([
    ctx.db.from("projects").select("id, name").eq("user_id", uid).eq("active", true).eq("type", "dev"),
    ctx.db.from("schedule_overrides").select("project_id, working_days, eod_cutoff_time, nudges_enabled").eq("user_id", uid),
  ]);
  for (const p of projects ?? []) {
    const o = overrides?.find((x) => x.project_id === p.id);
    if (o?.nudges_enabled === false) continue;
    const days = (o?.working_days ?? ctx.prefs.working_days) as number[];
    if (!days.includes(ctx.now.weekday)) continue;
    if (!isDueNow(ctx.now, o?.eod_cutoff_time ?? ctx.prefs.eod_cutoff_time, 120)) continue;
    await once(ctx, `eod_nudges:${p.id}:${ctx.now.date}`, async () => {
      const since = (localDayStart(Date.now(), ctx.prefs.timezone ?? "UTC") / 1000).toFixed(6);
      const scan = await scanProjectEods(ctx.db, uid, p.id, since, ctx.prefs.blocker_keywords ?? undefined);
      const { data: members } = await ctx.db
        .from("project_members")
        .select("nudge, tracking_mode, person:people(id, name, slack_user_id)")
        .eq("user_id", uid)
        .eq("project_id", p.id)
        .eq("tracking_mode", "slack_scan")
        .eq("nudge", true);
      const sent: string[] = [];
      for (const m of (members ?? []) as unknown as { person: { id: string; name: string; slack_user_id: string | null } }[]) {
        if (!m.person.slack_user_id || scan.eods[m.person.id]?.length) continue;
        const { count } = await ctx.db.from("nudges").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("person_id", m.person.id).eq("for_date", ctx.now.date);
        if (count) continue; // already nudged today (e.g. via another project)
        const r = await sendDm(m.person.slack_user_id, NUDGE);
        await ctx.db.from("nudges").insert({ user_id: uid, project_id: p.id, person_id: m.person.id, kind: "missing_eod", for_date: ctx.now.date, slack_ts: r.ts });
        sent.push(m.person.name);
      }
      await runMatching(ctx.db, uid, ctx.prefs).catch(() => {});
      return { nudged: sent };
    });
  }
}

async function eveningReminders(ctx: Ctx) {
  if (!notify(ctx, "evening_reminder")) return;
  for (const [i, r] of (ctx.prefs.evening_reminders ?? []).entries()) {
    if (!r.days?.includes(ctx.now.weekday) || !isDueNow(ctx.now, r.time, 120)) continue;
    await once(ctx, `evening:${i}:${ctx.now.date}`, async () => {
      const { count } = await ctx.db.from("todos").select("id", { count: "exact", head: true }).eq("user_id", ctx.prefs.user_id).eq("list", "today").is("archived_at", null);
      const open = count ?? 0;
      await sendDm(
        ctx.slackUserId!,
        open
          ? `Chief here 👋 time to tick off today's to-dos — you have ${open} still in Today: ${appUrl()}/todos`
          : `Chief here 👋 quick evening check: anything you finished today worth adding to your to-dos? ${appUrl()}/todos`,
      );
      return { open };
    });
  }
}

async function preCallBriefs(ctx: Ctx) {
  if (!notify(ctx, "pre_call_brief")) return;
  const lead = ctx.prefs.pre_call_lead_minutes ?? 60;
  const calls = await upcomingClientCalls(ctx.db, ctx.prefs.user_id, (lead + 15) / 60).catch(() => []);
  for (const c of calls) {
    const minutesAway = (new Date(c.start).getTime() - Date.now()) / 60000;
    if (minutesAway > lead || minutesAway < 0) continue;
    await once(ctx, `brief:${c.eventId}`, async () => {
      const b = await buildBrief(ctx.db, ctx.prefs.user_id, c.projectId, ctx.prefs.timezone);
      if (!b) return { skipped: true };
      const when = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ctx.prefs.timezone ?? undefined }).format(new Date(c.start));
      await sendDm(ctx.slackUserId!, briefText(b, c.title, when, `${appUrl()}/meetings/brief?event=${encodeURIComponent(c.eventId)}`));
      return { project: b.projectName };
    });
  }
}

async function followupReminders(ctx: Ctx) {
  if (!notify(ctx, "followup_due") || !isDueNow(ctx.now, ctx.prefs.morning_draft_time, 600)) return;
  await once(ctx, `followups:${ctx.now.date}`, async () => {
    const { data } = await ctx.db
      .from("followups")
      .select("text, due_date, owner_name, project:projects(name)")
      .eq("user_id", ctx.prefs.user_id)
      .eq("status", "open")
      .lte("due_date", ctx.now.date)
      .order("due_date");
    const rows = (data ?? []) as unknown as { text: string; due_date: string; owner_name: string | null; project: { name: string } | null }[];
    if (!rows.length) return { due: 0 };
    const lines = rows.map((f) => `• ${f.text}${f.owner_name ? ` — ${f.owner_name}` : ""} (${f.project?.name ?? ""}, ${f.due_date < ctx.now.date ? `overdue since ${dMon(f.due_date)}` : "due today"})`);
    await sendDm(ctx.slackUserId!, [`Chief here 👋 follow-ups due:`, ...lines, `${appUrl()}/tracker`].join("\n"));
    return { due: rows.length };
  });
}

/** Hourly during the working day: read EODs and match them to open standup tasks. */
async function hourlyScan(ctx: Ctx) {
  if (!slackConfigured()) return;
  const start = toMinutes(ctx.prefs.morning_draft_time) ?? 450;
  const end = (toMinutes(ctx.prefs.eod_cutoff_time) ?? 1140) + 180;
  if (ctx.now.minutes < start || ctx.now.minutes > end) return;
  const { count } = await ctx.db.from("action_items").select("id", { count: "exact", head: true }).eq("user_id", ctx.prefs.user_id).eq("status", "open").eq("source", "standup");
  if (!count) return; // nothing to match
  await once(ctx, `scan:${ctx.now.date}:${ctx.now.time.slice(0, 2)}`, async () => {
    const since = (previousWorkingDayStart(Date.now(), ctx.prefs.timezone ?? "UTC", ctx.prefs.working_days) / 1000).toFixed(6);
    const { data: projects } = await ctx.db.from("projects").select("id").eq("user_id", ctx.prefs.user_id).eq("active", true).eq("type", "dev");
    for (const p of projects ?? []) await scanProjectEods(ctx.db, ctx.prefs.user_id, p.id, since, ctx.prefs.blocker_keywords ?? undefined).catch(() => null);
    return runMatching(ctx.db, ctx.prefs.user_id, ctx.prefs);
  });
}

/** One scheduler tick for every user. Small and idempotent; safe to call every 10 minutes. */
export async function runTick(budgetMs = 8000): Promise<string[]> {
  const started = Date.now();
  const db = createAdminClient();
  const { data: prefs } = await db.from("preferences").select("*");
  const { data: profiles } = await db.from("profiles").select("id, slack_user_id, full_name");
  const log: string[] = [];
  for (const p of (prefs ?? []) as Prefs[]) {
    if (Date.now() - started > budgetMs) {
      log.push("time budget reached; continuing next tick");
      break;
    }
    const now = localNow(p.timezone);
    const profile = profiles?.find((x) => x.id === p.user_id);
    const ctx: Ctx = { db, prefs: p, now, slackUserId: profile?.slack_user_id ?? null, pmName: profile?.full_name ?? null, log };
    if (p.working_days?.includes(now.weekday)) {
      for (const job of [morningDraft, preCallBriefs, followupReminders, eodNudges, eveningReminders, hourlyScan]) {
        if (Date.now() - started > budgetMs) break;
        await job(ctx).catch((e) => log.push(`${p.user_id.slice(0, 8)} ${job.name} error: ${e instanceof Error ? e.message : e}`));
      }
    }
  }
  return log;
}
