import "server-only";

/** Reads a required server-side environment variable. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value || value.startsWith("PASTE_")) {
    throw new Error(
      `Missing setting ${name}. Add it to .env.local (locally) or Netlify environment variables.`,
    );
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** True if this email may sign in (its domain is in ALLOWED_EMAIL_DOMAINS). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domains = list("ALLOWED_EMAIL_DOMAINS");
  if (domains.length === 0) return false;
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return domains.includes(domain);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return list("ADMIN_EMAILS").includes(email.toLowerCase());
}
