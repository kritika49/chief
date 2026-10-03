import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, ResultLine } from "@/components/action-form";
import { BackToConnectors, ConnectorSummary } from "@/components/connector-summary";
import { myConnections, myTimezone } from "@/lib/connectors/status";
import { googleConfigured, listCalendars, type GoogleCalendar } from "@/lib/connectors/google";
import { disconnectGoogle, saveCalendars, testGoogleAction } from "../actions";

export const metadata = { title: "Google · Chief" };

export default async function GooglePage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const user = await requireUser();
  const { error, connected } = await searchParams;
  const [conns, tz] = await Promise.all([myConnections(), myTimezone(user.id)]);
  const c = conns.google;
  const status = c?.status ?? "not_connected";

  let calendars: GoogleCalendar[] = [];
  let calendarError: string | null = null;
  if (c && status === "connected") {
    try {
      calendars = await listCalendars(user.id);
    } catch (e) {
      calendarError = e instanceof Error ? e.message : "Couldn't load your calendars.";
    }
  }
  const watched = new Set((c?.settings?.calendars as string[] | undefined) ?? ["primary"]);

  return (
    <>
      <BackToConnectors />
      <PageHeader title="Google" description="Calendar (read-only) and Gmail drafts. Chief never sends email — it only prepares drafts for you." />
      <div className="space-y-6">
        {error && <ResultLine ok={false} message={error} />}
        {connected && <ResultLine ok message="Google connected." />}

        <ConnectorSummary
          title="Google account"
          description="Used to see your meeting times and to create meeting-minutes drafts in your Gmail."
          status={status}
          account={c?.account_label}
          lastSync={c?.last_sync_at}
          issue={c?.last_error}
          timezone={tz}
        >
          {!googleConfigured() ? (
            <p className="text-sm text-muted-foreground">
              Google isn&apos;t set up for your company yet. Your admin needs to add the Google keys (see SETUP_GUIDE.md, Part F).
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-3">
              <Button asChild variant={status === "connected" ? "outline" : "default"}>
                <Link href="/api/connect/google/start" prefetch={false}>
                  {status === "not_connected" ? "Connect Google" : "Reconnect"}
                </Link>
              </Button>
              {status !== "not_connected" && (
                <>
                  <ActionForm action={testGoogleAction} label="Test" pendingLabel="Testing…" variant="outline" />
                  <ActionForm action={disconnectGoogle} label="Disconnect" variant="ghost" confirm="Disconnect Google? Chief will stop reading your calendar and can't create Gmail drafts." />
                </>
              )}
            </div>
          )}
          {status === "not_connected" && googleConfigured() && (
            <p className="text-sm text-muted-foreground">
              Google will ask you to allow two things: <b>see your calendars</b> and <b>manage drafts</b> in Gmail. Tick both.
            </p>
          )}
        </ConnectorSummary>

        {status === "connected" && (
          <Card>
            <CardHeader>
              <CardTitle>Calendars to watch</CardTitle>
              <CardDescription>Chief looks at these for client calls and standups. Most people only need their main calendar.</CardDescription>
            </CardHeader>
            <CardContent>
              {calendarError ? (
                <ResultLine ok={false} message={calendarError} />
              ) : (
                <ActionForm action={saveCalendars} label="Save calendars" pendingLabel="Saving…">
                  <div className="space-y-2">
                    {calendars.map((cal) => (
                      <label key={cal.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          name="calendar"
                          value={cal.primary ? "primary" : cal.id}
                          defaultChecked={watched.has(cal.primary ? "primary" : cal.id)}
                          className="size-4 accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate">{cal.summary}</span>
                        {cal.primary && <span className="text-xs text-muted-foreground">Main</span>}
                      </label>
                    ))}
                  </div>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
