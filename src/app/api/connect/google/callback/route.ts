import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { emailFromIdToken, exchangeCode } from "@/lib/connectors/google";
import { getConnection, saveConnection } from "@/lib/connectors/store";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const { origin, searchParams } = request.nextUrl;
  const back = (q: string) => {
    const r = NextResponse.redirect(`${origin}/connectors/google?${q}`);
    r.cookies.delete({ name: "chief_google_state", path: "/api/connect/google" });
    return r;
  };
  const fail = (msg: string) => back(`error=${encodeURIComponent(msg)}`);

  const error = searchParams.get("error");
  if (error) return fail(error === "access_denied" ? "Google connection was cancelled." : `Google said: ${error}`);

  const state = searchParams.get("state");
  if (!state || state !== request.cookies.get("chief_google_state")?.value) {
    return fail("That Google link expired. Please click Connect Google again.");
  }
  const code = searchParams.get("code");
  if (!code) return fail("Google didn't return a code. Please try again.");

  try {
    const tokens = await exchangeCode(origin, code);
    const granted = tokens.scope ?? "";
    if (!granted.includes("calendar.readonly") || !granted.includes("gmail.compose")) {
      return fail("Please tick both boxes (Calendar and Gmail) on Google's screen so Chief can work.");
    }
    const existing = await getConnection(user.id, "google");
    if (!tokens.refresh_token && !existing?.credentials_encrypted) {
      return fail("Google didn't give Chief lasting access. Please click Connect Google again.");
    }
    await saveConnection(user.id, "google", {
      status: "connected",
      account_label: emailFromIdToken(tokens.id_token) ?? user.email,
      ...(tokens.refresh_token ? { credentials: { refresh_token: tokens.refresh_token } } : {}),
      settings: { calendars: (existing?.settings?.calendars as string[] | undefined) ?? ["primary"] },
      last_sync_at: new Date().toISOString(),
      last_error: null,
    });
    return back("connected=1");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't finish connecting Google.");
  }
}
