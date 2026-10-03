import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { randomId } from "@/lib/crypto";
import { googleAuthUrl, googleConfigured } from "@/lib/connectors/google";

/** "Connect Google": sends the user to Google's consent screen. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const { origin } = request.nextUrl;
  if (!googleConfigured()) {
    return NextResponse.redirect(
      `${origin}/connectors/google?error=${encodeURIComponent("Google isn't set up yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing in Netlify.")}`,
    );
  }
  const state = randomId();
  const response = NextResponse.redirect(googleAuthUrl(origin, state, user.email));
  response.cookies.set("chief_google_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/connect/google",
    maxAge: 600,
  });
  return response;
}
