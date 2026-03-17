# Status

## Current Snapshot

- Date: 2026-03-18
- Repository phase: v1 local workflow implemented, selected live validation complete, docs closeout aligned
- Runtime mode: CLI-first Codex runtime with Docker-first development
- Implementation state: daemon, VSCode frontend, Feishu bridge, manual import, and recovery are implemented; the selected live closeout path is validated for runtime, desktop, and Feishu, and QA now treats merge readiness as `conditional go`

## Completed

- Created the repository and Docker-first monorepo skeleton
- Locked the product direction to `Codex CLI + codex app-server`
- Chosen VSCode as the desktop UI layer and Feishu as the mobile UI layer
- Defined the requirement to auto-commit each independently testable major change slice
- Implemented auth/runtime scaffolding for `codex app-server`
- Implemented shared task, event, approval, and image asset protocol
- Implemented daemon task orchestration, WebSocket snapshots, uploads, and approvals
- Implemented a VSCode desktop task dashboard with commands, diff viewing, status panel, and image upload flow
- Implemented Feishu root-message binding, reply routing, signature/token checks, and duplicate webhook suppression
- Reworked Feishu into pure-thread mode with explicit `/new` task creation, persisted execution profiles, and slash-command-only control routing
- Removed Feishu status-summary push behavior so mobile threads only surface final agent replies, approvals, explicit errors, and command results
- Implemented manual thread import/resume plus a small CLI wrapper
- Implemented recovery reconciliation and stale approval expiration on restart
- Aligned the `stdio` runtime adapter with the live app-server schema for `thread/list`, timestamp normalization, object-shaped thread status, and `turn/steer`
- Added Docker mounts for a host Codex binary directory and host Codex home during live validation
- Verified live daemon startup, `/health`, `/auth/account`, `/auth/rate-limits`, and task reconciliation against a real ChatGPT-backed Codex home
- Added a read-only live runtime validation script plus an opt-in no-prompt thread creation check
- Added a checked-in VSCode Extension Development Host launch configuration for the desktop frontend
- Verified the live runtime helper in Docker against the mock daemon in both read-only and create-thread modes
- Added a multi-agent worktree coordination guide with role boundaries, mention rules, and bootstrap prompts
- Added `scripts/hub-cli.mjs` and the shared hub workflow for cross-worktree agent communication
- Added hub integration tests for init, post, broadcast, ack, done, status, doctor, and concurrent writes
- Switched the multi-agent workflow design from branch-local handoff docs to the sibling shared hub at `/home/dungloi/Workspaces/codex-feishu-bridge-hub`
- Completed the runtime live closeout path on the authoritative daemon `http://127.0.0.1:8891`, including real `thread/start`, `turn/start`, immediate `turn/steer`, immediate `turn/interrupt`, approval accept flow, and structured diff recovery for the affected real task path
- Completed the desktop live closeout path on `http://127.0.0.1:8891`, including task tree, detail panel, diff opening, approval resolution, image upload, and a bounded post-fix diff recheck
- Completed the Feishu live closeout path with the official SDK long-connection client, including ingress delivery, thread continuity, and live control-command routing for `interrupt`, `retry`, `cancel`, `approve`, and `decline`
- Integrated the selected runtime, desktop, and Feishu closeout commits onto `master`, plus two integration fixes for worktree bootstrap behavior and Feishu webhook approval payload alignment
- Collected QA final guidance as `conditional go`: no active blocker remains for the selected live path, but a few non-gating capabilities remain outside this round's proof boundary

## Implemented But Not Yet Live-Validated

- Runtime manual import and resume were not re-proven as separate real-stdio closeout slices in this round
- Desktop `login` entry and `retry` action were not retained as standalone final live-evidence slices
- Feishu webhook/public-callback compatibility remains implemented but was not the selected live-validation path for this round

## Next Iteration Focus

- Decide whether the current `conditional go` bar is sufficient for release-style signoff, or whether the remaining non-gating paths need separate proof
- If the release bar widens, re-prove runtime manual import/resume on real `stdio`
- If the release bar widens, capture standalone desktop live evidence for `login` and `retry`
- If the compatibility path still matters, run a dedicated live pass for Feishu webhook/public-callback ingress
- If the mobile UX needs widening, decide whether `/new` should stay explicit-only or eventually allow an opt-in auto-create policy
- Decide whether to keep the current verbose Feishu ingress diagnostics as-is or tone them down after closeout
- Optionally refresh QA-owned evidence snapshots if long-lived acceptance records are required beyond the coordinator closeout docs

## Deferred Decisions

- Whether to promote the CLI wrapper into a dedicated `apps/` package instead of keeping it under `scripts/`
- Whether the current Feishu ingress diagnostics should remain at their present verbosity
- Whether a future cloud relay or multi-user deployment path belongs in scope after live validation
