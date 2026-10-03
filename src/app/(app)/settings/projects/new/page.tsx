import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/action-form";
import { createProject } from "../actions";

export const metadata = { title: "New project · Chief" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="New project" description="Start with a name and type. Next you'll add its status line, Slack channel and team — each step can be skipped." />
      <Card>
        <CardContent>
          <ActionForm action={createProject} label="Create project" pendingLabel="Creating…">
            <div className="space-y-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" name="name" placeholder="e.g. Bles" required autoFocus />
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Type</legend>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input type="radio" name="type" value="dev" defaultChecked className="mt-1" />
                <span>
                  <b>Dev + PM</b>
                  <span className="block text-muted-foreground">Has developers. The update combines their Slack EODs with your own PM work (done to-dos, client-call notes).</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input type="radio" name="type" value="design_pm" className="mt-1" />
                <span>
                  <b>Design + PM</b>
                  <span className="block text-muted-foreground">No developers — you&apos;re also the designer. Updates come from your to-dos and client calls; no Slack EODs.</span>
                </span>
              </label>
            </fieldset>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
