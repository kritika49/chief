// Daily update formatting (Sections 6 & 7). Pure functions — no I/O.

export const DIVIDER = "--------------------------------------------------";

export type DevHeader = { planned_vs_actual?: string; dev_completion?: string; launch?: string };
export type DesignHeader = { status?: string; design_started?: string };

export type DraftProject =
  | { name: string; type: "dev"; header: DevHeader; bullets: string[] }
  | { name: string; type: "design_pm"; header: DesignHeader; bullets: string[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" → "12 Oct". Empty → "—". */
export function formatDMon(isoDate?: string | null): string {
  if (!isoDate) return "—";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** Header dates in the update: "2026-10-12" → "12 Oct 2026" (the PM's format). */
export function formatHeaderDate(isoDate?: string | null): string {
  if (!isoDate) return "—";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${formatDMon(isoDate)} ${m[1]}` : isoDate;
}

/** Trim, normalise markers away, end with a period. */
export function normalizeBullet(text: string): string {
  let t = text.replace(/\s+/g, " ").trim().replace(/^(?:[-*•◦▪‣·]|\d{1,2}[.)])\s+/, "").trim();
  if (!t) return "";
  if (!/[.!?)]$/.test(t)) t += ".";
  else if (/\)$/.test(t) && !/[.!?]\)$/.test(t)) t += ".";
  return t;
}

/** Normalises, drops empties and case-insensitive duplicates, keeps order. */
export function cleanBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bullets) {
    const n = normalizeBullet(b);
    const key = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!n || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function prefixName(name: string, bullet: string): string {
  return `${name}: ${bullet}`;
}

export function awaitedLine(name: string): string {
  return `${name}'s update is awaited.`;
}

export function renderProject(p: DraftProject): string {
  const lines = [p.name];
  if (p.type === "dev") {
    lines.push(`Planned vs Actual: ${p.header.planned_vs_actual || "—"}`);
    lines.push(`Dev Completion: ${formatHeaderDate(p.header.dev_completion)}`);
    lines.push(`Launch: ${formatHeaderDate(p.header.launch)}`);
  } else {
    lines.push(`Status: ${p.header.status || "—"}`);
    lines.push(`Design Started: ${formatHeaderDate(p.header.design_started)}`);
  }
  lines.push("Key Updates:");
  const bullets = cleanBullets(p.bullets);
  if (bullets.length === 0) lines.push("• No updates.");
  for (const b of bullets) lines.push(`• ${b}`);
  return lines.join("\n");
}

/** The full Slack message: all projects in order, divider between each. */
export function renderUpdate(projects: DraftProject[]): string {
  return projects.map(renderProject).join(`\n${DIVIDER}\n`);
}
