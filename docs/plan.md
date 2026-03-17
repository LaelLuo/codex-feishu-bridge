# Plan

`docs/plan.md` is the single execution-plan source for this repository.
The historical root `PLAN.md` draft has been absorbed here and removed to avoid split planning.

## Completed Phases

### Phase 0: Docs and Repo Conventions

- Rewrote product and architecture docs for the CLI-first runtime.
- Locked the commit policy into `AGENTS.md` and `docs/agents.md`.
- Updated `README.md`, `docs/status.md`, and `docs/log.md`.
- Validation: doc consistency checks and repo self-checks.
- Commit boundary: `📝 docs: align repository with cli-first codex bridge plan`.
- Status: completed.

### Phase 1: Runtime and Auth

- Added a Codex runtime adapter inside `bridge-daemon`.
- Managed `codex app-server` and exposed auth endpoints.
- Mounted a shared Codex home path in Docker for the local dev path.
- Validation: daemon health plus mockable auth flow tests.
- Commit boundary: `✨ feat: add codex app-server auth runtime`.
- Status: completed.

### Phase 2: Protocol and Task Model

- Defined bridge task, event, approval, client, and image asset contracts.
- Locked `bridge-managed` and `manual-import` task modes.
- Kept `taskId = threadId` as the bridge-managed primary mapping rule.
- Validation: protocol unit tests and serialization checks.
- Commit boundary: `✨ feat: define bridge task and event protocol`.
- Status: completed.

### Phase 3: Daemon Core

- Implemented task orchestration, event fanout, uploads, approvals, snapshots, and restart recovery.
- Exposed HTTP and WebSocket endpoints for auth, tasks, uploads, approvals, and Feishu ingress.
- Validation: integration tests for task lifecycle and event streaming.
- Commit boundary: `✨ feat: add daemon session orchestration and event streaming`.
- Status: completed.

### Phase 4: VSCode Frontend

- Added commands, task tree, detail view, diff panel, desktop actions, and image upload flow.
- Kept VSCode as the desktop UI only, not the runtime authority.
- Validation: extension compile checks and integration tests against a mock daemon.
- Commit boundary: `✨ feat: add vscode task dashboard and multimodal input`.
- Status: completed.

### Phase 5: Feishu Bridge

- Added webhook verification, thread binding, outgoing updates, and mobile controls.
- Routed `reply`, `steer`, `interrupt`, `approve`, `cancel`, and `retry`.
- Kept the product rule of one bridge task to one Feishu root message and reply chain.
- Validation: webhook, dedupe, and thread routing tests.
- Commit boundary: `✨ feat: add feishu threaded task bridge`.
- Status: completed.

### Phase 6: Manual CLI Import

- Imported and resumed existing raw Codex threads.
- Normalized imported threads into the same bridge task model.
- Preserved the `v1` boundary that live attach to another external raw CLI process is not guaranteed.
- Validation: import and resume tests using persisted mock thread data.
- Commit boundary: `✨ feat: support manual codex thread import and resume`.
- Status: completed.

### Phase 7: Hardening

- Covered daemon restart recovery, duplicate callbacks, expired approvals, and stale turns.
- Added recovery reconciliation and minimal diagnostics.
- Validation: failure-mode tests and restart recovery checks.
- Commit boundary: `🐛 fix: harden task recovery and feishu action replay`.
- Status: completed.

### Phase 8: Live Validation and Closeout

- Completed the selected runtime live path on the authoritative daemon `http://127.0.0.1:8891`:
  - real `thread/start`
  - real `turn/start`
  - immediate `turn/steer`
  - immediate `turn/interrupt`
  - real approval accept flow
  - structured diff recovery for the affected real path
- Completed the selected desktop live path against the same daemon:
  - task tree
  - detail panel
  - diff opening
  - approval resolution
  - image upload
  - bounded post-fix diff recheck
- Completed the selected Feishu live path with the official SDK long-connection client:
  - ingress establishment and delivery
  - thread continuity
  - live control-command routing for `interrupt`, `retry`, `cancel`, `approve`, and `decline`
- Merged the selected runtime, desktop, and Feishu closeout commits to `master`, plus the two integration fixes needed during mainline intake:
  - `9e38e0a` `🐛 fix: skip worktree bootstrap for git directories`
  - `4f83668` `✅ test: align feishu webhook approvals with runtime payloads`
- Validation:
  - `npm run test:hub`
  - `npm run test:protocol`
  - `npm run test:shared`
  - `npm run test:daemon`
  - `npm run test:extension`
  - `npm run build:daemon`
  - `npm run build:extension`
  - selected live evidence on `8891` plus the current Feishu long-connection group
- Status: completed.

## Post-Closeout Follow-Up

The mainline closeout bar for the selected path is now met.
The remaining work is optional follow-up, not core feature expansion.

### Runtime Follow-Up

- If the release bar widens, re-prove manual import and resume on real `stdio`.
- Investigate the separate `apps/bridge-daemon/tests/task-http.test.ts` timing fragility that was intentionally left outside the live-alignment slices.
- Decide whether `docker compose up -d --force-recreate bridge-runtime` should remain the recommended live refresh path or be reduced to a plain restart workflow.

### Desktop Follow-Up

- If the release bar widens, capture standalone live evidence for the `login` entry and the `retry` action.
- Decide whether the current headless smoke is sufficient long-term or whether a more explicit EDH regression path is worth keeping.

### Feishu Follow-Up

- The selected live path is now the official SDK long-connection client.
- If webhook compatibility still matters, run a dedicated live pass for the public-callback path instead of treating it as part of the completed closeout bar.
- Decide whether the current Feishu ingress diagnostics should remain at the present verbosity after closeout.

### QA and Coordinator Follow-Up

- If long-lived evidence snapshots are still wanted, curate one final QA-only refresh for:
  - `docs/acceptance-matrix.md`
  - `docs/integration-record.md`
- Keep shared hub traffic dynamic; do not re-expand branch-local docs into a live message board.

## Acceptance and Exit Criteria

- Root `PLAN.md` no longer exists.
- `docs/plan.md` remains the only plan source.
- Existing regression checks still pass:
  - `npm run test:hub`
  - `npm run test:protocol`
  - `npm run test:shared`
  - `npm run test:daemon`
  - `npm run test:extension`
  - `npm run build:daemon`
  - `npm run build:extension`
- Selected live runtime validation confirms auth, thread lifecycle, turn control, approval handling, and structured diff delivery can flow through the current task model.
- Selected live Feishu validation confirms long-connection ingress, thread continuity, reply routing, and control-command routing.
- Selected live desktop validation confirms the VSCode extension can connect to the daemon and use the implemented task controls for tree/detail/diff/approval/upload.

## Assumptions and Non-Goals

- The repository already covers the original implementation plan; the current focus after closeout is optional hardening and release-bar clarification, not new product scope.
- `manual raw codex` support means import, resume, and post-import control, not live attach to an arbitrary external running CLI process.
- The selected Feishu live path now uses the official SDK long-connection client. Webhook/public-callback ingress remains a compatibility path, not part of the completed closeout bar.
- If live `codex app-server` or live Feishu differs from the mocked assumptions, adapt the integration layer first and avoid reshaping the task model unless it is truly insufficient.
