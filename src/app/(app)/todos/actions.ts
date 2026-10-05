"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message: string; id?: string };
const list = z.enum(["later", "today", "done"]);

function done(message = "Saved.", id?: string): Result {
  revalidatePath("/todos");
  revalidatePath("/today");
  return { ok: true, message, id };
}

export async function addTodo(projectId: string, text: string, to: "later" | "today"): Promise<Result> {
  await requireUser();
  const t = text.trim();
  if (!t) return { ok: false, message: "Type the to-do first." };
  if (t.length > 500) return { ok: false, message: "That's a bit long — keep it to one line." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("todos").insert({ project_id: z.string().uuid().parse(projectId), text: t, list: list.parse(to) }).select("id").single();
  if (error || !data) return { ok: false, message: "Couldn't add it. Please try again." };
  return done("Added.", data.id);
}

export async function moveTodo(id: string, to: "later" | "today" | "done"): Promise<Result> {
  await requireUser();
  const target = list.parse(to);
  const supabase = await createClient();
  await supabase
    .from("todos")
    .update({ list: target, done_at: target === "done" ? new Date().toISOString() : null })
    .eq("id", z.string().uuid().parse(id))
    .is("included_in_posted_update_id", null);
  return done();
}

export async function editTodo(id: string, text: string): Promise<Result> {
  await requireUser();
  const t = text.trim();
  if (!t) return { ok: false, message: "A to-do can't be empty." };
  const supabase = await createClient();
  await supabase.from("todos").update({ text: t }).eq("id", z.string().uuid().parse(id));
  return done();
}

export async function toggleBlocker(id: string, isBlocker: boolean): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("todos").update({ is_blocker: isBlocker }).eq("id", z.string().uuid().parse(id));
  return done();
}

export async function deleteTodo(id: string): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("todos").delete().eq("id", z.string().uuid().parse(id));
  return done("Deleted.");
}
