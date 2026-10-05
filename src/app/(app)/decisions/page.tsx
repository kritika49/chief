import Link from "next/link";
import { Gavel, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionForm } from "@/components/action-form";
import { dMon } from "@/lib/meetings/text";
import { addDecision } from "./actions";

export const metadata = { title: "Decisions · Chief" };

type Row = { id: string; text: string; decided_on: string; meeting_id: string | null; project: { name: string } | null; meeting: { title: string | null } | null };

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; from?: string; to?: string }> }) {
  await requireUser();
  const { q = "", project = "", from = "", to = "" } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("decisions").select("id, text, decided_on, meeting_id, project:projects(name), meeting:meetings(title)").order("decided_on", { ascending: false }).limit(200);
  if (q.trim()) query = query.ilike("text", `%${q.trim().replace(/[%_]/g, "")}%`);
  if (project) query = query.eq("project_id", project);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("decided_on", from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("decided_on", to);
  const [{ data }, { data: projects }] = await Promise.all([query, supabase.from("projects").select("id, name").order("sort_order")]);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Decision log" description="Decisions from client calls, searchable by project, date and keyword." />
      <form className="mb-6 grid gap-2 sm:grid-cols-[1fr_160px_150px_150px_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="Search decisions" />
        <Select name="project" defaultValue={project}>
          <option value="">All projects</option>
          {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input name="from" type="date" defaultValue={from} aria-label="From" />
        <Input name="to" type="date" defaultValue={to} aria-label="To" />
        <Button type="submit" variant="secondary"><Search /> Search</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={Gavel} title={q || project || from || to ? "No decisions match" : "No decisions logged yet"} description="When you review a client call, tag any summary line as a Decision and it's saved here with a link back to the call." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((d) => (
            <li key={d.id} className="px-4 py-3 text-sm">
              <div>{d.text}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {dMon(d.decided_on)} {d.decided_on.slice(0, 4)} · {d.project?.name ?? "—"}
                {d.meeting_id && <> · <Link href={`/meetings/${d.meeting_id}`} className="hover:underline">{d.meeting?.title ?? "source call"}</Link></>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Card className="mt-6 gap-3">
        <CardHeader><CardTitle className="text-base">Log a decision manually</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={addDecision} label="Log" variant="secondary">
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_150px]">
              <Input name="text" placeholder="e.g. Analytics will be covered by a separate PostHog dashboard" required />
              <Select name="project_id" defaultValue="" required>
                <option value="" disabled>Project…</option>
                {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input name="decided_on" type="date" aria-label="Date" />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
