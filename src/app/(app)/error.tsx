"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Friendly fallback instead of a blank "Application error" page. */
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-warning/20">
        <AlertTriangle className="size-6 text-amber-700 dark:text-warning" />
      </div>
      <h1 className="text-lg font-semibold">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your data is safe. If Chief was just updated, reloading the page fixes this — then try again.
        If it keeps happening, tell Claude the code below and what you clicked.
      </p>
      {error.digest && <code className="mt-3 rounded bg-muted px-2 py-1 text-xs">Code: {error.digest}</code>}
      <Button className="mt-6" onClick={() => window.location.reload()}>
        <RotateCw /> Reload page
      </Button>
    </div>
  );
}
