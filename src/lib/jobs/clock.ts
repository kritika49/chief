// Local-time helpers for the scheduler. Pure.

export type LocalNow = { date: string; time: string; minutes: number; weekday: number };

export function localNow(timezone: string | null | undefined, now = new Date()): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  const time = `${parts.hour}:${parts.minute}`;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

export function toMinutes(hhmm: string | null | undefined): number | null {
  const m = (hhmm ?? "").match(/^(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** True when `now` is at/after `at` and less than `windowMin` minutes past it. */
export function isDueNow(now: LocalNow, at: string | null | undefined, windowMin = 180): boolean {
  const t = toMinutes(at);
  return t !== null && now.minutes >= t && now.minutes - t < windowMin;
}
