import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ActionForm } from "@/components/action-form";
import { ROLE_LABEL, type Person, type PersonRole } from "@/lib/types";
import { createPerson, updatePerson } from "./actions";

export const metadata = { title: "People · Chief" };

type PersonRow = Person & { aliases: { alias: string }[]; members: { project: { name: string } | null }[] };

export default async function PeoplePage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, name, role, email, slack_user_id, aliases:person_aliases(alias), members:project_members(project:projects(name))")
    .order("name");
  const people = (data ?? []) as unknown as PersonRow[];

  return (
    <>
      <PageHeader title="People" description="Everyone whose updates you report. One person can be on several projects." />
      <div className="space-y-6">
        {people.length === 0 && (
          <EmptyState icon={Users} title="No people yet" description="Add the developers, designers and QA you work with — or add them straight from a project's Team section." />
        )}
        {people.map((p) => (
          <Card key={p.id} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">
                {p.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {p.members.map((m) => m.project?.name).filter(Boolean).join(", ") || "Not on a project"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <ActionForm action={updatePerson} label="Save" variant="outline">
                <input type="hidden" name="id" value={p.id} />
                <PersonFields person={p} aliases={p.aliases.map((a) => a.alias).join(", ")} />
                <label className="flex items-center gap-2 text-sm text-destructive"><input type="checkbox" name="remove" value="1" /> Remove this person everywhere</label>
              </ActionForm>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader><CardTitle>Add a person</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createPerson} label="Add person" pendingLabel="Adding…">
              <PersonFields />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function PersonFields({ person, aliases }: { person?: Person; aliases?: string }) {
  const k = person?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`name-${k}`}>Name</Label>
        <Input id={`name-${k}`} name="name" defaultValue={person?.name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`role-${k}`}>Role</Label>
        <Select id={`role-${k}`} name="role" defaultValue={person?.role ?? "dev"}>
          {(Object.keys(ROLE_LABEL) as PersonRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`email-${k}`}>Email</Label>
        <Input id={`email-${k}`} name="email" type="email" defaultValue={person?.email ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`slack-${k}`}>Slack member ID</Label>
        <Input id={`slack-${k}`} name="slack_user_id" defaultValue={person?.slack_user_id ?? ""} placeholder="U03JSSBKDL4" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`aliases-${k}`}>Fathom name variations</Label>
        <Input id={`aliases-${k}`} name="aliases" defaultValue={aliases ?? ""} placeholder="e.g. Nilesh, Nileshwar K" />
        <p className="text-xs text-muted-foreground">Comma-separated. Helps Chief match names in call notes to this person.</p>
      </div>
    </div>
  );
}
