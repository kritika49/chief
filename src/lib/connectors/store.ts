import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptJson, encryptJson } from "@/lib/crypto";

export type Provider = "google" | "slack" | "fathom";
export type ConnectionStatus = "connected" | "needs_attention" | "not_connected";

export type ConnectionRow = {
  id: string;
  user_id: string;
  provider: Provider;
  status: ConnectionStatus;
  account_label: string | null;
  credentials_encrypted: string | null;
  webhook_id: string | null;
  settings: Record<string, unknown>;
  last_sync_at: string | null;
  last_error: string | null;
};

// All connection writes go through the service role: the browser-facing role
// can only read non-secret columns (see migration).

export async function getConnection(userId: string, provider: Provider): Promise<ConnectionRow | null> {
  const { data } = await createAdminClient()
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

export async function getCredentials<T>(userId: string, provider: Provider): Promise<T | null> {
  const row = await getConnection(userId, provider);
  if (!row?.credentials_encrypted) return null;
  return decryptJson<T>(row.credentials_encrypted);
}

export async function saveConnection(
  userId: string,
  provider: Provider,
  patch: {
    status?: ConnectionStatus;
    account_label?: string | null;
    credentials?: Record<string, unknown> | null;
    webhook_id?: string | null;
    settings?: Record<string, unknown>;
    last_sync_at?: string | null;
    last_error?: string | null;
  },
) {
  const { credentials, ...rest } = patch;
  const row: Record<string, unknown> = { user_id: userId, provider, ...rest };
  if (credentials !== undefined) {
    row.credentials_encrypted = credentials ? encryptJson(credentials) : null;
  }
  const { error } = await createAdminClient()
    .from("connections")
    .upsert(row, { onConflict: "user_id,provider" });
  if (error) throw new Error(`Couldn't save the ${provider} connection: ${error.message}`);
}

export async function markSynced(userId: string, provider: Provider) {
  await saveConnection(userId, provider, {
    status: "connected",
    last_sync_at: new Date().toISOString(),
    last_error: null,
  });
}

export async function markNeedsAttention(userId: string, provider: Provider, message: string) {
  await saveConnection(userId, provider, { status: "needs_attention", last_error: message });
}

export async function disconnect(userId: string, provider: Provider) {
  await createAdminClient().from("connections").delete().eq("user_id", userId).eq("provider", provider);
}
