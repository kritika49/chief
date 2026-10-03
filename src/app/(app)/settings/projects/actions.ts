"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/action-form";
import { logHeaderChanges } from "@/lib/header-history";
import { checkChannel, slackConfigured } from "@/lib/connectors/slack";
import { HEADER_FIELDS, type ProjectHeader, type ProjectType } from "@/lib/types";

const projectType = z.enum(["dev", "design_pm"]);
const trackingMode = z.enum(["slack_scan", "manual_entry", "none"]);

function done(id?: string, message = "Saved."): ActionResult {
  revalidatePath("/settings/projects", "layout");
  if (id) revalidatePath(`/settings/projects/${id}`);
  revalidatePath("/draft");
  revalidatePath("/today");
  return { ok: true, message };
}

export async function createProject(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Give the project a name.").max(80), type: projectType })
    .safeParse({ name: formData.get("name"), type: formData.get("type") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: last } = await supabase.from("projects").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: parsed.data.name, type: parsed.data.type, sort_order: (last?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Couldn't create the project. Please try again." };
  revalidatePath("/settings/projects", "layout");
  redirect(`/settings/projects/${data.id}?created=1`);
}

export async function saveGeneral(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const type = projectType.safeParse(formData.get("type"));
  if (!name || !type.success) return { ok: false, message: "Name and type are required." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("projects").select("type, header").eq("id", id).single();
  if (!current) return { ok: false, message: "Project not found." };

  const oldHeader = (current.header ?? {}) as ProjectHeader;
  const newHeader: ProjectHeader = { ...oldHeader };
  for (const t of ["dev", "design_pm"] as ProjectType[]) {
    for (const f of HEADER_FIELDS[t]) {
      if (formData.has(f.key)) newHeader[f.key] = String(formData.get(f.key) ?? "").trim();
    }
  }
  const { error } = await supabase.from("projects").update({ name, type: type.data, header: newHeader }).eq("id", id);
  if (error) return { ok: false, message: "Couldn't save. Please try again." };
  await logHeaderChanges(id, oldHeader, newHeader);
  return done(id);
}

export async function moveProject(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = String(formData.get("id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: list } = await supabase.from("projects").select("id, sort_order").eq("active", true).order("sort_order");
  if (!list) return null;
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  await Promise.all(list.map((p, idx) => supabase.from("projects").update({ sort_order: idx }).eq("id", p.id)));
  return done(undefined, "Order saved.");
}

export async function setArchived(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const archive = formData.get("archive") === "1";
  const supabase = await createClient();
  await supabase.from("projects").update({ active: !archive }).eq("id", id);
  return done(id, archive ? "Archived. It won't appear in drafts or reminders." : "Restored.");
}

// ---- Channels -------------------------------------------------------------

export async function addChannel(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const raw = String(formData.get("channel") ?? "");
  const manualId = String(formData.get("channel_id") ?? "").trim();
  // Manual ID wins (private channels); else the picker's "C123|name".
  let [channelId, channelName] = manualId || !raw.includes("|") ? [manualId, String(formData.get("channel_name") ?? "")] : raw.split("|");
  channelId = channelId.trim().toUpperCase();
  channelName = channelName.trim().replace(/^#/, "");
  if (!/^[CG][A-Z0-9]{6,}$/.test(channelId)) {
    return { ok: false, message: "That channel ID doesn't look right. It starts with C and is about 11 characters (see the hint)." };
  }
  let warning = "";
  if (slackConfigured()) {
    const check = await checkChannel(channelId);
    if (check.name && !channelName) channelName = check.name;
    if (!check.member) warning = ` Chief isn't in it yet — type /invite @chief in the channel.`;
    else if (!check.readable) warning = ` Chief is in it but can't read it: ${check.problem}`;
  }
  const keyword = String(formData.get("eod_keyword") ?? "").trim() || "EOD";
  const supabase = await createClient();
  const { count } = await supabase.from("channels").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { error } = await supabase.from("channels").insert({
    project_id: projectId,
    slack_channel_id: channelId,
    slack_channel_name: channelName || null,
    eod_keyword: keyword,
    is_primary: (count ?? 0) === 0,
  });
  if (error) return { ok: false, message: error.code === "23505" ? "That channel is already added." : "Couldn't add the channel." };
  return done(projectId, `Channel added.${warning}`);
}

export async function updateChannel(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const supabase = await createClient();
  if (formData.get("remove") === "1") {
    await supabase.from("channels").delete().eq("id", id);
    return done(projectId, "Channel removed.");
  }
  const isPrimary = formData.get("is_primary") === "on";
  if (isPrimary) await supabase.from("channels").update({ is_primary: false }).eq("project_id", projectId);
  await supabase
    .from("channels")
    .update({
      eod_keyword: String(formData.get("eod_keyword") ?? "").trim() || "EOD",
      active: formData.get("active") === "on",
      is_primary: isPrimary,
    })
    .eq("id", id);
  return done(projectId);
}

// ---- Members --------------------------------------------------------------

export async function addMember(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const mode = trackingMode.parse(formData.get("tracking_mode") ?? "slack_scan");
  const supabase = await createClient();
  let personId = String(formData.get("person_id") ?? "");
  const newName = String(formData.get("new_name") ?? "").trim();
  if (!personId && newName) {
    const role = z.enum(["dev", "design", "qa", "other"]).catch("dev").parse(formData.get("role"));
    const { data, error } = await supabase.from("people").insert({ name: newName, role }).select("id").single();
    if (error || !data) return { ok: false, message: "Couldn't add the person." };
    personId = data.id;
  }
  if (!personId) return { ok: false, message: "Pick a person or type a new name." };
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, person_id: personId, tracking_mode: mode, nudge: mode === "slack_scan" });
  if (error) return { ok: false, message: error.code === "23505" ? "They're already on this project." : "Couldn't add them." };
  revalidatePath("/settings/people");
  return done(projectId, "Added to the project.");
}

export async function updateMember(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const supabase = await createClient();
  if (formData.get("remove") === "1") {
    await supabase.from("project_members").delete().eq("id", id);
    return done(projectId, "Removed from the project.");
  }
  await supabase
    .from("project_members")
    .update({ tracking_mode: trackingMode.parse(formData.get("tracking_mode")), nudge: formData.get("nudge") === "on" })
    .eq("id", id);
  return done(projectId);
}

// ---- Pinned lines ---------------------------------------------------------

export async function addPinned(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { ok: false, message: "Type the line to pin." };
  const supabase = await createClient();
  await supabase.from("pinned_lines").insert({ project_id: projectId, text });
  return done(projectId, "Pinned. It will appear in every update until you unpin it.");
}

export async function removePinned(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = z.string().uuid().parse(formData.get("id"));
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const supabase = await createClient();
  await supabase.from("pinned_lines").update({ active: false }).eq("id", id);
  return done(projectId, "Unpinned.");
}
