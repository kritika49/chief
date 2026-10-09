import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { freshFetch } from "./fresh-fetch";

/**
 * Supabase client with the service role key. Bypasses RLS — use only in
 * server code for webhooks, scheduled jobs, and writing encrypted secrets.
 * Always filter by user_id explicitly.
 */
export function createAdminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: freshFetch },
  });
}
