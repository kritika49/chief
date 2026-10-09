import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { adminNav, bottomNav, mainNav, mobileTabs, type NavItem } from "./nav";
import { SidebarLink, TabLink } from "./nav-link";
import { ChiefLogo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Link href="/today" className="flex items-center gap-2 px-5 py-5">
          <ChiefLogo className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Chief</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {mainNav.map((item) => (
            <SidebarLink key={item.href} {...linkProps(item)} />
          ))}
        </nav>
        <nav className="flex flex-col gap-1 border-t px-3 py-3" aria-label="Setup">
          {bottomNav.map((item) => (
            <SidebarLink key={item.href} {...linkProps(item)} />
          ))}
          {user.isAdmin && <SidebarLink {...linkProps(adminNav)} />}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background/80 px-4 backdrop-blur md:justify-end md:px-8">
          <Link href="/today" className="flex items-center gap-2 md:hidden">
            <ChiefLogo className="size-7" />
            <span className="font-semibold">Chief</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {mobileTabs.map((item) => (
          <TabLink key={item.href} {...linkProps(item)} />
        ))}
        <TabLink href="/more" label="More" icon={<MoreHorizontal />} />
      </nav>
    </div>
  );
}

function linkProps({ href, label, icon: Icon }: NavItem) {
  return { href, label, icon: <Icon /> };
}
