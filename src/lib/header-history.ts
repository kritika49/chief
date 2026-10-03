import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProjectHeader } from "@/lib/types";

/** Records every header change (Section 5). */
export async function logHeaderChanges(projectId: string, oldH: ProjectHeader, newH: ProjectHeader) {
  const supabase = await createClient();
  const rows = (Object.keys(newH) as (keyof ProjectHeader)[])
    .filter((k) => (oldH[k] ?? "") !== (newH[k] ?? ""))
    .map((k) => ({ project_id: projectId, field: k, old_value: oldH[k] ?? null, new_value: newH[k] ?? null }));
  if (rows.length) await supabase.from("header_history").insert(rows);
}
