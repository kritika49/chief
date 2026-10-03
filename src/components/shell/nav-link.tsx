"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function useIsActive(href: string) {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}

type LinkProps = { href: string; label: string; icon: React.ReactNode };

export function SidebarLink({ href, label, icon }: LinkProps) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <span className="[&>svg]:size-4">{icon}</span>
      {label}
    </Link>
  );
}

export function TabLink({ href, label, icon }: LinkProps) {
  const active = useIsActive(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
        active && "text-primary",
      )}
    >
      <span className="[&>svg]:size-5">{icon}</span>
      {label}
    </Link>
  );
}
