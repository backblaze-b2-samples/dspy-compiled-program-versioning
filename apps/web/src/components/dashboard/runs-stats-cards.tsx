"use client";

import { FlaskConical, Trophy, TrendingUp, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useRuns } from "@/lib/queries";
import { formatDelta, formatScore } from "@/lib/run-format";

export function RunsStatsCards() {
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

  const completed = runs.filter((r) => r.status === "completed");
  const bestScore = completed.reduce<number | null>(
    (best, r) =>
      r.compiled_score !== null && (best === null || r.compiled_score > best)
        ? r.compiled_score
        : best,
    null,
  );
  const bestDelta = completed.reduce<number | null>(
    (best, r) =>
      r.score_delta !== null && (best === null || r.score_delta > best)
        ? r.score_delta
        : best,
    null,
  );
  const today = new Date().toDateString();
  const runsToday = runs.filter(
    (r) => new Date(r.created_at).toDateString() === today,
  ).length;

  const cards = [
    { title: "Total Runs", value: String(runs.length), icon: FlaskConical },
    { title: "Best Compiled Score", value: formatScore(bestScore), icon: Trophy },
    { title: "Best Improvement", value: formatDelta(bestDelta), icon: TrendingUp },
    { title: "Runs Today", value: String(runsToday), icon: CalendarClock },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
