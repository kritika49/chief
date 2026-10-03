"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";

const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  role: z.enum(["dev", "design", "qa", "other"]),
  email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right.")]),
  slack_user_id: z.union([z.literal(""), z.string().trim().regex(/^[UW][A-Z0-9]{6,}$/, "Slack member IDs start with U, e.g. U03JSSBKDL4.")]),
  aliases: z.string().default(""),
});

function read(formData: FormData) {
  return personSchema.safeParse({
    name: formData.get("name"),
    role: formData.get("role"),
    email: String(formData.get("email") ?? ""),
    slack_user_id: String(formData.get("slack_user_id") ?? "").toUpperCase(),
    aliases: String(formData.get("aliases") ?? ""),
  });
}

async function saveAliases(personId: string, aliases: string) {
  const supabase = await createClient();
  await supabase.from("person_aliases").delete().eq("person_id", personId);
  const list = [...new Set(aliases.split(",").map((a) => a.trim()).filter(Boolean))];
  if (list.length) await supabase.from("person_aliases").insert(list.map((alias) => ({ person_id: personId, alias })));
}

function done(message: string): ActionResult {
  revalidatePath("/settings/people");
  revalidatePath("/settings/projects", "layout");
  revalidatePath("/draft");
  return { ok: true, message };
}

export async function createPerson(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const r = read(formData);
  if (!r.success) return { ok: false, message: r.error.issues[0].message };
  const supabase = await createClient();
  const { aliases, ...rest } = r.data;
  const { data, error } = await supabase
    .from("people")
    .insert({ ...rest, email: rest.email || null, slack_user_id: rest.slack_user_id || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't add the person." };
  await saveAliases(data.id, aliases);
  return done(`Added ${rest.name}.`);
}

export async function updatePerson(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  if (formData.get("remove") === "1") {
    await supabase.from("people").delete().eq("id", id);
    return done("Removed.");
  }
  const r = read(formData);
  if (!r.success) return { ok: false, message: r.error.issues[0].message };
  const { aliases, ...rest } = r.data;
  await supabase.from("people").update({ ...rest, email: rest.email || null, slack_user_id: rest.slack_user_id || null }).eq("id", id);
  await saveAliases(id, aliases);
  return done("Saved.");
}
