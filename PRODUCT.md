# Product

## Register

product

## Users

ML engineers and researchers building production LLM pipelines with **DSPy** who need a
durable, auditable history of their compiled programs. Their context: prompt optimization
is expensive to redo and easy to lose; a compiled program (prompts + bootstrapped demos +
the scores that justify them) is a real artifact worth versioning. They run optimization
locally (DSPy + Ollama, no per-token billing) and want every compiled version stored,
comparable, and rollback-capable — with Backblaze B2 as the memory layer.

## Product Purpose

A B2 sample app that demonstrates **using Backblaze B2 as the durable, auditable memory
layer for a DSPy prompt-optimization workflow** running entirely offline against a local
Ollama model. Each run compiles an improved DSPy program, then appends the compiled
program, its demonstrations, the optimization trace, and before/after evaluation scores to
B2 as an append-only, versioned run bundle. Success = a researcher can launch a run, watch
it compile against a local model, and then browse, diff, roll back, or replay every prior
compiled version — with B2 keys as the only credential required.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype ("Stop
wiring boilerplate and start building"). The interface should feel like a modern
developer tool — considered, calm, trustworthy — not a marketing showpiece. It is a
**neutral foundation** that others rebrand: the design carries craft through restraint,
not through a strong opinionated identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as production-grade.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the production quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
