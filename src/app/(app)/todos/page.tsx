import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TodoBoard, type TodoItem } from "./todo-board";

export const metadata = { title: "To-dos · Chief" };

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requireUser();
  const { project } = await searchParams;
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id, name").eq("active", true).order("sort_order");

  if (!projects?.length) {
    return (
      <>
        <PageHeader title="To-dos" description="Your checklist per project: Later, Today and Done." />
        <EmptyState
          icon={CheckSquare}
          title="Add a project first"
          description="To-dos live inside projects. Once you have a project, jot your PM tasks here; ticked ones become bullets in your next update."
          action={<Button asChild><Link href="/settings/projects">Go to Projects</Link></Button>}
        />
      </>
    );
  }

  const current = projects.find((p) => p.id === project) ?? projects[0];
  const [{ data: todos }, { data: counts }] = await Promise.all([
    supabase
      .from("todos")
      .select("id, text, list, source, is_blocker, done_at, meeting_id, included_in_posted_update_id, created_at, meeting:meetings(title, started_at)")
      .eq("project_id", current.id)
      .is("archived_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.from("todos").select("project_id").in("list", ["today"]).is("archived_at", null),
  ]);
  const todayCount = new Map<string, number>();
  for (const c of counts ?? []) todayCount.set(c.project_id, (todayCount.get(c.project_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="To-dos" description="Tick items off as you go — Done items become bullets in your next daily update." />
      <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Projects">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/todos?project=${p.id}`}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
              p.id === current.id && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {p.name}
            {todayCount.get(p.id) ? <span className="ml-1.5 opacity-80">· {todayCount.get(p.id)}</span> : null}
          </Link>
        ))}
      </nav>
      <TodoBoard key={current.id} projectId={current.id} initial={(todos ?? []) as unknown as TodoItem[]} />
    </>
  );
}
