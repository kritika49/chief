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
