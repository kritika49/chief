import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { BackToConnectors, ConnectorSummary, Steps } from "@/components/connector-summary";
import { formatDateTime } from "@/lib/format";
import { myConnections, myTimezone } from "@/lib/connectors/status";
import { disconnectFathom, saveFathomKey, saveFathomSecret, testFathom } from "../actions";

export const metadata = { title: "Fathom · Chief" };

export default async function FathomPage() {
  const user = await requireUser();
  const [conns, tz] = await Promise.all([myConnections(), myTimezone(user.id)]);
  const c = conns.fathom;
  const status = c?.status ?? "not_connected";
  const webhookUrl = c?.webhook_id ? `${appUrl()}/api/webhooks/fathom/${c.webhook_id}` : null;
  const manual = c?.settings?.webhook_mode === "manual";
  const lastMeeting = c?.settings?.last_meeting as { title: string; at: string } | undefined;

  return (
    <>
      <BackToConnectors />
      <PageHeader title="Fathom" description="When Fathom finishes a call, Chief receives the summary, action items and transcript automatically." />
      <div className="space-y-6">
        <ConnectorSummary
          title="Your Fathom account"
          description="Each PM connects their own Fathom with a personal API key."
          status={status}
          account={c?.account_label}
          lastSync={c?.last_sync_at}
          issue={c?.last_error}
          timezone={tz}
        >
          {c && (
            <p className="text-sm">
              <span className="text-muted-foreground">Last meeting received: </span>
              {lastMeeting ? (
                <b>
                  {lastMeeting.title} · {formatDateTime(lastMeeting.at, tz)}
                </b>
              ) : (
                <span>none yet — it appears here after your next recorded call.</span>
              )}
            </p>
          )}
          {c && (
            <div className="flex flex-wrap items-start gap-3">
              <ActionForm action={testFathom} label="Test" pendingLabel="Testing…" variant="outline" />
              <ActionForm action={disconnectFathom} label="Disconnect" variant="ghost" confirm="Disconnect Fathom? New calls will stop arriving in Chief." />
            </div>
          )}
        </ConnectorSummary>

        <Card>
          <CardHeader>
            <CardTitle>{c ? "Replace API key" : "Step 1 — Paste your Fathom API key"}</CardTitle>
            <CardDescription>
              In Fathom: click your profile picture → <b>Settings</b> → <b>API Access</b> → <b>Generate API key</b>, then copy it here.
              Chief checks the key and sets up the connection for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveFathomKey} label={c ? "Save new key" : "Connect Fathom"} pendingLabel="Checking with Fathom…">
              <div className="space-y-1.5">
                <Label htmlFor="api_key">Fathom API key</Label>
                <Input id="api_key" name="api_key" type="password" autoComplete="off" placeholder="Paste key" required />
                <p className="text-xs text-muted-foreground">Stored encrypted. Only Chief&apos;s server can read it.</p>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        {webhookUrl && (
          <Card>
            <CardHeader>
              <CardTitle>{manual ? "Step 2 — Add the webhook in Fathom" : "Webhook"}</CardTitle>
              <CardDescription>
                {manual
                  ? "Fathom didn't let Chief set this up automatically, so add it by hand (about 1 minute)."
                  : "Set up automatically. Fathom sends new meetings to this private address, signed with a secret Chief stores encrypted."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <CopyField label="Your webhook URL" value={webhookUrl} />
              {manual && (
                <>
                  <Steps>
                    <li>In Fathom, go to <b>Settings</b> → <b>API Access</b> → <b>Add webhook</b>.</li>
                    <li>Paste the URL above into <b>Destination URL</b>.</li>
                    <li>Tick <b>Summary</b>, <b>Action items</b> and <b>Transcript</b>. Under recordings, choose <b>My recordings</b>.</li>
                    <li>Click <b>Save</b>. Fathom shows a <b>webhook secret</b> starting with <code>whsec_</code> — copy it.</li>
                    <li>Paste it below and click <b>Save secret</b>.</li>
                  </Steps>
                  <ActionForm action={saveFathomSecret} label="Save secret" pendingLabel="Saving…">
                    <div className="space-y-1.5">
                      <Label htmlFor="webhook_secret">Webhook secret from Fathom</Label>
                      <Input id="webhook_secret" name="webhook_secret" type="password" autoComplete="off" placeholder="whsec_…" required />
                    </div>
                  </ActionForm>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
