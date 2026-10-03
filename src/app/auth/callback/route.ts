import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent("Sign-in was cancelled.")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("Sign-in didn't complete. Please try again.")}`,
    );
  }

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/not-allowed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
