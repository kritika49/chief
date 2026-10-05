"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { disconnect, getCredentials } from "@/lib/connectors/store";
import { deleteWebhook, type FathomCredentials } from "@/lib/connectors/fathom";
import type { GoogleCredentials } from "@/lib/connectors/google";
import type { ActionResult } from "@/components/action-form";

async function disconnectEverything(userId: string) {
  const google = await getCredentials<GoogleCredentials>(userId, "google").catch(() => null);
  if (google?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(google.refresh_token)}`, { method: "POST" }).catch(() => {});
  }
  const fathom = await getCredentials<FathomCredentials>(userId, "fathom").catch(() => null);
  if (fathom?.fathom_webhook_id) await deleteWebhook(fathom.api_key, fathom.fathom_webhook_id);
  for (const p of ["google", "fathom", "slack"] as const) await disconnect(userId, p);
  const supabase = await createClient();
  await supabase.from("profiles").update({ slack_user_id: null, slack_user_name: null }).eq("id", userId);
}

export async function disconnectAll(): Promise<ActionResult> {
  const user = await requireUser();
  await disconnectEverything(user.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Google, Slack and Fathom disconnected." };
}

/** Removes the account and every row it owns (all tables cascade from the user). */
export async function deleteMyData(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { ok: false, message: "Type DELETE to confirm." };
  }
  await disconnectEverything(user.id);
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: `Couldn't delete: ${error.message}` };
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in?error=" + encodeURIComponent("Your Chief account and data were deleted."));
}
