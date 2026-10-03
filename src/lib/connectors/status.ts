import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Status } from "@/components/status-badge";

export type ConnectionSummary = {
  provider: "google" | "slack" | "fathom";
  status: Status;
  account_label: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  webhook_id: string | null;
  settings: Record<string, unknown>;
};

/** Current user's connections (non-secret columns only). */
export async function myConnections(): Promise<Record<string, ConnectionSummary | undefined>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("provider, status, account_label, last_sync_at, last_error, webhook_id, settings");
  return Object.fromEntries((data ?? []).map((c) => [c.provider, c as ConnectionSummary]));
}

export async function myTimezone(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("preferences").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone ?? null;
}
