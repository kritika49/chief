import { Gavel } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Decision log · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Decision log" description="Every decision made on client calls, searchable." />
      <EmptyState icon={Gavel} title="No decisions logged yet" description="When you review a client call, tag any summary line as a Decision and it will be saved here with a link back to the call." />
    </>
  );
}
