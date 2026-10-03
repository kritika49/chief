import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Update history · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Update history" description="Every daily update you've posted." />
      <EmptyState icon={History} title="No updates posted yet" description="After you approve and post your first daily update, a copy is kept here so you can search past updates any time." />
    </>
  );
}
