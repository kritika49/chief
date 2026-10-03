/** "3 Oct, 14:05" in the user's timezone; "Never" if empty. */
export function formatDateTime(iso: string | null | undefined, timezone?: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone ?? undefined,
  }).format(new Date(iso));
}

/** Parses a fetch response as JSON, or throws a plain-language error. */
export async function readJson(res: Response, service: string): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Couldn't reach ${service} just now (status ${res.status}). Please try again in a minute.`);
  }
}
