"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

const time = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
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
  const evening = [0, 1, 2]
    .map((i) => ({ days: formData.getAll(`ev${i}_days`).map(Number).filter((d) => d >= 1 && d <= 7), time: time(formData.get(`ev${i}_time`)) }))
    .filter((e) => e.days.length && e.time);
  const morning = time(formData.get("morning_draft_time"));
  const cutoff = time(formData.get("eod_cutoff_time"));
  const lead = num(formData.get("pre_call_lead_minutes"), 5, 600);
  const high = num(formData.get("match_high_threshold"), 0.1, 1);
  const medium = num(formData.get("match_medium_threshold"), 0.05, 1);
  const stale = num(formData.get("stale_task_days"), 1, 30);
  if (!morning || !cutoff || lead === null || high === null || medium === null || stale === null) return { ok: false, message: "Some values are missing or out of range." };
  if (medium >= high) return { ok: false, message: "The 'suggest' threshold must be lower than the 'auto-match' threshold." };
  const blockers = String(formData.get("blocker_keywords") ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("preferences")
    .update({
      timezone: tz,
      target_channel_ids: channels,
      working_days: workingDays,
      morning_draft_time: morning,
      eod_cutoff_time: cutoff,
      evening_reminders: evening,
      pre_call_lead_minutes: lead,
      email_greeting: String(formData.get("email_greeting") ?? "").trim() || "Hi all,",
      email_signoff: String(formData.get("email_signoff") ?? "").trim() || "Best regards,",
      auto_gmail_draft: formData.get("auto_gmail_draft") === "on",
      blocker_keywords: blockers,
      match_high_threshold: high,
      match_medium_threshold: medium,
      stale_task_days: stale,
      notifications: {
        draft_ready: formData.get("n_draft_ready") === "on",
        pre_call_brief: formData.get("n_pre_call_brief") === "on",
        followup_due: formData.get("n_followup_due") === "on",
        evening_reminder: formData.get("n_evening_reminder") === "on",
      },
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, message: "Couldn't save. Please try again." };
  revalidatePath("/settings/preferences");
  revalidatePath("/draft");
  return { ok: true, message: "Saved." };
}
