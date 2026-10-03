import { FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Draft & Post · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Draft & Post" description="Review, edit and post your daily project update." />
      <EmptyState icon={FileText} title="No draft yet" description="Each morning Chief assembles your daily update from developer EODs, your done to-dos and client-call notes. You'll edit it here, then post it to Slack. Nothing is posted without your OK." />
    </>
  );
}
