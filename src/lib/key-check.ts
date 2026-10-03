import "server-only";

/**
 * Describes the saved service-role key WITHOUT revealing it: shape, length,
 * and (for legacy JWT keys) the role and project it belongs to.
 */
export function describeServiceKey(): { summary: string; problems: string[] } {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const problems: string[] = [];
  if (!raw) return { summary: "Not set", problems: ["The setting is empty for this site (check the box for this deploy context in Netlify)."] };
  const v = raw.trim();
  if (v !== raw) problems.push("It has spaces or line breaks at the start or end.");
  if (/^["']|["']$/.test(v)) problems.push("It is wrapped in quote marks — remove them.");
  if (/[^\x21-\x7e]/.test(v)) problems.push("It contains hidden or masked characters (like •).");
  const projectRef = (process.env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

  if (v.startsWith("sb_secret_")) return { summary: `New-style secret key (${v.length} characters)`, problems };
  if (v.startsWith("sb_publishable_")) {
    problems.push("This is the publishable key, not the secret one.");
    return { summary: "Publishable key", problems };
  }
  const parts = v.replace(/^["']|["']$/g, "").split(".");
  if (parts.length !== 3) {
    problems.push("It doesn't look like a Supabase key (a legacy key has three parts separated by dots).");
    return { summary: `Unknown format (${v.length} characters)`, problems };
  }
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string; ref?: string };
    if (claims.role !== "service_role") problems.push(`This is the "${claims.role ?? "unknown"}" key — copy the one labelled service_role.`);
    if (projectRef && claims.ref && claims.ref !== projectRef) problems.push(`It belongs to a different Supabase project (${claims.ref}), not ${projectRef}.`);
    return { summary: `Legacy key · role ${claims.role ?? "?"} · project ${claims.ref ?? "?"} · ${v.length} characters`, problems };
  } catch {
    problems.push("The key is cut off or altered (its middle part can't be read). Copy it again in full.");
    return { summary: `Damaged legacy key (${v.length} characters)`, problems };
  }
}
