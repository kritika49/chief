// Rule-based EOD parsing (Section 8.1). Pure functions — no I/O.

/** Converts Slack markup to plain text: mentions, links, bold/italic/code/strike. */
export function slackToPlain(text: string, names: Record<string, string> = {}): string {
  return text
    .replace(/<@([UW][A-Z0-9]+)\|([^>]+)>/g, (_, _id, name) => `@${name}`)
    .replace(/<@([UW][A-Z0-9]+)>/g, (_, id) => (names[id] ? `@${names[id]}` : "@someone"))
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,:;!?]|$)/gm, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,:;!?]|$)/gm, "$1$2")
    .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,:;!?]|$)/gm, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(^|[^A-Za-z])${escapeRegex(keyword)}([^A-Za-z]|$)`, "i").test(slackToPlain(text));
}

const MARKER = /^(\s*)(?:[-*•◦▪‣·]|\d{1,2}[.)])\s+/;
const FILLER =
  /\b(update|updates|today|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|\d{1,2}(st|nd|rd|th)?)\b/gi;

/**
 * If a line is just the EOD heading ("*EOD Update 01 Oct: @Kritika*"), returns
 * the content after it ("" when nothing); returns null if not a heading line.
 */
function headingRemainder(line: string, keyword: string): string | null {
  const stripped = line.replace(MARKER, "").trim();
  const re = new RegExp(`^${escapeRegex(keyword)}(?![A-Za-z])`, "i");
  if (!re.test(stripped)) return null;
  const rest = stripped.replace(re, "");
  const colon = rest.indexOf(":");
  const before = colon >= 0 ? rest.slice(0, colon) : rest;
  const after = colon >= 0 ? rest.slice(colon + 1) : "";
  const leftover = (s: string) => s.replace(/@[\w.]+(\s[\w.]+)?/g, "").replace(FILLER, "").replace(/[\s:,\-–—()*]/g, "");
  if (leftover(before) !== "") return null; // keyword used mid-sentence
  return leftover(after) === "" ? "" : after.replace(/^\s*@[\w.]+(\s[\w.]+)?\s*/, "").trim();
}

type Item = { text: string; subs: string[] };

/**
 * Turns one EOD message into bullets:
 * - drops the heading line(s) containing the keyword
 * - splits on lines starting with -, *, •, or numbering; strips markers
 * - indented sub-bullets are folded into their parent "(a; b)"
 * - unmarked lines after a bullet continue that bullet; before any bullet they
 *   act as a lead-in ("Fixed these bugs: BLE-1")
 * - no bullet lines at all → each non-empty line is a bullet
 */
export function parseEod(raw: string, keyword = "EOD", names: Record<string, string> = {}): string[] {
  const lines = slackToPlain(raw, names).split(/\r?\n/);
  const content: string[] = [];
  for (const line of lines) {
    const rem = headingRemainder(line, keyword);
    if (rem === null) content.push(line);
    else if (rem) content.push(rem);
  }

  const hasMarkers = content.some((l) => MARKER.test(l));
  if (!hasMarkers) {
    return clean(content.map((l) => l.trim()).filter(Boolean));
  }

  const indentOf = (l: string) => (l.match(MARKER)?.[1] ?? "").replace(/\t/g, "    ").length;
  const baseIndent = Math.min(...content.filter((l) => MARKER.test(l)).map(indentOf));
  const items: Item[] = [];
  let leadIn: string | null = null;
  for (const line of content) {
    if (!line.trim()) continue;
    const m = line.match(MARKER);
    if (m) {
      const indent = indentOf(line);
      const text = line.replace(MARKER, "").replace(MARKER, "").trim(); // "• - text" double markers
      if (!text) continue;
      if (indent > baseIndent && items.length) items[items.length - 1].subs.push(text);
      else items.push({ text: leadIn ? `${leadIn.replace(/[:.]\s*$/, "")}: ${text}` : text, subs: [] });
    } else if (items.length) {
      const last = items[items.length - 1];
      if (last.subs.length) last.subs[last.subs.length - 1] += ` ${line.trim()}`;
      else last.text = `${last.text.replace(/:\s*$/, ":")} ${line.trim()}`;
    } else {
      leadIn = leadIn ? `${leadIn} ${line.trim()}` : line.trim();
    }
  }
  return clean(items.map((i) => (i.subs.length ? `${i.text.replace(/[:.]\s*$/, "")} (${i.subs.map(stripEnd).join("; ")})` : i.text)));
}

function stripEnd(s: string) {
  return s.trim().replace(/[.;,]+$/, "");
}

function clean(bullets: string[]): string[] {
  return bullets.map((b) => b.replace(/\s+/g, " ").trim()).filter((b) => b.length > 0 && /[A-Za-z0-9]/.test(b));
}

/** Simple blocker detection on a bullet (Section 10). */
export function isBlocker(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => new RegExp(`(^|[^a-z])${escapeRegex(k.toLowerCase())}([^a-z]|$)`).test(t));
}
