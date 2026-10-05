"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResultLine } from "@/components/action-form";
import { assignMeeting, createMinutesDraft, dismissMeeting, postMinutesToSlack, saveClientReview, saveStandupReview, type ReviewItem } from "../actions";

type Item = {
  id: string; kind: "key_point" | "decision" | "action"; text: string; status: string; is_decision: boolean; destinations: string[];
  owner_person_id: string | null; owner_name: string | null; due_date: string | null;
};
export type ReviewData = {
  meeting: { id: string; title: string | null; type: string; status: string; projectId: string | null; transcript: string | null; summary: string | null };
  items: Item[];
  projects: { id: string; name: string }[];
  people: { id: string; name: string; slack_user_id: string | null }[];
  channels: { id: string; name: string }[];
  ruleHint: { title: string; domain: string };
  minutes: { text: string; to: string[]; cc: string[]; hasDraft: boolean } | null;
  googleConnected: boolean;
  slackConfigured: boolean;
};
type Result = { ok: boolean; message: string; link?: string } | null;

export function MeetingReview({ data }: { data: ReviewData }) {
  const { meeting } = data;
  const needsAssign = !meeting.projectId || meeting.type === "unassigned";
  return (
    <div className="space-y-6">
      {(needsAssign || meeting.type === "ignore") && <AssignCard data={data} />}
      {!needsAssign && meeting.type === "client_call" && <ClientCallReview data={data} />}
      {!needsAssign && meeting.type === "standup" && <StandupReview data={data} />}
      {data.minutes && <MinutesCard data={data} />}
      {meeting.transcript && (
        <details className="rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Transcript</summary>
          <pre className="mt-3 max-h-[60vh] overflow-auto font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{meeting.transcript}</pre>
        </details>
      )}
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  return { pending, result, run };
}

function AssignCard({ data }: { data: ReviewData }) {
  const [project, setProject] = useState(data.meeting.projectId ?? "");
  const [type, setType] = useState(data.meeting.type === "unassigned" ? "client_call" : data.meeting.type);
  const [ruleKind, setRuleKind] = useState<"none" | "title_keyword" | "attendee_domain">("none");
  const [ruleValue, setRuleValue] = useState("");
  const { pending, result, run } = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Which project is this?</CardTitle>
        <CardDescription>Chief couldn&apos;t sort this meeting automatically. Choose the project and type — and save a rule so similar meetings sort themselves next time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Choose…</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="client_call">Client call</option>
              <option value="standup">Standup</option>
              <option value="ignore">Ignore (not needed)</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Save as a rule?</Label>
            <Select
              value={ruleKind}
              onChange={(e) => {
                const k = e.target.value as typeof ruleKind;
                setRuleKind(k);
                setRuleValue(k === "title_keyword" ? data.ruleHint.title : k === "attendee_domain" ? data.ruleHint.domain : "");
              }}
            >
              <option value="none">No, just this meeting</option>
              <option value="title_keyword">Yes — when the title contains…</option>
              <option value="attendee_domain">Yes — when an attendee&apos;s email is @…</option>
            </Select>
          </div>
          {ruleKind !== "none" && (
            <div className="space-y-1.5">
              <Label>{ruleKind === "title_keyword" ? "Title contains" : "Email domain"}</Label>
              <Input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder={ruleKind === "title_keyword" ? "e.g. bles weekly" : "e.g. client.com"} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending || (!project && type !== "ignore")} onClick={() => run(() => assignMeeting(data.meeting.id, project, type, ruleKind === "none" ? null : { kind: ruleKind, value: ruleValue }))}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
          {result && <ResultLine ok={result.ok} message={result.message} />}
        </div>
      </CardContent>
    </Card>
  );
}

function OwnerSelect({ data, item, onChange }: { data: ReviewData; item: Item; onChange: (p: Partial<Item>) => void }) {
  const matched = !!item.owner_person_id;
  return (
    <div className="space-y-1">
      <Select
        value={item.owner_person_id ?? (item.owner_name ? "__other" : "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other" || v === "") onChange({ owner_person_id: null, owner_name: v === "" ? null : item.owner_name });
          else onChange({ owner_person_id: v, owner_name: data.people.find((p) => p.id === v)?.name ?? null });
        }}
        className="h-8"
      >
        <option value="">No owner</option>
        {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__other">Someone else…</option>
      </Select>
      {!matched && (
        <Input value={item.owner_name ?? ""} onChange={(e) => onChange({ owner_name: e.target.value })} placeholder="Name (e.g. client)" className="h-8" />
      )}
    </div>
  );
}

function ClientCallReview({ data }: { data: ReviewData }) {
  const reviewed = data.meeting.status === "reviewed";
  const [items, setItems] = useState(() =>
    data.items.map((i) => ({
      ...i,
      include: i.kind === "key_point" ? (reviewed ? i.status === "accepted" && !i.is_decision : false) : false,
      decision: i.is_decision,
      dest: i.status === "dismissed" ? "dismiss" : i.destinations.includes("todo") && i.destinations.includes("followup") ? "both" : i.destinations.includes("followup") ? "followup" : "todo",
    })),
  );
  const { pending, result, run } = useAction();
  const set = (id: string, p: Partial<(typeof items)[number]>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const points = items.filter((i) => i.kind === "key_point");
  const actions = items.filter((i) => i.kind === "action");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>Tick the lines to include as key points in your next update for this project. Tag any line as a Decision to save it in the decision log.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {points.length === 0 && <p className="text-sm text-muted-foreground">No summary lines from Fathom.</p>}
          {points.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-lg border p-2">
              <input type="checkbox" checked={p.include} onChange={(e) => set(p.id, { include: e.target.checked })} className="mt-2 size-4 accent-[var(--primary)]" aria-label="Include in update" />
              <Textarea value={p.text} rows={1} onChange={(e) => set(p.id, { text: e.target.value })} className="field-sizing-content min-h-9 flex-1 resize-none py-1.5" />
              <button type="button" onClick={() => set(p.id, { decision: !p.decision })} className="mt-1.5 shrink-0">
                <Badge variant={p.decision ? "default" : "outline"}>Decision</Badge>
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action items</CardTitle>
          <CardDescription>Send each to your To-dos (Later, tagged with the call date), the Follow-up tracker, both — or dismiss it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">No action items.</p>}
          {actions.map((a) => (
            <div key={a.id} className="space-y-2 rounded-lg border p-3">
              <Textarea value={a.text} rows={1} onChange={(e) => set(a.id, { text: e.target.value })} className="field-sizing-content min-h-9 resize-none py-1.5" />
              <div className="grid gap-2 sm:grid-cols-3">
                <OwnerSelect data={data} item={a} onChange={(p) => set(a.id, p)} />
                <Input type="date" value={a.due_date ?? ""} onChange={(e) => set(a.id, { due_date: e.target.value || null })} className="h-8" aria-label="Due date" />
                <Select value={a.dest} onChange={(e) => set(a.id, { dest: e.target.value })} className="h-8">
                  <option value="todo">To-do</option>
                  <option value="followup">Follow-up</option>
                  <option value="both">Both</option>
                  <option value="dismiss">Dismiss</option>
                </Select>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  saveClientReview(
                    data.meeting.id,
                    items.map<ReviewItem>((i) => ({
                      id: i.id, text: i.text, kind: i.kind === "action" ? "action" : "key_point", include: i.include, decision: i.decision,
                      dest: i.dest as ReviewItem["dest"], owner_person_id: i.owner_person_id, owner_name: i.owner_name, due_date: i.due_date ?? "",
                    })),
                  ),
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />} {reviewed ? "Save changes" : "Accept review"}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => window.confirm("Dismiss this meeting?") && run(() => dismissMeeting(data.meeting.id))}>Dismiss meeting</Button>
            {result && <ResultLine ok={result.ok} message={result.message} />}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function StandupReview({ data }: { data: ReviewData }) {
  const reviewed = data.meeting.status === "reviewed";
  const [items, setItems] = useState(() =>
    data.items.map((i) => ({
      ...i,
      include: i.kind === "key_point" && i.status === "accepted",
      decision: false,
      dest: i.status === "dismissed" ? "dismiss" : i.destinations.includes("slack") && i.destinations.includes("todo") ? "slack_todo" : i.destinations.includes("todo") && !i.destinations.includes("slack") ? "todo" : "slack",
    })),
  );
  const { pending, result, run } = useAction();
  const set = (id: string, p: Partial<(typeof items)[number]>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const points = items.filter((i) => i.kind === "key_point");
  const actions = items.filter((i) => i.kind === "action");
  const payload = () =>
    items.map<ReviewItem>((i) => ({
      id: i.id, text: i.text, kind: i.kind === "action" ? "action" : "key_point", include: i.include, decision: false,
      dest: i.dest as ReviewItem["dest"], owner_person_id: i.owner_person_id, owner_name: i.owner_name, due_date: i.due_date ?? "",
    }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Standup tasks</CardTitle>
          <CardDescription>
            {reviewed ? "These were posted. Chief marks them done when matching EODs come in (see Tracker)." : "Check owners and due dates, then post one task message to the project's Slack channel with @mentions."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">No tasks found in this standup.</p>}
          {actions.map((a) => (
            <div key={a.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Textarea value={a.text} rows={1} onChange={(e) => set(a.id, { text: e.target.value })} className="field-sizing-content min-h-9 flex-1 resize-none py-1.5" disabled={reviewed} />
                {!a.owner_person_id && <Badge variant="warning" className="mt-2">Owner not matched</Badge>}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <OwnerSelect data={data} item={a} onChange={(p) => set(a.id, p)} />
                <Input type="date" value={a.due_date ?? ""} onChange={(e) => set(a.id, { due_date: e.target.value || null })} className="h-8" aria-label="Due date" disabled={reviewed} />
                <Select value={a.dest} onChange={(e) => set(a.id, { dest: e.target.value })} className="h-8" disabled={reviewed}>
                  <option value="slack">Post in Slack</option>
                  <option value="slack_todo">Slack + my To-dos</option>
                  <option value="todo">Only my To-dos</option>
                  <option value="dismiss">Dismiss</option>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {points.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Summary (optional)</CardTitle>
            <CardDescription>Tick lines to add to your next update.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {points.map((p) => (
              <label key={p.id} className="flex items-start gap-3 rounded-lg border p-2 text-sm">
                <input type="checkbox" checked={p.include} onChange={(e) => set(p.id, { include: e.target.checked })} className="mt-0.5 size-4 accent-[var(--primary)]" />
                {p.text}
              </label>
            ))}
          </CardContent>
        </Card>
      )}
      {!reviewed && (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending || !data.slackConfigured} onClick={() => window.confirm("Post these tasks to the project's Slack channel?") && run(() => saveStandupReview(data.meeting.id, payload(), true))}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Post to Slack
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => saveStandupReview(data.meeting.id, payload(), false))}>Save without posting</Button>
          <Button variant="ghost" disabled={pending} onClick={() => window.confirm("Dismiss this standup?") && run(() => dismissMeeting(data.meeting.id))}>Dismiss</Button>
          {result && <ResultLine ok={result.ok} message={result.message} />}
        </div>
      )}
      {reviewed && points.length > 0 && (
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={pending} onClick={() => run(() => saveStandupReview(data.meeting.id, payload().filter((i) => i.kind === "key_point"), false))}>Save summary choices</Button>
          {result && <ResultLine ok={result.ok} message={result.message} />}
        </div>
      )}
    </>
  );
}

function MinutesCard({ data }: { data: ReviewData }) {
  const mins = data.minutes!;
  const [to, setTo] = useState(mins.to.join(", "));
  const [cc, setCc] = useState(mins.cc.join(", "));
  const [channel, setChannel] = useState(data.channels[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const { pending, result, run } = useAction();
  const split = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Minutes</CardTitle>
        <CardDescription>Built from the key points, decisions and action items you accepted. Chief only creates Gmail drafts — it never sends email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted/50 p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{mins.text}</pre>
        <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(mins.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy as text"}
        </Button>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4" /> Gmail draft</div>
          {!data.googleConnected ? (
            <p className="text-sm text-muted-foreground">Connect Google (Connectors → Google) to create Gmail drafts.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>To</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" /></div>
                <div className="space-y-1.5"><Label>CC</Label><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" /></div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={pending} onClick={() => run(() => createMinutesDraft(data.meeting.id, split(to), split(cc)))}>
                  {pending && <Loader2 className="animate-spin" />} {mins.hasDraft ? "Re-create Gmail draft" : "Create Gmail draft"}
                </Button>
                {result?.link && (
                  <a href={result.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Open in Gmail <ExternalLink className="size-3.5" /></a>
                )}
              </div>
            </>
          )}
        </div>

        {data.slackConfigured && data.channels.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label>Post minutes to Slack</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                {data.channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>
            </div>
            <Button variant="outline" disabled={pending || !channel} onClick={() => window.confirm("Post the minutes to this Slack channel?") && run(() => postMinutesToSlack(data.meeting.id, channel))}>
              <Send /> Post
            </Button>
          </div>
        )}
        {result && <ResultLine ok={result.ok} message={result.message} />}
      </CardContent>
    </Card>
  );
}
