import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultLine } from "@/components/action-form";
import { StatusBadge, type Status } from "@/components/status-badge";
import { authTest, slackConfigured } from "@/lib/connectors/slack";
import { googleConfigured } from "@/lib/connectors/google";

export const metadata = { title: "Admin · Chief" };

export default async function AdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  let slack: { ok: true; team: string; bot: string } | { ok: false; error: string };
  if (!slackConfigured()) slack = { ok: false, error: "SLACK_BOT_TOKEN isn't set in Netlify." };
  else {
    try {
      const a = await authTest();
      slack = { ok: true, team: a.team, bot: a.user };
    } catch (e) {
      slack = { ok: false, error: e instanceof Error ? e.message : "Couldn't reach Slack." };
    }
  }

  const [{ data: profiles }, { data: conns }] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, slack_user_id, created_at").order("created_at"),
    admin.from("connections").select("user_id, provider, status"),
  ]);
  const statusOf = (userId: string, provider: string): Status =>
    (conns?.find((c) => c.user_id === userId && c.provider === provider)?.status as Status) ?? "not_connected";

  return (
    <>
      <PageHeader title="Admin" description="Company-wide setup and everyone's connector status." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Company settings</CardTitle>
            <CardDescription>Shared by all PMs. Changed in Netlify environment variables.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-muted-foreground">Slack app</span>
              {slack.ok ? (
                <span>
                  <Badge variant="success" className="mr-2">Working</Badge>
                  {slack.team} · @{slack.bot}
                </span>
              ) : (
                <ResultLine ok={false} message={slack.error} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 text-muted-foreground">Google keys</span>
              {googleConfigured() ? <Badge variant="success">Set</Badge> : <ResultLine ok={false} message="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing." />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>People using Chief ({profiles?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Person</th>
                    <th className="py-2 font-medium">Google</th>
                    <th className="py-2 font-medium">Slack</th>
                    <th className="py-2 font-medium">Fathom</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(profiles ?? []).map((p) => (
                    <tr key={p.id}>
                      <td className="py-3">
                        <div className="font-medium">{p.full_name ?? p.email}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td><StatusBadge status={statusOf(p.id, "google")} /></td>
                      <td><StatusBadge status={p.slack_user_id ? statusOf(p.id, "slack") : "not_connected"} /></td>
                      <td><StatusBadge status={statusOf(p.id, "fathom")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
