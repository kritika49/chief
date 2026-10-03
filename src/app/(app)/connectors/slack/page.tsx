import { Hash, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, ResultLine } from "@/components/action-form";
import { BackToConnectors, ConnectorSummary } from "@/components/connector-summary";
import { myConnections, myTimezone } from "@/lib/connectors/status";
import { saveConnection } from "@/lib/connectors/store";
import {
  authTest,
  displayName,
  listChannels,
  listUsers,
  lookupUserByEmail,
  slackConfigured,
  type SlackChannel,
  type SlackUser,
} from "@/lib/connectors/slack";
import { autoLinkSlack, pickSlackUser, testSlack, unlinkSlack } from "../actions";

export const metadata = { title: "Slack · Chief" };

export default async function SlackPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const configured = slackConfigured();

  let bot: { name: string; team: string } | null = null;
  let appError: string | null = null;
  if (configured) {
    try {
      const a = await authTest();
      bot = { name: a.user, team: a.team };
    } catch (e) {
      appError = e instanceof Error ? e.message : "Couldn't reach Slack.";
    }
  }

  const { data: profile } = await supabase.from("profiles").select("slack_user_id, slack_user_name").eq("id", user.id).maybeSingle();
  let linkedId = profile?.slack_user_id ?? null;
  let linkedName = profile?.slack_user_name ?? null;

  // First visit: match the user's Slack account by email automatically.
  if (bot && !linkedId) {
    try {
      const found = await lookupUserByEmail(user.email);
      if (found) {
        linkedId = found.id;
        linkedName = displayName(found);
        await supabase.from("profiles").update({ slack_user_id: linkedId, slack_user_name: linkedName }).eq("id", user.id);
        await saveConnection(user.id, "slack", {
          status: "connected",
          account_label: linkedName,
          settings: { slack_user_id: linkedId },
          last_sync_at: new Date().toISOString(),
          last_error: null,
        });
      }
    } catch {
      // Show the manual picker instead.
    }
  }

  let users: SlackUser[] = [];
  let channels: SlackChannel[] = [];
  if (bot) {
    [users, channels] = await Promise.all([
      linkedId ? Promise.resolve([]) : listUsers().catch(() => []),
      listChannels().catch(() => []),
    ]);
  }
  const [conns, tz] = await Promise.all([myConnections(), myTimezone(user.id)]);
  const c = conns.slack;
  const status = appError ? "needs_attention" : linkedId ? (c?.status ?? "connected") : "not_connected";
  const memberChannels = channels.filter((ch) => ch.is_member);
  const otherChannels = channels.filter((ch) => !ch.is_member);

  return (
    <>
      <BackToConnectors />
      <PageHeader title="Slack" description="Chief reads EOD messages in your project channels and posts your updates, task lists and reminders." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Slack app</CardTitle>
            <CardDescription>One Chief app is shared by everyone in your workspace. Your admin sets it up once.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {!configured && <p className="text-muted-foreground">Not set up yet. Your admin needs to create the Chief Slack app (see SETUP_GUIDE.md, Part G).</p>}
            {appError && <ResultLine ok={false} message={appError} />}
            {bot && (
              <p>
                <Badge variant="success" className="mr-2">Working</Badge>
                Installed in <b>{bot.team}</b> as <b>@{bot.name}</b>.
              </p>
            )}
          </CardContent>
        </Card>

        {bot && (
          <ConnectorSummary
            title="Your Slack account"
            description="Chief sends your draft-ready notes and reminders to this account as direct messages."
            status={status}
            account={linkedName}
            lastSync={c?.last_sync_at}
            issue={c?.last_error}
            timezone={tz}
          >
            {linkedId ? (
              <div className="flex flex-wrap items-start gap-3">
                <ActionForm action={testSlack} label="Test (send me a DM)" pendingLabel="Sending…" variant="outline" />
                <ActionForm action={unlinkSlack} label="Unlink" variant="ghost" confirm="Unlink your Slack account from Chief?" />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  We couldn&apos;t find a Slack account using <b>{user.email}</b>. Pick yourself from the list.
                </p>
                <ActionForm action={pickSlackUser} label="Link this account" pendingLabel="Linking…">
                  <select
                    name="slack_user_id"
                    required
                    defaultValue=""
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="" disabled>
                      Choose your name…
                    </option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayName(u)}
                        {u.profile.email ? ` (${u.profile.email})` : ""}
                      </option>
                    ))}
                  </select>
                </ActionForm>
                <ActionForm action={autoLinkSlack} label="Try matching by email again" variant="ghost" />
              </div>
            )}
          </ConnectorSummary>
        )}

        {bot && (
          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardDescription>
                Chief can only read and post in channels it has been invited to. To add it, open the channel in Slack and type{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">/invite @{bot.name}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <ChannelList title={`Chief is in (${memberChannels.length})`} channels={memberChannels} member />
              <ChannelList title={`Not invited yet (${otherChannels.length})`} channels={otherChannels} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function ChannelList({ title, channels, member }: { title: string; channels: SlackChannel[]; member?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      {channels.length === 0 ? (
        <p className="text-muted-foreground">{member ? "None yet. Invite Chief to your project channels." : "—"}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <li key={ch.id}>
              <Badge variant={member ? "success" : "outline"} className="font-normal">
                {ch.is_private ? <Lock /> : <Hash />}
                {ch.name}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
