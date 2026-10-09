import {
  CalendarClock,
  CheckSquare,
  Gavel,
  History,
  LayoutDashboard,
  ListChecks,
  Plug,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const mainNav: NavItem[] = [
  { href: "/today", label: "Home", icon: LayoutDashboard },
  { href: "/todos", label: "To-dos", icon: CheckSquare },
  { href: "/meetings", label: "Meetings", icon: CalendarClock },
  { href: "/tracker", label: "Tracker", icon: ListChecks },
  { href: "/decisions", label: "Decisions", icon: Gavel },
  { href: "/history", label: "History", icon: History },
];

export const bottomNav: NavItem[] = [
  { href: "/connectors", label: "Connectors", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const adminNav: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

/** Mobile bottom tabs: first three main items, then "More". */
export const mobileTabs: NavItem[] = mainNav.slice(0, 3);
