"use client";

import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDelta, formatScore, deltaTone } from "@/lib/run-format";
import { RunStatusBadge } from "./run-status-badge";

const DELTA_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--success)]",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function RunsTable() {
  const { data: runs = [], isLoading, error, refetch } = useRuns();

  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={FlaskConical}
            title="No optimization runs yet"
            description="Compile your first DSPy program against your local Ollama model. Each run is versioned as an append-only bundle in your B2 bucket."
            action={
              <Button asChild size="sm">
                <Link href="/runs/new">
                  <Plus className="h-3.5 w-3.5" />
                  New run
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Run
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Optimizer
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Before → After
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.run_id} className="table-row-hover">
                <TableCell className="font-medium">
                  <Link
                    href={`/runs/${run.run_id}`}
                    className="block rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {run.label}
                  </Link>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {run.run_id}
                  </span>
                </TableCell>
                <TableCell>
                  <RunStatusBadge status={run.status} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {run.model}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {run.optimizer}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
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
      </CardContent>
    </Card>
  );
}
