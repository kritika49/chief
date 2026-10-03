import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Supabase client for Route Handlers that writes auth cookies directly onto
 * the response we return (most reliable for sign-in redirects).
 */
export function createRouteClient(request: NextRequest, response: NextResponse) {
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
}
