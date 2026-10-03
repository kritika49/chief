// Rule-based draft assembly (Section 7). Pure — kept behind the DraftAssembler
// interface so an AI rewriter can be swapped in later.
import { parseEod } from "@/lib/eod/parse";
import { awaitedLine, normalizeBullet, prefixName } from "./format";
import type { TrackingMode } from "@/lib/types";

export type BulletSource = "eod" | "missing_eod" | "manual_entry" | "todo" | "client_call" | "standup" | "pinned" | "free_text";

export type DraftBullet = {
  text: string;
  source: BulletSource;
  source_ref?: string | null; // person id, todo id, meeting item id, pinned id
  source_url?: string | null;
};

export type MemberInput = { personId: string; name: string; tracking: TrackingMode };
export type EodInput = { text: string; keyword: string; url?: string | null };

export type AssembleInput = {
  members: MemberInput[];
  eods: Record<string, EodInput[]>; // by person id (Slack scan or pasted)
  manualEntries: Record<string, string>; // by person id, for manual_entry members
  doneTodos: { id: string; text: string }[];
  callPoints: { id: string; text: string; url?: string | null }[];
  standupLines: { id: string; text: string; url?: string | null }[];
  pinned: { id: string; text: string }[];
};

export interface DraftAssembler {
  assemble(input: AssembleInput): DraftBullet[];
}

/** Bullets for one member, from their EOD (slack_scan) or typed text (manual_entry). */
export function memberBullets(member: MemberInput, eods: EodInput[] | undefined, manualText: string | undefined): DraftBullet[] {
  if (member.tracking === "slack_scan") {
    const parsed = (eods ?? []).flatMap((e) =>
      parseEod(e.text, e.keyword).map<DraftBullet>((b) => ({ text: prefixName(member.name, b), source: "eod", source_ref: member.personId, source_url: e.url ?? null })),
    );
    return parsed.length ? parsed : [{ text: awaitedLine(member.name), source: "missing_eod", source_ref: member.personId }];
  }
  if (member.tracking === "manual_entry") {
    return (manualText ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ text: prefixName(member.name, l.replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, "")), source: "manual_entry" as const, source_ref: member.personId }));
  }
  return [];
}

/** Normalises text and drops duplicates (first one wins). */
export function finalize(bullets: DraftBullet[]): DraftBullet[] {
  const seen = new Set<string>();
  const out: DraftBullet[] = [];
  for (const b of bullets) {
    const text = normalizeBullet(b.text);
    const key = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...b, text });
  }
  return out;
}

export const ruleBasedAssembler: DraftAssembler = {
  assemble(input) {
    const scan = input.members.filter((m) => m.tracking === "slack_scan");
    const manual = input.members.filter((m) => m.tracking === "manual_entry");
    const eodBullets = scan.flatMap((m) => memberBullets(m, input.eods[m.personId], undefined));
    return finalize([
      ...eodBullets.filter((b) => b.source === "eod"), // 1. EODs
      ...eodBullets.filter((b) => b.source === "missing_eod"), // 2. awaited
      ...manual.flatMap((m) => memberBullets(m, undefined, input.manualEntries[m.personId])), // 3. manual entry
      ...input.doneTodos.map<DraftBullet>((t) => ({ text: t.text, source: "todo", source_ref: t.id })), // 4. to-dos
      ...input.callPoints.map<DraftBullet>((c) => ({ text: c.text, source: "client_call", source_ref: c.id, source_url: c.url })), // 5.
      ...input.standupLines.map<DraftBullet>((s) => ({ text: s.text, source: "standup", source_ref: s.id, source_url: s.url })), // 6.
      ...input.pinned.map<DraftBullet>((p) => ({ text: p.text, source: "pinned", source_ref: p.id })), // 7. pinned
    ]);
  },
};

/**
 * Replaces one member's bullets in an edited list, keeping the PM's other
 * edits and order. New bullets go where the old ones were (or by section).
 */
export function replaceMemberBullets(current: DraftBullet[], personId: string, next: DraftBullet[]): DraftBullet[] {
  const isMine = (b: DraftBullet) => b.source_ref === personId && ["eod", "missing_eod", "manual_entry"].includes(b.source);
  const first = current.findIndex(isMine);
  const rest = current.filter((b) => !isMine(b));
  let at = first;
  if (at < 0) {
    // After the last person-sourced bullet, else at the top.
    const lastPerson = rest.map((b) => ["eod", "missing_eod", "manual_entry"].includes(b.source)).lastIndexOf(true);
    at = lastPerson + 1;
  } else {
    at = current.slice(0, first).filter((b) => !isMine(b)).length;
  }
  return finalize([...rest.slice(0, at), ...next, ...rest.slice(at)]);
}
