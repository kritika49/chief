"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveMatch, setFollowupStatus, setTaskStatus } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return { pending, run: (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); }) };
}

export function FollowupStatus({ id, status }: { id: string; status: string }) {
  const { pending, run } = useRun();
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => run(() => setFollowupStatus(id, e.target.value as "open" | "done" | "cancelled"))}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      aria-label="Status"
    >
      <option value="open">Open</option>
      <option value="done">Done</option>
      <option value="cancelled">Cancelled</option>
    </select>
  );
}

export function TaskStatus({ id, status }: { id: string; status: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant={status === "open" ? "outline" : "ghost"} disabled={pending} onClick={() => run(() => setTaskStatus(id, status === "open" ? "done" : "open"))}>
      {pending && <Loader2 className="animate-spin" />} {status === "open" ? "Mark done" : "Reopen"}
    </Button>
  );
}

export function MatchButtons({ id, kind }: { id: string; kind: "auto" | "suggested" }) {
  const { pending, run } = useRun();
  if (kind === "auto") {
    return <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={() => run(() => resolveMatch(id, "undo"))}>Undo</Button>;
  }
  return (
    <span className="flex gap-1">
      <Button size="sm" className="h-7" disabled={pending} onClick={() => run(() => resolveMatch(id, "confirm"))}>Confirm</Button>
      <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => run(() => resolveMatch(id, "reject"))}>Not a match</Button>
    </span>
  );
}
