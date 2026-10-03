import { NextResponse, type NextRequest } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

/** Starts "Sign in with Google": sends the browser to Google via Supabase. */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const nextParam = searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";

  // Placeholder response; cookies (the sign-in verifier) are written onto it.
  const response = NextResponse.redirect(`${origin}/sign-in`);
  const supabase = createRouteClient(request, response);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    const msg = `Couldn't start Google sign-in (${error?.message ?? "no address returned"}). Please try again.`;
    response.headers.set("location", `${origin}/sign-in?error=${encodeURIComponent(msg)}`);
    return response;
  }
  response.headers.set("location", data.url);
  return response;
}
