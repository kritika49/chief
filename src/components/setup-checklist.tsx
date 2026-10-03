import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SetupStep = { label: string; help: string; href: string; done: boolean };

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get Chief ready</CardTitle>
        <CardDescription>
          {doneCount} of {steps.length} done. Each step takes a couple of minutes — this list stays here
          until everything is set up.
        </CardDescription>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <ol className="flex flex-col">
          {steps.map((step, i) => (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent",
                  i === nextIndex && "bg-accent/60",
                )}
              >
                {step.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                    {i + 1}. {step.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.help}</div>
                </div>
                {!step.done && <ChevronRight className="size-4 text-muted-foreground" />}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
