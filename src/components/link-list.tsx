import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LinkListItem = { href: string; label: string; help: string; icon: LucideIcon };

export function LinkList({ items }: { items: LinkListItem[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map(({ href, label, help, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-accent">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{help}</div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
