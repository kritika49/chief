"use client";

import { useActionState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionResult = { ok: boolean; message: string } | null;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** A form that runs a server action and shows a friendly result line. */
export function ActionForm({
  action,
  label,
  pendingLabel,
  variant = "default",
  className,
  children,
  confirm,
}: {
  action: Action;
  label: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  className?: string;
  children?: React.ReactNode;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={cn("space-y-3", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={variant} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? (pendingLabel ?? "Working…") : label}
        </Button>
        {state && <ResultLine ok={state.ok} message={state.message} />}
      </div>
    </form>
  );
}

export function ResultLine({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-sm", ok ? "text-success" : "text-destructive")} role="status">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
      {message}
    </p>
  );
}
