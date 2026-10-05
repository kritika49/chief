import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIVIDER, formatHeaderDate } from "@/lib/draft/format";
import { dMon } from "./text";
import type { ProjectHeader } from "@/lib/types";

/** The "Key Updates" bullets for one project inside a posted update. */
export function projectSection(updateText: string, projectName: string): string[] {
  const blocks = updateText.split(/\n[-—–]{10,}\n|\n[-—–]{10,}$/);
  void DIVIDER;
  const block = blocks.find((b) => b.trim().split("\n")[0]?.trim().toLowerCase() === projectName.toLowerCase());
  if (!block) return [];
  const lines = block.split("\n");
  const start = lines.findIndex((l) => /^key updates:?/i.test(l.trim()));
  return lines.slice(start + 1).map((l) => l.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean);
}

export type Brief = {
  projectName: string;
  headerLines: string[];
  lastCall: string | null;
  updates: { date: string; lines: string[] }[];
  followups: { text: string; owner: string | null; due: string | null; overdue: boolean }[];
  todos: string[];
  blockers: string[];
};

export async function buildBrief(db: SupabaseClient, userId: string, projectId: string, timezone?: string | null): Promise<Brief | null> {
  const { data: p } = await db.from("projects").select("name, type, header").eq("user_id", userId).eq("id", projectId).single();
  if (!p) return null;
  const { data: last } = await db.from("meetings").select("started_at").eq("user_id", userId).eq("project_id", projectId).eq("type", "client_call").lt("started_at", new Date().toISOString()).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const since = last?.started_at ?? new Date(Date.now() - 14 * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: posts }, { data: followups }, { data: todos }, { data: eodBlockers }, { data: todoBlockers }] = await Promise.all([
    db.from("posted_updates").select("text, posted_at").eq("user_id", userId).gte("posted_at", since).order("posted_at"),
    db.from("followups").select("text, owner_name, due_date").eq("user_id", userId).eq("project_id", projectId).eq("status", "open").order("due_date", { nullsFirst: false }),
    db.from("todos").select("text").eq("user_id", userId).eq("project_id", projectId).eq("source", "client_call").neq("list", "done").is("archived_at", null),
    db.from("eod_bullets").select("text, person:people(name)").eq("user_id", userId).eq("project_id", projectId).eq("is_blocker", true).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    db.from("todos").select("text").eq("user_id", userId).eq("project_id", projectId).eq("is_blocker", true).neq("list", "done").is("archived_at", null),
  ]);
  const h = (p.header ?? {}) as ProjectHeader;
  const headerLines =
    p.type === "dev"
      ? [`Planned vs Actual: ${h.planned_vs_actual || "—"}`, `Dev Completion: ${formatHeaderDate(h.dev_completion)}`, `Launch: ${formatHeaderDate(h.launch)}`]
      : [`Status: ${h.status || "—"}`, `Design Started: ${formatHeaderDate(h.design_started)}`];
  return {
    projectName: p.name,
    headerLines,
    lastCall: last?.started_at ? dMon(last.started_at, timezone) : null,
    updates: (posts ?? []).map((u) => ({ date: dMon(u.posted_at, timezone), lines: projectSection(u.text, p.name) })).filter((u) => u.lines.length),
    followups: (followups ?? []).map((f) => ({ text: f.text, owner: f.owner_name, due: f.due_date, overdue: !!f.due_date && f.due_date < today })),
    todos: (todos ?? []).map((t) => t.text),
    blockers: [
      ...((eodBlockers ?? []) as unknown as { text: string; person: { name: string } | null }[]).map((b) => `${b.person?.name ? `${b.person.name}: ` : ""}${b.text}`),
      ...(todoBlockers ?? []).map((t) => t.text),
    ],
  };
}

/** Plain text for a Slack DM. */
export function briefText(b: Brief, callTitle: string, when: string, link: string): string {
  const out = [`Chief here 👋 your brief for *${callTitle}* (${when}):`, "", `*${b.projectName}*`, ...b.headerLines, ""];
  out.push(`Last client call: ${b.lastCall ?? "none recorded"}`);
  if (b.updates.length) {
    out.push("", "*Updates since then:*");
    for (const u of b.updates) out.push(`_${u.date}_`, ...u.lines.map((l) => `• ${l}`));
  }
  if (b.followups.length) out.push("", "*Open follow-ups:*", ...b.followups.map((f) => `• ${f.text}${f.owner ? ` — ${f.owner}` : ""}${f.due ? ` (due ${dMon(f.due)}${f.overdue ? ", overdue" : ""})` : ""}`));
  if (b.todos.length) out.push("", "*Open to-dos from client calls:*", ...b.todos.map((t) => `• ${t}`));
  if (b.blockers.length) out.push("", "*Flagged blockers:*", ...b.blockers.map((t) => `• ${t}`));
  out.push("", `Full brief: ${link}`);
  return out.join("\n");
}
