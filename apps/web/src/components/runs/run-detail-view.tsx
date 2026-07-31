"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  GitCompare,
  RotateCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { GeneratingLoader } from "@/components/ui/generating-loader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRunArtifactUrl } from "@/lib/api-client";
import { useDeleteRun, useReplayRun, useRun, useRuns } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { deltaTone, formatDelta, formatScore } from "@/lib/run-format";
import { RunStatusBadge } from "./run-status-badge";

const DELTA_CLASS: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--success)]",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

const ARTIFACTS = ["manifest", "input", "compiled", "demos", "trace", "scores"] as const;

// Friendly labels for the coarse stages the backend streams into `run.stage`
// while a compile is in flight, so the loader advances through the pipeline
// instead of showing one static string the whole time.
const STAGE_LABELS: Record<string, string> = {
  ingest: "Ingesting task & datasets…",
  baseline: "Scoring the zero-shot baseline…",
  optimize: "Optimizing (bootstrapping demonstrations)…",
  evaluate: "Evaluating the compiled program…",
  done: "Finalizing…",
};

export function RunDetailView({ runId }: { runId: string }) {
  const router = useRouter();
  const { data: run, isLoading, error, refetch } = useRun(runId);
  const { data: allRuns = [] } = useRuns();
  const replay = useReplayRun();
  const del = useDeleteRun();
  const [compareId, setCompareId] = useState<string>("");

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !run) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const inFlight = run.status === "queued" || run.status === "running";
  const stageLabel = (run.stage && STAGE_LABELS[run.stage]) || "Compiling program…";
  const otherRuns = allRuns.filter((r) => r.run_id !== run.run_id);

  const onReplay = () =>
    replay.mutate(
      { runId: run.run_id },
      {
        onSuccess: (res) => {
          toast.success("Replay launched");
          router.push(`/runs/${res.run_id}`);
        },
        onError: (e) =>
          toast.error("Replay failed", {
            description: e instanceof Error ? e.message : "Unknown error",
          }),
      },
    );

  const onDelete = () =>
    del.mutate(run.run_id, {
      onSuccess: () => {
        toast.success("Run deleted");
        router.push("/runs");
      },
      onError: (e) =>
        toast.error("Delete failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        }),
    });

  const downloadArtifact = async (name: string) => {
    try {
      const { url } = await getRunArtifactUrl(run.run_id, name);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("Could not build download link", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in border-b border-border pb-5">
        <Link
          href="/runs"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to runs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title">{run.label}</h1>
              <RunStatusBadge status={run.status} />
            </div>
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">{run.run_id}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.config.model} · {run.config.optimizer} · {run.config.metric} · created{" "}
              {formatDate(run.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReplay}
              disabled={replay.isPending || inFlight}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Replay
            </Button>
            {otherRuns.length > 0 && (
              <div className="flex items-center gap-1">
                <Select value={compareId} onValueChange={setCompareId}>
                  <SelectTrigger className="h-8 w-40" size="sm">
                    <SelectValue placeholder="Diff vs…" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherRuns.map((r) => (
                      <SelectItem key={r.run_id} value={r.run_id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!compareId}
                  onClick={() =>
                    router.push(`/runs/diff?a=${run.run_id}&b=${compareId}`)
                  }
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Diff
                </Button>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={del.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every object under{" "}
                    <code className="font-mono">runs/{run.run_id}/</code> in your B2
                    bucket — the manifest, input bundle, compiled program, demos, trace,
                    and scores. Other runs are untouched. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete run</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {inFlight && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <GeneratingLoader size="lg" label={stageLabel} />
            <p className="max-w-md text-center text-sm text-muted-foreground">
              Bootstrapping demonstrations against {run.config.model} and evaluating
              before/after on the dev set. This page updates itself as the run
              progresses.
            </p>
          </CardContent>
        </Card>
      )}

      {run.status === "failed" && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>This run failed</AlertTitle>
          <AlertDescription>{run.error ?? "Unknown error."}</AlertDescription>
        </Alert>
      )}

      {run.status === "completed" && run.scores && (
        <div className="grid gap-4 sm:grid-cols-3">
          <ScoreCard label="Baseline (zero-shot)" value={formatScore(run.scores.baseline_score)} />
          <ScoreCard label="Compiled" value={formatScore(run.scores.compiled_score)} />
          <ScoreCard
            label="Delta"
            value={formatDelta(run.scores.score_delta)}
            className={DELTA_CLASS[deltaTone(run.scores.score_delta)]}
            sub={`${run.scores.compiled_correct}/${run.scores.dev_size} correct on dev`}
          />
        </div>
      )}

      {run.compiled_program && (
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Compiled program</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Signature instructions
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs">
                {run.compiled_program.signature_instructions}
              </pre>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                <span className="text-muted-foreground">Inputs:</span>{" "}
                <span className="font-mono">
                  {run.compiled_program.input_fields.join(", ")}
                </span>
              </span>
              <span>
                <span className="text-muted-foreground">Outputs:</span>{" "}
                <span className="font-mono">
                  {run.compiled_program.output_fields.join(", ")}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {run.demos.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">
              Bootstrapped demonstrations ({run.demos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Input
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reasoning
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Output
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.demos.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="align-top text-sm">
                      {Object.values(d.inputs).join(" ")}
                    </TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">
                      {d.reasoning ?? "—"}
                    </TableCell>
                    <TableCell className="align-top font-mono text-sm">{d.output}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {run.trace.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Optimization trace</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <ol className="space-y-3">
              {run.trace.map((step) => (
                <li key={step.step} className="flex gap-3 text-sm">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px]">
                    {step.step}
                  </span>
                  <div>
                    <span className="font-medium capitalize">{step.phase}</span>
                    <span className="ml-2 text-muted-foreground">{step.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border py-4 px-5">
          <CardTitle className="card-title">Run bundle artifacts (Backblaze B2)</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="mb-4 text-sm text-muted-foreground">
            Each artifact is a separate object under{" "}
            <code className="font-mono">runs/{run.run_id}/</code>. Download the raw JSON
            straight from B2 with a presigned URL.
          </p>
          <div className="flex flex-wrap gap-2">
            {ARTIFACTS.map((name) => (
              <Button
                key={name}
                variant="outline"
                size="sm"
                onClick={() => downloadArtifact(name)}
              >
                <Download className="h-3.5 w-3.5" />
                {name}
              </Button>
            ))}
          </div>
          {run.artifact_keys.length > 0 && (
            <>
              <Separator className="my-4" />
              <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                {run.artifact_keys.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`mt-2 text-3xl font-semibold tabular-nums ${className ?? ""}`}>
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
