import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Admin · Chief" };

export default async function Page() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Admin" description="Slack app status and everyone's connector status." />
      <EmptyState icon={ShieldCheck} title="Admin overview coming soon" description="Once connectors are built, this page shows whether the company Slack app is working and which teammates have connected Google, Slack and Fathom." />
    </>
  );
}
