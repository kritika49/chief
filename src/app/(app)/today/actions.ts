"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const tzSchema = z.string().min(1).max(64).refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

/** Saves the browser's timezone the first time the user opens Chief. */
export async function saveTimezone(timezone: string) {
  const user = await requireUser();
  const tz = tzSchema.safeParse(timezone);
  if (!tz.success) return;
  const supabase = await createClient();
  await supabase.from("preferences").update({ timezone: tz.data }).eq("user_id", user.id).is("timezone", null);
}
