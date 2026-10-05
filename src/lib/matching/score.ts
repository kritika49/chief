// Standup task ↔ EOD bullet matching (Section 8.5). Pure, rule-based.

const STOP = new Set(
  "a an the and or but of to in on for with by from at as is are was were be been being it its this that these those i we you he she they them my our your their me us do did done doing have has had will would can could should may might also just more most some any all not no yes so than then there here into over under about after before up down out off again further once both each few other such only own same too very via per vs etc today tomorrow yesterday worked working work task tasks update updates eod".split(" "),
);

function stem(w: string) {
  return w.replace(/(ing|ed|es|s)$/, "");
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`*_~"“”'’()[\]{}<>:;,.!?/\\|]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/** Capitalised words (not sentence-initial), quoted terms and ticket keys like BLE-155. */
export function specialTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/["“']([^"”']{2,40})["”']/g)) out.add(m[1].toLowerCase().trim());
  for (const m of text.matchAll(/\b[A-Z]{2,}-\d+\b/g)) out.add(m[0].toLowerCase());
  const words = text.split(/\s+/);
  words.forEach((w, i) => {
    const clean = w.replace(/[^A-Za-z0-9-]/g, "");
    if (i > 0 && /^[A-Z][A-Za-z0-9]+/.test(clean) && clean.length > 2) out.add(clean.toLowerCase());
  });
  return out;
}

/** 0..1 — share of the task's keywords found in the bullet, plus a boost for shared names/tickets. */
export function matchScore(task: string, bullet: string): number {
  const t = [...new Set(tokens(task))];
  if (!t.length) return 0;
  const b = new Set(tokens(bullet));
  const overlap = t.filter((w) => b.has(w)).length / t.length;
  const st = specialTerms(task);
  const sb = specialTerms(bullet);
  const shared = [...st].filter((x) => sb.has(x) || [...sb].some((y) => y.includes(x) || x.includes(y))).length;
  return Math.min(1, overlap + Math.min(0.3, shared * 0.15));
}
