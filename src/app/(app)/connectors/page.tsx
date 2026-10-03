import { Plug } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Connectors · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Connectors" description="Connect the tools Chief reads from and posts to." />
      <EmptyState icon={Plug} title="Connectors arrive in the next step" description="This is where you'll connect Google (calendar and Gmail drafts), Slack (EODs and posting) and Fathom (call notes). Each shows its status and a Test button." />
    </>
  );
}
