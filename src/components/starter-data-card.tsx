import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { STARTER_OWNER_EMAIL } from "@/lib/starter";
import { loadStarterData } from "@/app/(app)/settings/starter-actions";

/** One-click starter projects, shown only to the first PM until used. */
export async function StarterDataCard({ email }: { email: string }) {
  if (email.toLowerCase() !== STARTER_OWNER_EMAIL) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("starter_data_loaded").maybeSingle();
  if (data?.starter_data_loaded) return null;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Load your starter projects
        </CardTitle>
        <CardDescription>
          Adds Bles (#bles-internal: Manju, Nileshwar), Dontbelated (#dontbelated: Shlok, Shourya) and Italica (design + PM),
          and sets #product_management as where your update goes. You can edit everything afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={loadStarterData} label="Load starter projects" pendingLabel="Loading…" />
      </CardContent>
    </Card>
  );
}
