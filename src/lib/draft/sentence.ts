// Turns an EOD point into a sentence about the person (rule-based, no AI):
// "Worked on X" → "Shlok worked on X."; "Fix bugs" → "Manju fixed bugs.";
// "WIP: X" → "Shlok is working on X."; anything else → "Name: text".

const PAST: Record<string, string> = {
  add: "added", build: "built", check: "checked", clean: "cleaned", complete: "completed", configure: "configured",
  connect: "connected", create: "created", debug: "debugged", deploy: "deployed", design: "designed", discuss: "discussed",
  do: "did", explore: "explored", finish: "finished", fix: "fixed", follow: "followed", go: "went", handle: "handled",
  implement: "implemented", improve: "improved", integrate: "integrated", investigate: "investigated", make: "made",
  merge: "merged", migrate: "migrated", move: "moved", optimize: "optimized", optimise: "optimised", plan: "planned",
  prepare: "prepared", raise: "raised", refactor: "refactored", remove: "removed", research: "researched", resolve: "resolved",
  review: "reviewed", rewrite: "rewrote", set: "set", setup: "set up", share: "shared", start: "started", support: "supported",
  sync: "synced", test: "tested", update: "updated", upgrade: "upgraded", verify: "verified", work: "worked", write: "wrote",
  align: "aligned", analyse: "analysed", analyze: "analyzed", approve: "approved", arrange: "arranged", ask: "asked", assign: "assigned",
  book: "booked", brief: "briefed", call: "called", catch: "caught", chase: "chased", clarify: "clarified", close: "closed", collect: "collected",
  communicate: "communicated", compile: "compiled", confirm: "confirmed", coordinate: "coordinated", deliver: "delivered", demo: "demoed",
  document: "documented", draft: "drafted", email: "emailed", escalate: "escalated", finalise: "finalised", finalize: "finalized",
  gather: "gathered", get: "got", give: "gave", hand: "handed", host: "hosted", inform: "informed", introduce: "introduced", invite: "invited",
  launch: "launched", lead: "led", meet: "met", message: "messaged", nudge: "nudged", onboard: "onboarded", organise: "organised",
  organize: "organized", outline: "outlined", ping: "pinged", post: "posted", present: "presented", prioritise: "prioritised",
  prioritize: "prioritized", publish: "published", push: "pushed", put: "put", reach: "reached", read: "read", record: "recorded",
  release: "released", remind: "reminded", reply: "replied", reschedule: "rescheduled", respond: "responded", run: "ran",
  schedule: "scheduled", see: "saw", send: "sent", sign: "signed", submit: "submitted", summarise: "summarised", summarize: "summarized",
  take: "took", talk: "talked", track: "tracked", train: "trained", walk: "walked",
};
const IRREGULAR_PAST = new Set(["went", "built", "made", "did", "wrote", "set", "began", "took", "sent", "met", "got", "ran", "found", "led", "held", "gave", "rewrote", "brought", "spent", "kept"]);
const NOT_VERBS = new Set(["need", "speed", "feed", "seed", "red", "bed", "shed", "bled"]);

function lowerFirst(s: string) {
  // Keep acronyms / names (e.g. "API", "BLE-155", "EasyPost") as written.
  return /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+[A-Z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

export function toPersonSentence(name: string, raw: string): string {
  const text = raw.trim().replace(/[.;,]+$/, "");
  if (!text) return "";
  const wip = text.match(/^(?:wip|in progress|in-progress|working on|currently working on)\s*[:\-–—]?\s*(.+)$/i);
  if (wip) return `${name} is working on ${lowerFirst(wip[1])}`;
  const [first, ...rest] = text.split(/\s+/);
  const word = first.toLowerCase().replace(/[^a-z-]/g, "");
  const tail = rest.join(" ");
  if (/^[a-z]+ed$/.test(word) && word.length > 3 && !NOT_VERBS.has(word)) return `${name} ${word} ${tail}`.trim();
  if (IRREGULAR_PAST.has(word)) return `${name} ${word} ${tail}`.trim();
  if (PAST[word] && /^[A-Za-z]/.test(first) && tail) return `${name} ${PAST[word]} ${tail}`.trim();
  return `${name}: ${text}`;
}

/**
 * A ticked to-do becomes past tense for the update (the to-do itself keeps its wording):
 * "Share revised timeline with Patrick" → "Shared revised timeline with Patrick".
 * Unknown first words are left as written. A "(call 5 Oct)" tag is dropped.
 */
export function toPastTense(raw: string): string {
  const capital = /^[A-Z]/.test(raw.trim());
  let text = raw.trim().replace(/\s*\(call \d{1,2} [A-Z][a-z]{2}\)\s*$/, "");
  text = text.replace(/^(?:to\s+|todo:\s*|to-do:\s*)/i, "");
  const m = text.match(/^([A-Za-z]+)(\s+up)?\b([\s\S]*)$/);
  if (!m) return text;
  const word = m[1].toLowerCase();
  if (IRREGULAR_PAST.has(word) || (/^[a-z]+ed$/.test(word) && word.length > 3 && !NOT_VERBS.has(word))) return text;
  const past = PAST[word];
  if (!past) return text;
  const cased = capital ? past[0].toUpperCase() + past.slice(1) : past;
  return `${cased}${m[2] ?? ""}${m[3]}`;
}
