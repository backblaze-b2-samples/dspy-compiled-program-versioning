<!-- last_verified: 2026-07-28 -->
# App Workflows

User journeys inside the application.

## Launch an Optimization Run

- User navigates to `/runs/new`
- The form shows the local Ollama status (reachable? model pulled?) so a missing model is caught before launch, not deep in a compile
- User picks finite options via selectors — task, optimizer, model, metric, bootstrapped/labeled demo counts — with safe defaults pre-filled (a one-click sound demo run); only the label and optional notes are free text
- Submitting `POST /runs` returns immediately with a `run_id`; the user lands on the run detail page
- The compile runs in a background thread against the local model; the detail page shows a "Compiling program…" loader and polls the run's `run.json` status (`queued → running → completed|failed`)
- On completion: a before/after scorecard, the compiled program (signature + demos), the optimization trace, and per-artifact presigned downloads — all read from the run's append-only bundle in B2
- If Ollama is unreachable or the model isn't pulled, the run is recorded as `failed` with an actionable message instead of crashing
- See: [Optimization Runs](features/optimization-runs.md)

## Inspect, Replay, Delete, or Diff a Run

- User navigates to `/runs` (the Runs Library) and opens a run
- **Replay**: re-runs this run's exact config (optionally against a new model) as a brand-new versioned run — the original is untouched
- **Delete**: behind a confirm dialog, recursively deletes every object under `runs/<run_id>/` only — never other runs
- **Diff vs…**: pick another run to compare instructions, demonstration counts, and dev-set scores side by side at `/runs/diff?a=&b=`
- See: [Run Library](features/run-library.md), [Diff and Replay](features/diff-and-replay.md)

## Browse and Manage Files

- User navigates to `/files`
- Page loads the 100 most recent objects from the API (sorted most recent first). While it loads, the page says so on screen and escalates the wording if the wait runs long — a full bucket listing measured 2.8s-21s cold
- If that limit was hit, a notice states how many objects the bucket actually holds — the page never claims to show everything
- Files displayed in tree view with folders and type-specific icons
- Folders auto-expand on load until the *majority* of the listed files are reachable without clicking, so the page's own "click a file" instruction is always actionable. Stopping at the first visible file was not enough: one stray top-level object left the other 99 sealed in collapsed folders while the page claimed to show 100
- Clicking a file row opens its preview; the per-row actions menu (preview / download / delete) is always visible, on every viewport
- Arriving at `/files?preview=<key>` expands that file's folders and opens its preview directly. This is how the ⌘K palette hands off a *specific* file; the param is consumed on arrival so it doesn't re-fire later
- **Preview**: opens dialog with image/PDF preview + metadata panel, and the file's Download / Delete actions — the advertised "click a file" path offers everything the row menu does. The loading state holds until the media paints; a failure offers "Open in a new tab". The preview URL is signed with `Content-Disposition: inline` so PDFs render in place
- **Download**: shows a pending state on the row plus a toast while the presigned URL is fetched, then starts the download via an anchor click (which, unlike a popup, still works if the click's user activation expired during a slow presign). Failures are reported; the click can never silently do nothing
- **Delete**: the confirmation dialog stays open showing "Deleting..." until the request settles, then the row disappears with the toast (optimistic cache update) and the list reconciles with the server. The dialog is held deliberately — Radix closes on action click by default, which dismissed the only pending state and left the row looking untouched while the delete was still in flight
- Empty bucket shows a prompt to launch a run (runs write the first objects)
- See: [File Browser](features/file-browser.md)

## View Dashboard

- User navigates to `/` (home)
- `useRuns()` loads the run summaries (one cached query, shared with the Runs Library)
- Stat cards show: total runs, best compiled score, best improvement, runs today
- The recent-runs table shows the 8 newest runs with status and before→after delta; each row links to that run's detail
- The list polls while any run is still `queued`/`running`, so a running→completed transition appears without a refresh
- Empty state: "No runs yet" with a link to launch one
- See: [Dashboard](features/dashboard.md)

## Change Preferences

- User navigates to `/settings`
- A banner at the top states that the page is mostly a demonstration: only Theme is wired up for real, the rest showcases what a settings page can look like when you adapt the kit
- **Theme** (real): editing it and saving applies it immediately and persists it (`next-themes`), and the header's theme toggle drives the same state
- **Profile and preference fields** (demo): Display name, Bio, Default file view (Tree/List/Grid), Email me on every upload, Warn me when approaching quota + threshold. Each is labelled "Demo field", persists to `localStorage` only, and drives no behaviour — there is no account system, mailer, quota banner, activity log, or List/Grid view behind them yet
- Saving reports honestly: a success toast that separates the real theme change from the locally-stored demo values, or a warning toast if the browser blocked storage (theme still changes). It never claims a save that did not happen — the original page toasted "Settings saved" for fields that changed nothing
- Danger Zone actions are a demo — no real delete runs
- See: [Settings](features/settings.md)
