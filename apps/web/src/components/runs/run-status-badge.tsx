import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { RunStatus } from "@dcpv/shared";
import { STATUS_LABEL } from "@/lib/run-format";

const VARIANT: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "running"
          ? Loader2
          : Clock;
  return (
    <Badge variant={VARIANT[status]} className="gap-1">
      <Icon className={status === "running" ? "animate-spin" : ""} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
