"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

const num = (v: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function savePreferences(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const tz = String(formData.get("timezone") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return { ok: false, message: "That timezone isn't recognised, e.g. Asia/Kolkata." };
  }
  const channels = String(formData.get("target_channel_ids") ?? "").split(/[\s,]+/).map((c) => c.split("|")[0].trim().toUpperCase()).filter(Boolean);
  if (channels.some((c) => !/^[CG][A-Z0-9]{6,}$/.test(c))) return { ok: false, message: "Channel IDs start with C and are about 11 characters, e.g. C027NN9JC7M." };

  const workingDays = formData.getAll("working_days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!workingDays.length) return { ok: false, message: "Pick at least one working day." };
  const high = num(formData.get("match_high_threshold"), 0.1, 1);
  const medium = num(formData.get("match_medium_threshold"), 0.05, 1);
  const stale = num(formData.get("stale_task_days"), 1, 30);
  if (high === null || medium === null || stale === null) return { ok: false, message: "Some values are missing or out of range." };
  if (medium >= high) return { ok: false, message: "The 'suggest' threshold must be lower than the 'auto-match' threshold." };
  const blockers = String(formData.get("blocker_keywords") ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("preferences")
    .update({
      timezone: tz,
      target_channel_ids: channels,
      working_days: workingDays,
      email_greeting: String(formData.get("email_greeting") ?? "").trim() || "Hi all,",
      email_signoff: String(formData.get("email_signoff") ?? "").trim() || "Best regards,",
      auto_gmail_draft: formData.get("auto_gmail_draft") === "on",
      blocker_keywords: blockers,
      match_high_threshold: high,
      match_medium_threshold: medium,
      stale_task_days: stale,
      notifications: {
        dev_nudges: formData.get("n_dev_nudges") === "on",
        pm_nightly: formData.get("n_pm_nightly") === "on",
      },
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, message: "Couldn't save. Please try again." };
  revalidatePath("/settings/preferences");
  revalidatePath("/draft");
  return { ok: true, message: "Saved." };
}
