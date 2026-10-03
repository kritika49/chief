import Link from "next/link";
import { CalendarDays, ChevronRight, MessageSquare, Mic } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { myConnections, myTimezone } from "@/lib/connectors/status";

export const metadata = { title: "Connectors · Chief" };

export default async function ConnectorsPage() {
  const user = await requireUser();
  const [conns, tz] = await Promise.all([myConnections(), myTimezone(user.id)]);
  const items = [
    { key: "google", href: "/connectors/google", icon: CalendarDays, title: "Google", help: "Calendar (read-only) for meeting times, Gmail for minutes drafts." },
    { key: "slack", href: "/connectors/slack", icon: MessageSquare, title: "Slack", help: "Reads developer EODs and posts your updates and reminders." },
    { key: "fathom", href: "/connectors/fathom", icon: Mic, title: "Fathom", help: "Brings in client-call and standup notes automatically." },
  ];

  return (
    <>
      <PageHeader title="Connectors" description="Connect the tools Chief reads from and posts to." />
      <div className="grid gap-4">
        {items.map(({ key, href, icon: Icon, title, help }) => {
          const c = conns[key];
          return (
            <Link key={key} href={href} className="group flex items-center gap-4 rounded-xl border bg-card p-5 transition-colors hover:bg-accent">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{title}</span>
                  <StatusBadge status={c?.status ?? "not_connected"} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{help}</p>
                {c && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.account_label && <>{c.account_label} · </>}Last sync {formatDateTime(c.last_sync_at, tz)}
                  </p>
                )}
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </>
  );
}
