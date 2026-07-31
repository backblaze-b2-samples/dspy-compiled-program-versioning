"""Pydantic models for DSPy optimization runs and their B2 run bundles.

A "run" is one compiled DSPy program version: it bundles the input task, the
compiled program state (prompts + demonstrations), the bootstrapped few-shot
demos, a step-by-step optimization trace, and before/after evaluation scores.
Every field validated here crosses the API boundary — the frontend Runs Library
and run-detail views consume exactly these shapes.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RunStatus = Literal["queued", "running", "completed", "failed"]

# Finite option sets — the create-run form renders these as selectors, and the
# service validates against them so a hand-crafted request can't smuggle an
# unsupported optimizer/metric past the boundary.
OPTIMIZERS = ("BootstrapFewShot", "BootstrapFewShotWithRandomSearch", "LabeledFewShot")
METRICS = ("exact_match",)
TASKS = ("support_ticket_category",)


class RunConfig(BaseModel):
    """The knobs that define a run — everything needed to reproduce it."""

    label: str = Field(min_length=1, max_length=120)
    task: str = "support_ticket_category"
    optimizer: str = "BootstrapFewShot"
    model: str = "llama3.2"
    metric: str = "exact_match"
    max_bootstrapped_demos: int = Field(default=2, ge=0, le=8)
    max_labeled_demos: int = Field(default=2, ge=0, le=8)
    notes: str = Field(default="", max_length=1000)


class Demonstration(BaseModel):
    """One few-shot demonstration bootstrapped into the compiled program."""

    inputs: dict[str, str]
    reasoning: str | None = None
    output: str


class TraceStep(BaseModel):
    """One entry in the optimization trace timeline."""

    step: int
    phase: str
    detail: str
    timestamp: datetime


class EvalScores(BaseModel):
    """Before/after scores on the held-out dev set."""

    metric: str
    baseline_score: float
    compiled_score: float
    score_delta: float
    dev_size: int
    baseline_correct: int
    compiled_correct: int


class CompiledProgram(BaseModel):
    """The compiled program as persisted (human-diffable JSON state)."""

    signature_instructions: str
    input_fields: list[str]
    output_fields: list[str]
    demos: list[Demonstration]
    # Raw `program.save()` JSON state, kept verbatim for exact reproduction/diff.
    raw_state: dict


class RunSummary(BaseModel):
    """One row in the Runs Library list."""

    run_id: str
    label: str
    status: RunStatus
    task: str
    model: str
    optimizer: str
    metric: str
    baseline_score: float | None = None
    compiled_score: float | None = None
    score_delta: float | None = None
    created_at: datetime
    completed_at: datetime | None = None
    error: str | None = None


class RunDetail(BaseModel):
    """Full run view — summary plus every stored artifact."""

    run_id: str
    label: str
    status: RunStatus
    config: RunConfig
    created_at: datetime
    completed_at: datetime | None = None
    error: str | None = None
    # Coarse live-progress the optimizer streams into the manifest as each stage
    # completes (ingest/baseline/optimize/evaluate/done); the detail page polls
    # it so the in-flight view shows an advancing stage, not a frozen spinner.
    stage: str | None = None
    compiled_program: CompiledProgram | None = None
    demos: list[Demonstration] = []
    trace: list[TraceStep] = []
    scores: EvalScores | None = None
    artifact_keys: list[str] = []


class RunCreatedResponse(BaseModel):
    run_id: str
    status: RunStatus


class FieldDiff(BaseModel):
    field: str
    a: str
    b: str
    changed: bool


class RunDiff(BaseModel):
    """Structured diff of two runs' compiled programs, demos, and scores."""

    a: RunSummary
    b: RunSummary
    instructions_diff: FieldDiff
    demo_count_a: int
    demo_count_b: int
    score_delta_a: float | None = None
    score_delta_b: float | None = None
    compiled_score_a: float | None = None
    compiled_score_b: float | None = None


class OllamaStatus(BaseModel):
    """Reachability of the local Ollama server and whether the model is pulled."""

    reachable: bool
    base_url: str
    configured_model: str
    model_pulled: bool
    available_models: list[str] = []
    message: str
