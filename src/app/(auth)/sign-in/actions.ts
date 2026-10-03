"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get("next") || "/today");
  const h = await headers();
  const origin = h.get("origin") ?? process.env.APP_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    redirect(`/sign-in?error=${encodeURIComponent("Couldn't start Google sign-in. Please try again.")}`);
  }
  redirect(data.url);
}
