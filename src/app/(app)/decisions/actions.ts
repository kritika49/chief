"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

export async function addDecision(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const date = String(formData.get("decided_on") ?? "");
  if (!text || !z.string().uuid().safeParse(projectId).success) return { ok: false, message: "Write the decision and choose a project." };
  const supabase = await createClient();
  await supabase.from("decisions").insert({ text, project_id: projectId, ...( /^\d{4}-\d{2}-\d{2}$/.test(date) ? { decided_on: date } : {}) });
  revalidatePath("/decisions");
  return { ok: true, message: "Logged." };
}
