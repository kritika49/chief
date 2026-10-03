import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { isAllowedEmail } from "@/lib/env";

/** Google (via Supabase) sends the browser back here after sign-in. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";
  const fail = (msg: string) =>
    NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(msg)}`);

  if (!code) {
    const reason = searchParams.get("error_description") ?? searchParams.get("error");
    return fail(reason ? `Google sign-in failed: ${reason}` : "Sign-in was cancelled.");
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createRouteClient(request, response);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return fail(`Sign-in didn't complete (${error?.message ?? "no user returned"}). Please try again.`);
  }

  if (!isAllowedEmail(data.user.email)) {
    const denied = NextResponse.redirect(`${origin}/not-allowed`);
    await createRouteClient(request, denied).auth.signOut();
    return denied;
  }

  return response;
}
