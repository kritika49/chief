import { History, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "History · Chief" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("preferences").select("timezone").eq("user_id", user.id).maybeSingle();
  let query = supabase.from("posted_updates").select("id, text, posted_at, slack_channel_ids").order("posted_at", { ascending: false }).limit(50);
  const term = (q ?? "").trim();
  if (term) query = query.ilike("text", `%${term.replace(/[%_]/g, "")}%`);
  const { data: updates } = await query;

  return (
    <>
      <PageHeader title="Update history" description="Every daily update you've posted." />
      <form className="mb-6 flex gap-2" role="search">
        <Input name="q" defaultValue={term} placeholder="Search past updates, e.g. a project or person" />
        <Button type="submit" variant="secondary"><Search /> Search</Button>
      </form>
      {!updates?.length ? (
        <EmptyState
          icon={History}
          title={term ? "Nothing matches that search" : "No updates posted yet"}
          description={term ? "Try a different word." : "After you post your first daily update (or mark it as posted), a copy is kept here so you can search it any time."}
        />
      ) : (
        <div className="space-y-4">
          {updates.map((u) => (
            <Card key={u.id} className="gap-3">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {formatDateTime(u.posted_at, prefs?.timezone)}
                  <Badge variant="secondary">{u.slack_channel_ids?.length ? "Posted by Chief" : "Posted by you"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{u.text}</pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
