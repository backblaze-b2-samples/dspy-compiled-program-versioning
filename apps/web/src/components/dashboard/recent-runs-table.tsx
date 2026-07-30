"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useRuns } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { deltaTone, formatDelta, formatScore } from "@/lib/run-format";
import { RunStatusBadge } from "@/components/runs/run-status-badge";

const DELTA_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--success)]",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function RecentRunsTable() {
  const { data: runs = [], isLoading, error, refetch } = useRuns();
  const recent = runs.slice(0, 8);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Runs</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/runs"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No runs yet"
            description="Launch a run to compile and version your first DSPy program."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[38%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Run
                </TableHead>
                <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[24%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Delta
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((run) => (
                <TableRow key={run.run_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/runs/${run.run_id}`}
                      className="block truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      title={run.label}
                    >
                      {run.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {run.status === "completed" ? (
                      <span className="text-sm">
                        {formatScore(run.baseline_score)} → {formatScore(run.compiled_score)}{" "}
                        <span className={DELTA_CLASS[deltaTone(run.score_delta)]}>
                          ({formatDelta(run.score_delta)})
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(run.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
