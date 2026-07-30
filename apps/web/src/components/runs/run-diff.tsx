"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useRunDiff } from "@/lib/queries";
import { deltaTone, formatDelta, formatScore } from "@/lib/run-format";
import { RunStatusBadge } from "./run-status-badge";
import type { RunSummary } from "@dcpv/shared";

const DELTA_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--success)]",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function RunDiff({ a, b }: { a: string; b: string }) {
  const enabled = !!a && !!b;
  const { data: diff, isLoading, error, refetch } = useRunDiff(a, b, { enabled });

  if (!enabled) {
    return (
      <EmptyState
        title="Pick two runs to diff"
        description="Open a run and use “Diff vs…” to compare it against another version."
      />
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !diff) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to runs
      </Link>

      <div className="grid gap-4 sm:grid-cols-2">
        <RunColumn title="Run A" run={diff.a} score={diff.compiled_score_a} delta={diff.score_delta_a} demos={diff.demo_count_a} />
        <RunColumn title="Run B" run={diff.b} score={diff.compiled_score_b} delta={diff.score_delta_b} demos={diff.demo_count_b} />
      </div>

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Signature instructions</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="mb-3">
            <Badge variant={diff.instructions_diff.changed ? "secondary" : "outline"}>
              {diff.instructions_diff.changed ? "Changed" : "Identical"}
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs">
              {diff.instructions_diff.a || "—"}
            </pre>
            <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs">
              {diff.instructions_diff.b || "—"}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RunColumn({
  title,
  run,
  score,
  delta,
  demos,
}: {
  title: string;
  run: RunSummary;
  score: number | null;
  delta: number | null;
  demos: number;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="card-title">{title}</CardTitle>
          <RunStatusBadge status={run.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-5 text-sm">
        <p className="font-medium">{run.label}</p>
        <p className="font-mono text-xs text-muted-foreground">{run.run_id}</p>
        <dl className="mt-3 space-y-1.5">
          <Row k="Model" v={run.model} />
          <Row k="Optimizer" v={run.optimizer} />
          <Row k="Compiled score" v={formatScore(score)} />
          <Row
            k="Delta"
            v={formatDelta(delta)}
            className={DELTA_CLASS[deltaTone(delta)]}
          />
          <Row k="Demonstrations" v={String(demos)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`font-mono tabular-nums ${className ?? ""}`}>{v}</dd>
    </div>
  );
}
