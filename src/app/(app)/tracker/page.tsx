import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Tracker · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Tracker" description="Client follow-ups and standup tasks in one place." />
      <EmptyState icon={ListChecks} title="Nothing to track yet" description="Follow-ups you promise on client calls and tasks assigned in standups will show up here, with due dates and overdue warnings." />
    </>
  );
}
