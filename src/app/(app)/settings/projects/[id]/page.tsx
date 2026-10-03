import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hash, Pin, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ActionForm, ResultLine } from "@/components/action-form";
import { listChannels, slackConfigured, type SlackChannel } from "@/lib/connectors/slack";
import { HEADER_FIELDS, ROLE_LABEL, TRACKING_LABEL, TYPE_LABEL, type Person, type Project, type TrackingMode } from "@/lib/types";
import { addChannel, addMember, addPinned, removePinned, saveGeneral, setArchived, updateChannel, updateMember } from "../actions";

export const metadata = { title: "Project · Chief" };

type ChannelRow = { id: string; slack_channel_id: string; slack_channel_name: string | null; eod_keyword: string; active: boolean; is_primary: boolean };
type MemberRow = { id: string; tracking_mode: TrackingMode; nudge: boolean; person: Person };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name, type, header, sort_order, active").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;

  const [{ data: channels }, { data: members }, { data: people }, { data: pinned }] = await Promise.all([
    supabase.from("channels").select("id, slack_channel_id, slack_channel_name, eod_keyword, active, is_primary").eq("project_id", id).order("created_at"),
    supabase.from("project_members").select("id, tracking_mode, nudge, person:people(id, name, role, email, slack_user_id)").eq("project_id", id).order("created_at"),
    supabase.from("people").select("id, name, role, email, slack_user_id").order("name"),
    supabase.from("pinned_lines").select("id, text").eq("project_id", id).eq("active", true).order("created_at"),
  ]);
  const memberRows = (members ?? []) as unknown as MemberRow[];
  const onProject = new Set(memberRows.map((m) => m.person.id));
  const available = ((people ?? []) as Person[]).filter((x) => !onProject.has(x.id));

  let slackChannels: SlackChannel[] = [];
  if (slackConfigured()) slackChannels = await listChannels().catch(() => []);
  const added = new Set((channels ?? []).map((c) => c.slack_channel_id));

  return (
    <>
      <Link href="/settings/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <PageHeader
        title={p.name}
        description={`${TYPE_LABEL[p.type]}${p.active ? "" : " · Archived"}`}
        actions={
          <ActionForm action={setArchived} label={p.active ? "Archive" : "Restore"} variant="outline" confirm={p.active ? "Archive this project? It will leave your drafts and reminders, but its history is kept." : undefined}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="archive" value={p.active ? "1" : "0"} />
          </ActionForm>
        }
      />
      {created && <div className="mb-4"><ResultLine ok message="Project created. Fill in the sections below — any can be left for later." /></div>}

      <div className="space-y-6">
        {/* General & headers */}
        <Card>
          <CardHeader>
            <CardTitle>General &amp; status line</CardTitle>
            <CardDescription>These lines appear at the top of the project in every update, unchanged until you edit them.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveGeneral} label="Save" pendingLabel="Saving…">
              <input type="hidden" name="id" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={p.name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="type">Type</Label>
                  <Select id="type" name="type" defaultValue={p.type}>
                    <option value="dev">Development</option>
                    <option value="design_pm">Design + PM</option>
                  </Select>
                </div>
                {HEADER_FIELDS[p.type].map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <Input id={f.key} name={f.key} type={f.kind} defaultValue={p.header[f.key] ?? ""} placeholder={f.kind === "text" ? (p.type === "dev" ? "e.g. On Track, Dev Ongoing" : "e.g. Initial Design Phase") : undefined} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Changing the type switches which status fields are shown. Every change is logged.</p>
            </ActionForm>
          </CardContent>
        </Card>

        {/* Channels */}
        {p.type === "dev" && (
          <Card>
            <CardHeader>
              <CardTitle>Slack channels</CardTitle>
              <CardDescription>Where your developers post EODs. Standup tasks go to the primary channel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(channels as ChannelRow[] | null)?.map((c) => (
                <ActionForm key={c.id} action={updateChannel} label="Save" variant="outline" className="rounded-lg border p-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="project_id" value={p.id} />
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Hash className="size-4 text-muted-foreground" />
                    {c.slack_channel_name ?? c.slack_channel_id}
                    {c.is_primary && <Badge variant="secondary">Primary</Badge>}
                    <span className="text-xs font-normal text-muted-foreground">{c.slack_channel_id}</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-4 text-sm">
                    <div className="space-y-1">
                      <Label htmlFor={`kw-${c.id}`} className="text-xs">EOD keyword</Label>
                      <Input id={`kw-${c.id}`} name="eod_keyword" defaultValue={c.eod_keyword} className="h-8 w-28" />
                    </div>
                    <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={c.active} /> Active</label>
                    <label className="flex items-center gap-2"><input type="checkbox" name="is_primary" defaultChecked={c.is_primary} /> Primary</label>
                    <label className="flex items-center gap-2 text-destructive"><input type="checkbox" name="remove" value="1" /> Remove</label>
                  </div>
                </ActionForm>
              ))}
              <ActionForm action={addChannel} label="Add channel" variant="secondary" className="rounded-lg border border-dashed p-3">
                <input type="hidden" name="project_id" value={p.id} />
                {slackChannels.length > 0 ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="channel">Channel</Label>
                    <Select id="channel" name="channel" defaultValue="">
                      <option value="" disabled>Choose a channel…</option>
                      {slackChannels.filter((c) => !added.has(c.id)).map((c) => (
                        <option key={c.id} value={`${c.id}|${c.name}`}>#{c.name}{c.is_member ? "" : " (Chief not invited yet)"}</option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="channel_name">Channel name</Label>
                      <Input id="channel_name" name="channel_name" placeholder="bles-internal" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="channel_id">Channel ID</Label>
                      <Input id="channel_id" name="channel_id" placeholder="C0BG3GPPMLN" />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Find the ID in Slack: open the channel → click its name at the top → scroll to the bottom of the About tab.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="eod_keyword">EOD keyword</Label>
                  <Input id="eod_keyword" name="eod_keyword" defaultValue="EOD" className="w-28" />
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        )}

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              {p.type === "dev"
                ? "Choose how Chief gets each person's update. Missing Slack EODs show as “update is awaited”."
                : "Optional for design + PM projects."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberRows.map((m) => (
              <ActionForm key={m.id} action={updateMember} label="Save" variant="outline" className="rounded-lg border p-3">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="project_id" value={p.id} />
                <div className="text-sm font-medium">
                  {m.person.name} <span className="font-normal text-muted-foreground">· {ROLE_LABEL[m.person.role]}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Select name="tracking_mode" defaultValue={m.tracking_mode} className="h-8 w-auto">
                    {(Object.keys(TRACKING_LABEL) as TrackingMode[]).map((k) => (
                      <option key={k} value={k}>{TRACKING_LABEL[k]}</option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2"><input type="checkbox" name="nudge" defaultChecked={m.nudge} /> Remind if EOD missing</label>
                  <label className="flex items-center gap-2 text-destructive"><input type="checkbox" name="remove" value="1" /> Remove</label>
                </div>
              </ActionForm>
            ))}
            <ActionForm action={addMember} label="Add to team" variant="secondary" className="rounded-lg border border-dashed p-3">
              <input type="hidden" name="project_id" value={p.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="person_id">Existing person</Label>
                  <Select id="person_id" name="person_id" defaultValue="">
                    <option value="">—</option>
                    {available.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_name">…or new person</Label>
                  <Input id="new_name" name="new_name" placeholder="Name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tracking_mode">Their update</Label>
                  <Select id="tracking_mode" name="tracking_mode" defaultValue="slack_scan">
                    {(Object.keys(TRACKING_LABEL) as TrackingMode[]).map((k) => <option key={k} value={k}>{TRACKING_LABEL[k]}</option>)}
                  </Select>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        {/* Pinned lines */}
        <Card>
          <CardHeader>
            <CardTitle>Pinned lines</CardTitle>
            <CardDescription>Bullets repeated in every update until you unpin them, e.g. “QA is ongoing.”</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(pinned ?? []).map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Pin className="size-3.5 text-muted-foreground" />
                <span className="flex-1">{l.text}</span>
                <form action={async (fd) => { "use server"; await removePinned(null, fd); }}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="project_id" value={p.id} />
                  <Button type="submit" variant="ghost" size="icon" className="size-7" aria-label="Unpin"><X /></Button>
                </form>
              </div>
            ))}
            <ActionForm action={addPinned} label="Pin line" variant="secondary">
              <input type="hidden" name="project_id" value={p.id} />
              <Input name="text" placeholder="e.g. QA is ongoing." />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
