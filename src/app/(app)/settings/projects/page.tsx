import Link from "next/link";
import { ArrowDown, ArrowUp, FolderKanban, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, ResultLine } from "@/components/action-form";
import { StarterDataCard } from "@/components/starter-data-card";
import { TYPE_LABEL, type Project } from "@/lib/types";
import { moveProject, setArchived } from "./actions";

export const metadata = { title: "Projects · Chief" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ loaded?: string }> }) {
  const user = await requireUser();
  const { loaded } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id, name, type, header, sort_order, active").order("sort_order");
  const projects = (data ?? []) as Project[];
  const active = projects.filter((p) => p.active);
  const archived = projects.filter((p) => !p.active);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Order here is the order in your daily update."
        actions={
          <Button asChild>
            <Link href="/settings/projects/new">
              <Plus /> New project
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        {loaded && <ResultLine ok message="Loaded Bles, Dontbelated and Italica with their channels and team. Open a project to check its details." />}
        <StarterDataCard email={user.email} />
        {active.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Add each project you report on. You'll set its status line, Slack channel and team, and it will appear in your daily update."
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {active.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-3 sm:px-4">
                <div className="flex flex-col">
                  <MoveButton id={p.id} dir="up" disabled={i === 0} />
                  <MoveButton id={p.id} dir="down" disabled={i === active.length - 1} />
                </div>
                <Link href={`/settings/projects/${p.id}`} className="min-w-0 flex-1 rounded-md px-2 py-1 hover:bg-accent">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_LABEL[p.type]}</div>
                </Link>
                <Badge variant="outline">{i + 1}</Badge>
              </li>
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Archived</h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {archived.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link href={`/settings/projects/${p.id}`} className="text-sm text-muted-foreground hover:underline">
                    {p.name}
                  </Link>
                  <ActionForm action={setArchived} label="Restore" variant="outline">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="archive" value="0" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function MoveButton({ id, dir, disabled }: { id: string; dir: "up" | "down"; disabled: boolean }) {
  return (
    <form action={async (fd) => { "use server"; await moveProject(null, fd); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dir" value={dir} />
      <Button type="submit" variant="ghost" size="icon" className="size-7" disabled={disabled} aria-label={`Move ${dir}`}>
        {dir === "up" ? <ArrowUp /> : <ArrowDown />}
      </Button>
    </form>
  );
}
