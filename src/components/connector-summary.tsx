import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type Status } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

export function BackToConnectors() {
  return (
    <Link href="/connectors" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Connectors
    </Link>
  );
}

export function ConnectorSummary({
  title,
  description,
  status,
  account,
  lastSync,
  issue,
  timezone,
  children,
}: {
  title: string;
  description: string;
  status: Status;
  account?: string | null;
  lastSync?: string | null;
  issue?: string | null;
  timezone?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <StatusBadge status={status} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status !== "not_connected" && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-medium break-all">{account ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last successful sync</dt>
              <dd className="font-medium">{formatDateTime(lastSync, timezone)}</dd>
            </div>
          </dl>
        )}
        {issue && status === "needs_attention" && (
          <p className="flex items-start gap-2 rounded-md bg-warning/15 p-3 text-sm text-amber-800 dark:text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {issue}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground [&_b]:text-foreground">{children}</ol>;
}
