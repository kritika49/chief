import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that work without signing in. Webhooks verify signatures and
// scheduled jobs check CRON_SECRET in their own handlers.
const PUBLIC_PREFIXES = ["/sign-in", "/auth/", "/not-allowed", "/api/webhooks/", "/api/jobs/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key || url.startsWith("PASTE_")) {
    // Not configured yet: show the sign-in page, which explains what's missing.
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/") signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
