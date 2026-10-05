"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

const uuid = z.string().uuid();
function refresh(): ActionResult {
  revalidatePath("/tracker");
  revalidatePath("/today");
  return { ok: true, message: "Saved." };
}

export async function setFollowupStatus(id: string, status: "open" | "done" | "cancelled") {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("followups").update({ status: z.enum(["open", "done", "cancelled"]).parse(status), done_at: status === "done" ? new Date().toISOString() : null }).eq("id", uuid.parse(id));
  return refresh();
}

export async function addFollowup(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const text = String(formData.get("text") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "");
  const due = String(formData.get("due_date") ?? "");
  if (!text || !uuid.safeParse(projectId).success) return { ok: false, message: "Add the follow-up and choose a project." };
  const supabase = await createClient();
  await supabase.from("followups").insert({ text, project_id: projectId, owner_name: String(formData.get("owner_name") ?? "").trim() || null, due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null });
  return refresh();
}

export async function setTaskStatus(id: string, status: "open" | "done") {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("action_items").update({ status: z.enum(["open", "done"]).parse(status), done_at: status === "done" ? new Date().toISOString() : null }).eq("id", uuid.parse(id));
  return refresh();
}

/** confirm (suggested → done), reject (never suggest again), undo (auto → reopen). */
export async function resolveMatch(matchId: string, action: "confirm" | "reject" | "undo") {
  await requireUser();
  const supabase = await createClient();
  const { data: m } = await supabase.from("task_matches").select("id, task_id").eq("id", uuid.parse(matchId)).single();
  if (!m) return { ok: false, message: "Match not found." };
  const status = action === "confirm" ? "confirmed" : action === "reject" ? "rejected" : "undone";
  await supabase.from("task_matches").update({ status }).eq("id", m.id);
  if (action === "confirm") await supabase.from("action_items").update({ status: "done", done_at: new Date().toISOString() }).eq("id", m.task_id);
  if (action === "undo") await supabase.from("action_items").update({ status: "open", done_at: null }).eq("id", m.task_id);
  return refresh();
}
