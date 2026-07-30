import type { RunStatus } from "@dcpv/shared";

// Finite option sets — kept in one place and shared by the create form, the
// library filters, and any future edit surface. They mirror the backend's
// OPTIMIZERS / METRICS / TASKS so a selector can never offer an unsupported value.
export const TASK_OPTIONS = [
  { value: "support_ticket_category", label: "Support-ticket category classification" },
] as const;

export const OPTIMIZER_OPTIONS = [
  { value: "BootstrapFewShot", label: "BootstrapFewShot" },
  { value: "BootstrapFewShotWithRandomSearch", label: "BootstrapFewShot + Random Search" },
  { value: "LabeledFewShot", label: "LabeledFewShot" },
] as const;

export const METRIC_OPTIONS = [{ value: "exact_match", label: "Exact match" }] as const;

// A small known list of local Ollama tags. The configured default is merged in
// at render time (see run-form) so the app's own default is always selectable.
export const MODEL_OPTIONS = [
  "llama3.2",
  "llama3.2:1b",
  "llama3.1:8b",
  "qwen2.5:3b",
  "mistral",
] as const;

export const DEMO_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;

/** 0..1 fraction -> integer-percent string. */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return `${Math.round(score * 100)}%`;
}

/** Signed percentage-point delta, e.g. "+33 pts" / "-17 pts" / "no change". */
export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "—";
  const pts = Math.round(delta * 100);
  if (pts === 0) return "no change";
  return `${pts > 0 ? "+" : ""}${pts} pts`;
}

export function deltaTone(delta: number | null | undefined): "up" | "down" | "flat" {
  if (delta === null || delta === undefined || delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};
