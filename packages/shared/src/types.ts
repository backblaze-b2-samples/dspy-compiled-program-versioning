export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- DSPy optimization runs ---

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunConfig {
  label: string;
  task: string;
  optimizer: string;
  model: string;
  metric: string;
  max_bootstrapped_demos: number;
  max_labeled_demos: number;
  notes: string;
}

export interface Demonstration {
  inputs: Record<string, string>;
  reasoning: string | null;
  output: string;
}

export interface TraceStep {
  step: number;
  phase: string;
  detail: string;
  timestamp: string;
}

export interface EvalScores {
  metric: string;
  baseline_score: number;
  compiled_score: number;
  score_delta: number;
  dev_size: number;
  baseline_correct: number;
  compiled_correct: number;
}

export interface CompiledProgram {
  signature_instructions: string;
  input_fields: string[];
  output_fields: string[];
  demos: Demonstration[];
  raw_state: Record<string, unknown>;
}

export interface RunSummary {
  run_id: string;
  label: string;
  status: RunStatus;
  task: string;
  model: string;
  optimizer: string;
  metric: string;
  baseline_score: number | null;
  compiled_score: number | null;
  score_delta: number | null;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface RunDetail {
  run_id: string;
  label: string;
  status: RunStatus;
  config: RunConfig;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  compiled_program: CompiledProgram | null;
  demos: Demonstration[];
  trace: TraceStep[];
  scores: EvalScores | null;
  artifact_keys: string[];
}

export interface RunCreatedResponse {
  run_id: string;
  status: RunStatus;
}

export interface FieldDiff {
  field: string;
  a: string;
  b: string;
  changed: boolean;
}

export interface RunDiff {
  a: RunSummary;
  b: RunSummary;
  instructions_diff: FieldDiff;
  demo_count_a: number;
  demo_count_b: number;
  score_delta_a: number | null;
  score_delta_b: number | null;
  compiled_score_a: number | null;
  compiled_score_b: number | null;
}

export interface OllamaStatus {
  reachable: boolean;
  base_url: string;
  configured_model: string;
  model_pulled: boolean;
  available_models: string[];
  message: string;
}
