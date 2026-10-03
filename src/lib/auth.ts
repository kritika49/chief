import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isAllowedEmail } from "@/lib/env";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};

/** Returns the signed-in, allowed user or redirects to sign-in. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  if (!isAllowedEmail(user.email)) redirect("/not-allowed");

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    name: (meta.full_name as string) || (meta.name as string) || user.email || "",
    avatarUrl: (meta.avatar_url as string) ?? null,
    isAdmin: isAdminEmail(user.email),
  };
});

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/today");
  return user;
}
