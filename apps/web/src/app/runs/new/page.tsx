import { RunForm } from "@/components/runs/run-form";

export default function NewRunPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">New run</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Compile an improved DSPy program against your local Ollama model. When it
          finishes, the compiled program, its bootstrapped demonstrations, the
          optimization trace, and before/after scores are written to Backblaze B2 as a
          new, versioned run bundle.
        </p>
      </div>
      <RunForm />
    </div>
  );
}
