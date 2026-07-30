import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RunsTable } from "@/components/runs/runs-table";

export default function RunsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Runs</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Every DSPy optimization run, versioned as an append-only bundle in your
            Backblaze B2 bucket. Open a run to inspect its compiled program, demos,
            trace, and before/after scores — or diff two versions.
          </p>
        </div>
        <Button asChild size="sm" className="h-8">
          <Link href="/runs/new">
            <Plus className="h-3.5 w-3.5" />
            New run
          </Link>
        </Button>
      </div>
      <RunsTable />
    </div>
  );
}
