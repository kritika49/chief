"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";
import { STARTER_OWNER_EMAIL, STARTER_PROJECTS, STARTER_TARGET_CHANNEL } from "@/lib/starter";

export async function loadStarterData(): Promise<ActionResult> {
  const user = await requireUser();
  if (user.email.toLowerCase() !== STARTER_OWNER_EMAIL) return { ok: false, message: "Starter data is only for the first PM's account." };
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("starter_data_loaded").eq("id", user.id).single();
  if (profile?.starter_data_loaded) return { ok: false, message: "Starter projects are already loaded." };

  const { data: existing } = await supabase.from("projects").select("name, sort_order");
  const names = new Set((existing ?? []).map((p) => p.name.toLowerCase()));
  let order = Math.max(-1, ...(existing ?? []).map((p) => p.sort_order)) + 1;
  const { data: peopleRows } = await supabase.from("people").select("id, name");
  const peopleByName = new Map((peopleRows ?? []).map((p) => [p.name.toLowerCase(), p.id as string]));

  for (const sp of STARTER_PROJECTS) {
    if (names.has(sp.name.toLowerCase())) continue;
    const { data: project, error } = await supabase
      .from("projects")
      .insert({ name: sp.name, type: sp.type, header: sp.header, sort_order: order++ })
      .select("id")
      .single();
    if (error || !project) return { ok: false, message: `Couldn't create ${sp.name}. Please try again.` };
    if (sp.channel) {
      await supabase.from("channels").insert({ project_id: project.id, slack_channel_id: sp.channel.id, slack_channel_name: sp.channel.name, is_primary: true });
    }
    for (const person of sp.people) {
      let personId = peopleByName.get(person.name.toLowerCase());
      if (!personId) {
        const { data: p } = await supabase
          .from("people")
          .insert({ name: person.name, role: person.role, email: person.email, slack_user_id: person.slack_user_id })
          .select("id")
          .single();
        personId = p?.id;
        if (personId) peopleByName.set(person.name.toLowerCase(), personId);
      }
      if (personId) {
        await supabase.from("project_members").insert({ project_id: project.id, person_id: personId, tracking_mode: person.tracking, nudge: person.nudge });
      }
    }
    for (const text of sp.pinned ?? []) await supabase.from("pinned_lines").insert({ project_id: project.id, text });
  }

  await supabase.from("preferences").update({ target_channel_ids: [STARTER_TARGET_CHANNEL.id] }).eq("user_id", user.id);
  await supabase.from("profiles").update({ starter_data_loaded: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  redirect("/settings/projects?loaded=1");
}
