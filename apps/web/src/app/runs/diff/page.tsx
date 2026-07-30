import { RunDiff } from "@/components/runs/run-diff";

export default async function RunDiffPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a = "", b = "" } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Diff runs</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Compare two compiled DSPy program versions — their instructions, demonstration
          counts, and dev-set scores — side by side.
        </p>
      </div>
      <RunDiff a={a} b={b} />
    </div>
  );
}
