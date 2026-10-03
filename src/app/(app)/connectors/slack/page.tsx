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
  checkChannel,
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
  let saveProblem: string | null = null;
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
        }).catch((e) => {
          saveProblem = e instanceof Error ? e.message : String(e);
        });
      }
    } catch {
      // Show the manual picker instead.
    }
  }

  // Each project channel, checked directly (private channels don't show in the general list).
  const { data: projectChannels } = await supabase
    .from("channels")
    .select("slack_channel_id, slack_channel_name, project:projects(name, active)")
    .eq("active", true);
  const checks = bot
    ? await Promise.all(
        ((projectChannels ?? []) as unknown as { slack_channel_id: string; slack_channel_name: string | null; project: { name: string; active: boolean } | null }[])
          .filter((c) => c.project?.active)
          .map(async (c) => ({ ...c, check: await checkChannel(c.slack_channel_id) })),
      )
    : [];

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
            {saveProblem && <ResultLine ok={false} message={`Chief couldn't save your Slack link: ${saveProblem}. Check SUPABASE_SERVICE_ROLE_KEY in Netlify.`} />}
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
              <div>
                <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your project channels</div>
                {checks.length === 0 ? (
                  <p className="text-muted-foreground">No project channels yet. Add them in Settings → Projects.</p>
                ) : (
                  <ul className="space-y-2">
                    {checks.map((c) => (
                      <li key={c.slack_channel_id} className="flex flex-wrap items-center gap-2">
                        {c.check.isPrivate ? <Lock className="size-3.5 text-muted-foreground" /> : <Hash className="size-3.5 text-muted-foreground" />}
                        <span className="font-medium">{c.check.name ?? c.slack_channel_name ?? c.slack_channel_id}</span>
                        <span className="text-xs text-muted-foreground">{c.project?.name}</span>
                        {c.check.readable ? (
                          <Badge variant="success">Chief can read it</Badge>
                        ) : c.check.member ? (
                          <Badge variant="warning">Chief is in, but can&apos;t read: {c.check.problem}</Badge>
                        ) : c.check.problem ? (
                          <Badge variant="warning">{c.check.problem}</Badge>
                        ) : (
                          <Badge variant="outline">Not invited — type /invite @{bot.name} in it</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ChannelList title={`Other channels Chief is in (${memberChannels.filter((ch) => !checks.some((c) => c.slack_channel_id === ch.id)).length})`} channels={memberChannels.filter((ch) => !checks.some((c) => c.slack_channel_id === ch.id))} member />
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
