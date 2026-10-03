"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function savePreferences(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const tz = String(formData.get("timezone") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return { ok: false, message: "That timezone isn't recognised, e.g. Asia/Kolkata." };
  }
  const channels = String(formData.get("target_channel_ids") ?? "")
    .split(/[\s,]+/)
    .map((c) => c.split("|")[0].trim().toUpperCase())
    .filter(Boolean);
  if (channels.some((c) => !/^[CG][A-Z0-9]{6,}$/.test(c))) {
    return { ok: false, message: "Channel IDs start with C and are about 11 characters, e.g. C027NN9JC7M." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("preferences")
    .update({
      timezone: tz,
      target_channel_ids: channels,
      email_greeting: String(formData.get("email_greeting") ?? "").trim() || "Hi all,",
      email_signoff: String(formData.get("email_signoff") ?? "").trim() || "Best regards,",
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, message: "Couldn't save. Please try again." };
  revalidatePath("/settings/preferences");
  revalidatePath("/draft");
  return { ok: true, message: "Saved." };
}
