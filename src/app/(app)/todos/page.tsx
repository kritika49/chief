import { CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "To-dos · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="To-dos" description="Your checklist per project: Later, Today and Done." />
      <EmptyState icon={CheckSquare} title="No to-dos yet" description="Add to-dos to a project and tick them off as you go. Done items become bullets in your next daily update. Create a project first, then come back here." />
    </>
  );
}
