import type { LucideIcon } from "lucide-react";

/** Friendly placeholder: what this is and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
