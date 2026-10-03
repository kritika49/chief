import { FolderKanban, SlidersHorizontal, UserRound, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/link-list";

export const metadata = { title: "Settings · Chief" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Projects, people, schedules and your account." />
      <LinkList
        items={[
          { href: "/settings/projects", label: "Projects", help: "Add, edit, reorder or archive your projects.", icon: FolderKanban },
          { href: "/settings/people", label: "People", help: "Developers, designers and QA you work with.", icon: Users },
          { href: "/settings/preferences", label: "Preferences", help: "Schedules, timezone, target channel, email wording.", icon: SlidersHorizontal },
          { href: "/settings/account", label: "Account", help: "Your profile, sign out, delete your data.", icon: UserRound },
        ]}
      />
    </>
  );
}
