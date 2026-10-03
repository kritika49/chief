import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { LinkList, type LinkListItem } from "@/components/link-list";
import { adminNav, bottomNav, mainNav, mobileTabs } from "@/components/shell/nav";

export const metadata = { title: "More · Chief" };

const help: Record<string, string> = {
  "/tracker": "Follow-ups and standup tasks.",
  "/decisions": "Decisions from client calls.",
  "/history": "Every update you've posted.",
  "/connectors": "Google, Slack and Fathom.",
  "/settings": "Projects, people and preferences.",
  "/admin": "Slack app and team connector status.",
};

export default async function MorePage() {
  const user = await requireUser();
  const items = [...mainNav.filter((n) => !mobileTabs.includes(n)), ...bottomNav, ...(user.isAdmin ? [adminNav] : [])];
  return (
    <>
      <PageHeader title="More" />
      <LinkList items={items.map<LinkListItem>((n) => ({ ...n, help: help[n.href] ?? "" }))} />
    </>
  );
}
