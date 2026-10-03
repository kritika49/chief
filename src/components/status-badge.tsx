import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Status = "connected" | "needs_attention" | "not_connected";

export function StatusBadge({ status }: { status: Status }) {
  if (status === "connected")
    return (
      <Badge variant="success">
        <CheckCircle2 /> Connected
      </Badge>
    );
  if (status === "needs_attention")
    return (
      <Badge variant="warning">
        <AlertTriangle /> Needs attention
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <CircleDashed /> Not connected
    </Badge>
  );
}
