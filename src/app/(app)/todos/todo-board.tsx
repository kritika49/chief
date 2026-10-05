"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addTodo, deleteTodo, editTodo, moveTodo, toggleBlocker } from "./actions";

type List = "later" | "today" | "done";
export type TodoItem = {
  id: string;
  text: string;
  list: List;
  source: "manual" | "client_call" | "standup";
  is_blocker: boolean;
  done_at: string | null;
  meeting_id: string | null;
  included_in_posted_update_id: string | null;
  meeting: { title: string | null; started_at: string | null } | null;
};

const COLUMNS: { key: List; title: string; help: string }[] = [
  { key: "later", title: "Later", help: "Backlog" },
  { key: "today", title: "Today", help: "What you're on today" },
  { key: "done", title: "Done", help: "Goes into your next update" },
];

export function TodoBoard({ projectId, initial }: { projectId: string; initial: TodoItem[] }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [to, setTo] = useState<"today" | "later">("today");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const patch = (id: string, p: Partial<TodoItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (it: TodoItem, list: List) => {
    patch(it.id, { list, done_at: list === "done" ? new Date().toISOString() : null });
    void moveTodo(it.id, list);
  };

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          start(async () => {
            setError(null);
            const r = await addTodo(projectId, t, to);
            if (!r.ok || !r.id) return setError(r.message);
            setItems((xs) => [...xs, { id: r.id!, text: t, list: to, source: "manual", is_blocker: false, done_at: null, meeting_id: null, included_in_posted_update_id: null, meeting: null }]);
            setText("");
          });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Share revised timeline with Patrick" className="flex-1" />
        <div className="flex gap-2">
          <select value={to} onChange={(e) => setTo(e.target.value as "today" | "later")} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Add to">
            <option value="today">Today</option>
            <option value="later">Later</option>
          </select>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = items.filter((i) => i.list === col.key);
          return (
            <section key={col.key} className="rounded-xl border bg-muted/30 p-3">
              <header className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{col.title} <span className="font-normal text-muted-foreground">· {list.length}</span></h2>
                <span className="text-xs text-muted-foreground">{col.help}</span>
              </header>
              {list.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  {col.key === "done" ? "Tick a to-do to move it here." : col.key === "today" ? "Nothing planned for today yet." : "Park ideas and later tasks here."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {list.map((it) => (
                    <TodoRow key={it.id} item={it} onMove={(l) => move(it, l)} onPatch={(p) => patch(it.id, p)} onDelete={() => { setItems((xs) => xs.filter((x) => x.id !== it.id)); void deleteTodo(it.id); }} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TodoRow({ item, onMove, onPatch, onDelete }: { item: TodoItem; onMove: (l: List) => void; onPatch: (p: Partial<TodoItem>) => void; onDelete: () => void }) {
  const [text, setText] = useState(item.text);
  const done = item.list === "done";
  return (
    <li className={cn("group rounded-lg border bg-card p-2.5 text-sm shadow-xs", item.is_blocker && "border-destructive/40")}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onMove(e.target.checked ? "done" : "today")}
          className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
          aria-label={done ? "Mark not done" : "Mark done"}
        />
        <textarea
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text.trim() && text !== item.text) {
              onPatch({ text });
              void editTodo(item.id, text);
            }
          }}
          className={cn("field-sizing-content min-w-0 flex-1 resize-none bg-transparent leading-snug outline-none", done && "text-muted-foreground line-through")}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 pl-6">
        {item.source !== "manual" && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {item.meeting_id ? <Link href={`/meetings/${item.meeting_id}`}>{item.source === "client_call" ? "Client call" : "Standup"}{item.meeting?.started_at ? ` · ${new Date(item.meeting.started_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</Link> : item.source === "client_call" ? "Client call" : "Standup"}
          </Badge>
        )}
        {item.is_blocker && <Badge variant="destructive" className="text-[10px]">Blocker</Badge>}
        <span className="ml-auto flex items-center opacity-70 group-hover:opacity-100">
          {item.list === "today" && <Tiny label="Move to Later" onClick={() => onMove("later")}><ArrowLeft /></Tiny>}
          {item.list === "later" && <Tiny label="Move to Today" onClick={() => onMove("today")}><ArrowRight /></Tiny>}
          <Tiny label={item.is_blocker ? "Not a blocker" : "Mark as blocker"} onClick={() => { onPatch({ is_blocker: !item.is_blocker }); void toggleBlocker(item.id, !item.is_blocker); }}><Flag /></Tiny>
          <Tiny label="Delete" onClick={() => window.confirm("Delete this to-do?") && onDelete()}><Trash2 /></Tiny>
        </span>
      </div>
    </li>
  );
}

function Tiny({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" title={label} aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}
