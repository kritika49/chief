import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Meetings · Chief" };

export default function Page() {
  return (
    <>
      <PageHeader title="Meetings" description="Client calls and standups recorded by Fathom." />
      <EmptyState icon={CalendarClock} title="No meetings yet" description="When Fathom finishes processing a call, it appears here for you to review: pick key points for your update, log decisions and route action items. Connect Fathom to get started." />
    </>
  );
}
