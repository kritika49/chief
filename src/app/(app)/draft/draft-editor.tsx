"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, ClipboardPaste, Copy, ExternalLink, Loader2, MessageSquare, Pin, Plus, Send, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ResultLine } from "@/components/action-form";
import { isDue } from "@/lib/dates";
import { formatDMon, formatHeaderDate, normalizeBullet, renderUpdate, type DraftProject } from "@/lib/draft/format";
import type { BulletSource, DraftBullet } from "@/lib/draft/assemble";
import { HEADER_FIELDS, type ProjectHeader, type ProjectType, type TrackingMode } from "@/lib/types";
import { addToRoster, discardDraft, markPosted, pinBullet, postToSlack, refreshFromSlack, saveHeaderField, saveMemberText, saveProjectBullets } from "./actions";
import type { ScanMeta } from "@/lib/draft/build";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addTodo, moveTodo } from "@/app/(app)/todos/actions";
import { toPastTense } from "@/lib/draft/sentence";
import { RefreshCw, UserPlus } from "lucide-react";

export type EditorMember = { personId: string; name: string; tracking: TrackingMode; text: string };
export type EditorProject = {
  id: string;
  name: string;
  type: ProjectType;
  header: ProjectHeader;
  keyword: string;
  members: EditorMember[];
  bullets: DraftBullet[];
};

export type TodoLite = { id: string; text: string; list: "today" | "later" | "done" };
export type CallLite = { id: string; title: string | null; type: string };
export type ProjectSide = { todos: TodoLite[]; laterCount: number; calls: CallLite[] };

const SOURCE_LABEL: Record<BulletSource, string> = {
  eod: "EOD",
  missing_eod: "Awaited",
  manual_entry: "Typed",
  todo: "To-do",
  client_call: "Client call",
  standup: "Standup",
  pinned: "Pinned",
  free_text: "Added",
};

// Pending (debounced) bullet saves, so other actions can save edits first.
const pendingSaves = new Map<string, () => Promise<void>>();
export async function flushDraftSaves() {
  const saves = [...pendingSaves.values()];
  pendingSaves.clear();
  await Promise.all(saves.map((save) => save()));
}

export const reminderText = (name: string) => `Hi ${name}, Chief here 👋 friendly reminder to drop your EOD when you get a moment.`;

export function DraftEditor({
  draftId, today, projects: initial, canPost, side = {},
}: { draftId: string; today: string; projects: EditorProject[]; canPost: boolean; side?: Record<string, ProjectSide> }) {
  const [projects, setProjects] = useState(initial);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const latest = useRef(initial);
  const update = (id: string, fn: (p: EditorProject) => EditorProject, persist = true) => {
    const next = latest.current.map((p) => (p.id === id ? fn(p) : p));
    latest.current = next;
    setProjects(next);
    if (!persist) return;
    clearTimeout(timers.current[id]);
    setSaving((s) => ({ ...s, [id]: true }));
    const save = async () => {
      clearTimeout(timers.current[id]);
      pendingSaves.delete(id);
      const proj = latest.current.find((p) => p.id === id);
      if (proj) await saveProjectBullets(draftId, id, proj.bullets);
      setSaving((s) => ({ ...s, [id]: false }));
    };
    pendingSaves.set(id, save);
    timers.current[id] = setTimeout(save, 700);
  };

  const text = useMemo(
    () =>
      renderUpdate(
        projects.map<DraftProject>((p) =>
          p.type === "dev"
            ? { name: p.name, type: "dev", header: p.header, bullets: p.bullets.map((b) => b.text) }
            : { name: p.name, type: "design_pm", header: p.header, bullets: p.bullets.map((b) => b.text) },
        ),
      ),
    [projects],
  );

  return (
    <div className="space-y-6 pb-16">
      {projects.map((p) => (
        <ProjectCard key={p.id} draftId={draftId} today={today} project={p} side={side[p.id]} saving={!!saving[p.id]} update={(fn, persist) => update(p.id, fn, persist)} />
      ))}
      <div id="preview" className="scroll-mt-20">
        <PreviewPanel draftId={draftId} text={text} canPost={canPost} />
      </div>
      <StickyBar text={text} />
    </div>
  );
}

/** Always-visible bar: copy the update, or jump to the preview to post. */
function StickyBar({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4 md:bottom-4 md:left-60">
      <div className="flex items-center gap-2 rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur">
        <Button size="sm" variant="ghost" className="rounded-full" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy update"}
        </Button>
        <Button size="sm" className="rounded-full" onClick={() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth" })}>
          <Send /> Preview &amp; post
        </Button>
      </div>
    </div>
  );
}

export function SlackBar({ draftId, scan, projectNames }: { draftId: string; scan: ScanMeta; projectNames: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      await flushDraftSaves();
      const r = await fn();
      setResult(r);
      router.refresh();
    });
  const time = scan.at ? new Date(scan.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <Card className="mb-6 gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <MessageSquare className="size-4" />
            {time ? `EODs read from Slack at ${time}.` : "EODs are read from your project channels."}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => refreshFromSlack(draftId))}>
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh from Slack
          </Button>
        </div>
        {scan.errors.map((e) => <ResultLine key={e} ok={false} message={e} />)}
        {scan.unknown.map((u) => (
          <div key={u.slackUserId + u.projectId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 p-2 text-sm">
            <span>
              <b>{u.name}</b> posted an EOD in #{u.channelName} but isn&apos;t on {projectNames[u.projectId] ?? "this project"}&apos;s team.
            </span>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => addToRoster(draftId, u.projectId, u.slackUserId, u.name))}>
              <UserPlus /> Add to roster
            </Button>
          </div>
        ))}
        {result && <ResultLine ok={result.ok} message={result.message} />}
      </CardContent>
    </Card>
  );
}

function ProjectCard({
  draftId, today, project: p, side, saving, update,
}: {
  draftId: string;
  today: string;
  project: EditorProject;
  side?: ProjectSide;
  saving: boolean;
  update: (fn: (p: EditorProject) => EditorProject, persist?: boolean) => void;
}) {
  const [newBullet, setNewBullet] = useState("");
  const setBullets = (fn: (b: DraftBullet[]) => DraftBullet[]) => update((x) => ({ ...x, bullets: fn(x.bullets) }));
  const dueFlags = p.type === "dev"
    ? (["dev_completion", "launch"] as const).filter((k) => isDue(p.header[k], today)).map((k) => `${k === "launch" ? "Launch" : "Dev Completion"} ${formatDMon(p.header[k])} reached — mark done or revise.`)
    : [];
  const missing = p.members.filter((m) => m.tracking === "slack_scan" && p.bullets.some((b) => b.source === "missing_eod" && b.source_ref === m.personId));

  return (
    <Card className="gap-4" id={`project-${p.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{p.name}</CardTitle>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <Link href={`/meetings/brief?project=${p.id}`} className="text-primary hover:underline">Brief</Link>
            <Link href={`/settings/projects/${p.id}`} className="hover:underline">Settings</Link>
            {saving ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Saving</span> : <span className="flex items-center gap-1"><Check className="size-3" /> Saved</span>}
          </span>
        </div>
        <StatusSummary project={p} />
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-5">
        {/* Inline header fields */}
        <div className="grid gap-3 sm:grid-cols-3">
          {HEADER_FIELDS[p.type].map((f) => (
            <label key={f.key} className={`space-y-1 text-xs text-muted-foreground ${f.kind === "text" ? "sm:col-span-3" : ""}`}>
              {f.label}
              <Input
                type={f.kind}
                defaultValue={p.header[f.key] ?? ""}
                className="h-8 text-sm text-foreground"
                onBlur={async (e) => {
                  const v = e.target.value;
                  if ((p.header[f.key] ?? "") === v) return;
                  update((x) => ({ ...x, header: { ...x.header, [f.key]: v } }), false);
                  await saveHeaderField(p.id, f.key, v);
                }}
              />
            </label>
          ))}
        </div>
        {dueFlags.map((f) => (
          <p key={f} className="flex items-start gap-2 rounded-md bg-warning/15 p-2 text-sm text-amber-800 dark:text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {f}
          </p>
        ))}

        {/* Key updates */}
        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Key updates</div>
          {p.bullets.length === 0 && <p className="mb-2 text-sm text-muted-foreground">No bullets yet. Paste an EOD below or add a line.</p>}
          <ul className="space-y-2">
            {p.bullets.map((b, i) => (
              <li key={i} className="group flex items-start gap-2">
                <span className="mt-2 text-muted-foreground">•</span>
                <div className="min-w-0 flex-1">
                  <Textarea
                    value={b.text}
                    rows={1}
                    className="field-sizing-content min-h-9 resize-none py-1.5"
                    onChange={(e) => setBullets((bs) => bs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant={b.source === "missing_eod" ? "warning" : "outline"} className="px-1.5 py-0 text-[10px] font-normal">{SOURCE_LABEL[b.source]}</Badge>
                    {b.source_url && (
                      <a href={b.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                        source <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => setBullets((bs) => swap(bs, i, i - 1))}><ArrowUp /></IconBtn>
                  <IconBtn label="Move down" disabled={i === p.bullets.length - 1} onClick={() => setBullets((bs) => swap(bs, i, i + 1))}><ArrowDown /></IconBtn>
                  {b.source !== "pinned" && (
                    <IconBtn
                      label="Pin (repeat in every update)"
                      onClick={async () => {
                        const r = await pinBullet(p.id, b.text);
                        if (r.ok) setBullets((bs) => bs.map((x, j) => (j === i ? { ...x, source: "pinned", source_ref: r.message } : x)));
                      }}
                    >
                      <Pin />
                    </IconBtn>
                  )}
                  <IconBtn label="Delete" onClick={() => setBullets((bs) => bs.filter((_, j) => j !== i))}><Trash2 /></IconBtn>
                </div>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newBullet.trim()) return;
              setBullets((bs) => [...bs, { text: newBullet.trim(), source: "free_text" }]);
              setNewBullet("");
            }}
          >
            <Input value={newBullet} onChange={(e) => setNewBullet(e.target.value)} placeholder="Add a bullet, e.g. Shared the timeline with the client" />
            <Button type="submit" variant="secondary"><Plus /> Add</Button>
          </form>
        </div>

        {/* Members: paste EOD / type update */}
        {p.members.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Team updates</div>
            {p.members.map((m) => (
              <MemberBox key={m.personId} draftId={draftId} project={p} member={m} onBullets={(bullets, text) => update((x) => ({ ...x, bullets, members: x.members.map((mm) => (mm.personId === m.personId ? { ...mm, text } : mm)) }), false)} />
            ))}
            {missing.length > 0 && <ReminderCopies names={missing.map((m) => m.name)} />}
          </div>
        )}
      </div>
      <aside className="space-y-5 xl:border-l xl:pl-6">
        <TodoMini
          projectId={p.id}
          initial={side?.todos ?? []}
          laterCount={side?.laterCount ?? 0}
          onDoneChange={(todo, done) =>
            update((x) => {
              const others = x.bullets.filter((b) => !(b.source === "todo" && b.source_ref === todo.id));
              if (!done) return { ...x, bullets: others };
              const firstPinned = others.findIndex((b) => b.source === "pinned");
              const at = firstPinned < 0 ? others.length : firstPinned;
              const bullet: DraftBullet = { text: normalizeBullet(toPastTense(todo.text)), source: "todo", source_ref: todo.id };
              return { ...x, bullets: [...others.slice(0, at), bullet, ...others.slice(at)] };
            })
          }
        />
        <CallsMini calls={side?.calls ?? []} />
      </aside>
      </CardContent>
    </Card>
  );
}

/** The project's saved status line and dates, exactly as stored — nothing inferred. */
function StatusSummary({ project: p }: { project: EditorProject }) {
  const parts = HEADER_FIELDS[p.type].map((f) => {
    const v = p.header[f.key];
    return `${f.label}: ${f.kind === "date" ? (v ? formatHeaderDate(v) : "—") : v || "—"}`;
  });
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

export function TodoMini({
  projectId, initial, laterCount, onDoneChange,
}: { projectId: string; initial: TodoLite[]; laterCount: number; onDoneChange?: (todo: TodoLite, done: boolean) => void }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const visible = items.filter((t) => t.list !== "later");
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To-dos</div>
        <Link href={`/todos?project=${projectId}`} className="text-xs text-primary hover:underline">All{laterCount ? ` · ${laterCount} later` : ""}</Link>
      </div>
      {visible.length === 0 && <p className="mb-2 text-xs text-muted-foreground">Nothing for today. Ticked items go into the update.</p>}
      <ul className="space-y-1.5">
        {visible.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.list === "done"}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              aria-label={t.list === "done" ? "Mark not done" : "Mark done"}
              onChange={(e) => {
                const done = e.target.checked;
                setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, list: done ? "done" : "today" } : x)));
                void moveTodo(t.id, done ? "done" : "today");
                onDoneChange?.(t, done);
              }}
            />
            <span className={t.list === "done" ? "text-muted-foreground line-through" : ""}>{t.text}</span>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          start(async () => {
            const r = await addTodo(projectId, v, "today");
            if (r.ok && r.id) {
              setItems((xs) => [...xs, { id: r.id!, text: v, list: "today" }]);
              setText("");
            }
          });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do" className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending} aria-label="Add to-do">{pending ? <Loader2 className="animate-spin" /> : <Plus />}</Button>
      </form>
    </div>
  );
}

export function CallsMini({ calls }: { calls: CallLite[] }) {
  if (!calls.length) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Calls to review</div>
      <ul className="space-y-1.5">
        {calls.map((c) => (
          <li key={c.id}>
            <Link href={`/meetings/${c.id}`} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent">
              <span className="min-w-0 truncate">{c.title ?? "Meeting"}</span>
              <Badge variant="warning" className="shrink-0">{c.type === "standup" ? "Standup" : "Client call"}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemberBox({ draftId, project, member, onBullets }: { draftId: string; project: EditorProject; member: EditorMember; onBullets: (b: DraftBullet[], text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(member.text);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scan = member.tracking === "slack_scan";
  const hasText = member.text.trim().length > 0;

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
        <span className="flex items-center gap-2">
          <ClipboardPaste className="size-4 text-muted-foreground" />
          {scan ? `Paste ${member.name}'s EOD` : `Type ${member.name}'s update`}
        </span>
        {hasText ? <Badge variant="success">Added</Badge> : scan ? <Badge variant="warning">Awaited</Badge> : <Badge variant="secondary">Empty</Badge>}
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={scan ? `Copy ${member.name}'s EOD message from Slack and paste it here.\nChief removes the “${project.keyword} Update” line and splits it into bullets.` : "One point per line."}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  await flushDraftSaves();
                  const r = await saveMemberText(draftId, project.id, member.personId, text, project.keyword, project.bullets);
                  if (!r.ok) setError(r.message);
                  else {
                    onBullets(r.bullets, text);
                    setOpen(false);
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Add to draft
            </Button>
            {hasText && <span className="text-xs text-muted-foreground">Saving replaces {member.name}&apos;s previous bullets.</span>}
          </div>
          {error && <ResultLine ok={false} message={error} />}
        </div>
      )}
    </div>
  );
}

function ReminderCopies({ names }: { names: string[] }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium"><MessageSquare className="size-4" /> Gentle reminders to copy into Slack</div>
      <ul className="space-y-2">
        {names.map((n) => (
          <li key={n} className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground">{reminderText(n)}</span>
            <CopyBtn text={reminderText(n)} small />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewPanel({ draftId, text, canPost }: { draftId: string; text: string; canPost: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => setResult(null), [text]);

  return (
    <div>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Slack preview
            <span className="text-xs font-normal text-muted-foreground">{text.length} characters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/50 p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{text}</pre>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={canPost ? "outline" : "default"}
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied — paste it in Slack" : "Copy update"}
            </Button>
            {canPost && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Post this update to Slack now?")) return;
                  start(async () => {
                    await flushDraftSaves();
                    setResult(await postToSlack(draftId, text));
                  });
                }}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Approve &amp; Post
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Did you post this update in Slack? Chief will save it to your history and close this draft.")) return;
                start(async () => {
                  await flushDraftSaves();
                  setResult(await markPosted(draftId, text));
                });
              }}
            >
              I posted it myself
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Discard this draft? You can start a fresh one.")) return;
                start(async () => setResult(await discardDraft(draftId)));
              }}
            >
              Discard draft
            </Button>
          </div>
          {result && <ResultLine ok={result.ok} message={result.message} />}
        </CardContent>
      </Card>
    </div>
  );
}

function CopyBtn({ text, small }: { text: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={small ? "sm" : "default"}
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}
