/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(timezone?: string | null, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True when an ISO date (YYYY-MM-DD) is today or earlier. */
export function isDue(isoDate: string | undefined | null, today: string): boolean {
  return Boolean(isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) && isoDate <= today);
}
