"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, email, avatarUrl }: { name: string; email: string; avatarUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initials || <UserRound className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">
            <UserRound /> Account
          </Link>
        </DropdownMenuItem>
        <form action="/auth/sign-out" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
