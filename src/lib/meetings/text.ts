// Helpers for Fathom text. Pure.

/** Splits Fathom's markdown summary into plain lines (headings and empty lines dropped). */
export function summaryLines(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^[-*_]{3,}$/.test(l))
    .map((l) =>
      l
        .replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, "")
        .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,;:!?])/g, "$1$2")
        .replace(/`([^`]+)`/g, "$1")
        .trim(),
    )
    .filter((l) => l.length > 2 && /[A-Za-z]/.test(l) && !/^(summary|key takeaways|next steps|action items|topics?)\s*:?$/i.test(l));
}

export type PersonLite = { id: string; name: string; email: string | null; aliases: string[] };

/** Matches a Fathom assignee to a person by email, name or alias (case-insensitive). */
export function matchPerson(assignee: { name?: string | null; email?: string | null } | null | undefined, people: PersonLite[]): PersonLite | null {
  if (!assignee) return null;
  const email = assignee.email?.toLowerCase().trim();
  if (email) {
    const byEmail = people.find((p) => p.email?.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = assignee.name?.toLowerCase().trim();
  if (!name) return null;
  const exact = people.find((p) => p.name.toLowerCase() === name || p.aliases.some((a) => a.toLowerCase() === name));
  if (exact) return exact;
  const first = name.split(/\s+/)[0];
  const byFirst = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dMon(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  }
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone ?? undefined }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "day")?.value} ${parts.find((p) => p.type === "month")?.value}`;
}

/** Standup task message (Section 8.4). Unmatched people are written by name. */
export function standupMessage(dateLabel: string, tasks: { slackUserId: string | null; name: string | null; text: string; due: string | null }[]): string {
  const lines = tasks.map((t) => {
    const who = t.slackUserId ? `<@${t.slackUserId}>` : t.name ? `${t.name}:` : "";
    const due = t.due ? ` (due ${dMon(t.due)})` : "";
    return `• ${who ? `${who} ` : ""}${t.text.trim().replace(/\.$/, "")}${due}`;
  });
  return [`Standup tasks — ${dateLabel}`, ...lines].join("\n");
}

export type MinutesInput = {
  project: string;
  title: string;
  date: string; // "5 Oct"
  greeting: string;
  signoff: string;
  senderName: string;
  points: string[];
  decisions: string[];
  actions: { text: string; owner: string | null; due: string | null }[];
  nextCall: string | null;
};

export function minutesSubject(project: string, date: string) {
  return `Meeting Minutes — ${project} — ${date}`;
}

export function minutesText(m: MinutesInput): string {
  const out: string[] = [m.greeting, "", `Thanks for your time today. Here are the minutes from our call on ${m.date}.`, ""];
  if (m.points.length) out.push("Key points:", ...m.points.map((p) => `• ${p}`), "");
  if (m.decisions.length) out.push("Decisions:", ...m.decisions.map((d) => `• ${d}`), "");
  if (m.actions.length) {
    out.push("Action items:", ...m.actions.map((a) => `• ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (by ${dMon(a.due)})` : ""}`), "");
  }
  if (m.nextCall) out.push(`Next call: ${m.nextCall}`, "");
  out.push(m.signoff, m.senderName);
  return out.join("\n");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function minutesHtml(m: MinutesInput): string {
  const list = (title: string, items: string[]) => (items.length ? `<p><b>${esc(title)}</b></p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  return [
    `<p>${esc(m.greeting)}</p>`,
    `<p>Thanks for your time today. Here are the minutes from our call on ${esc(m.date)}.</p>`,
    list("Key points", m.points),
    list("Decisions", m.decisions),
    list("Action items", m.actions.map((a) => `${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (by ${dMon(a.due)})` : ""}`)),
    m.nextCall ? `<p><b>Next call:</b> ${esc(m.nextCall)}</p>` : "",
    `<p>${esc(m.signoff)}<br>${esc(m.senderName)}</p>`,
  ].join("");
}
