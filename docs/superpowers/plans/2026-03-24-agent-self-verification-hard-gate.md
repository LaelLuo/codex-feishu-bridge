# Agent Self-Verification Hard Gate Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable repository-level hard gate that agents must run before every small commit, using familiar commands and local test doubles to verify structure, logic, interaction, and workflow correctness.

**Architecture:** Keep the gate thin and familiar. The real checks live in `bun test`, `typecheck`, `lint`, architecture tests, contract tests, workflow tests, and `task-cli doctor`. The gate only standardizes execution order, failure classification, and failure evidence.

**Tech Stack:** Bun workspaces, TypeScript, Bun test, repository scripts, task-cli doctor, fixture/snapshot tests, static dependency checks.

---

## Chunk 1: Establish The Gate Skeleton

### Task 1: Add the root verification entrypoints

**Files:**
- Modify: `package.json`
- Create: `scripts/verify-gate.ts`
- Create: `scripts/verify-gate-lib.ts`
- Test: `tests/integration/verify-gate-script.test.mjs`

- [ ] **Step 1: Add placeholder root scripts**

Add:

- `verify:gate`
- `verify:structure`
- `verify:logic`
- `verify:interaction`
- `verify:workflow`

- [ ] **Step 2: Write a failing integration test for the gate runner**

The test should verify:

- categories run in fixed order
- first failure returns non-zero
- failure output includes category and evidence

- [ ] **Step 3: Implement a thin gate runner**

Rules:

- no large success report
- failure-only JSON report
- preserve child command output

- [ ] **Step 4: Run the gate-runner test**

Run:

```bash
bun test tests/integration/verify-gate-script.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run script-level type safety checks**

Run:

```bash
bun run typecheck
```

Expected: exit code `0`.

- [ ] **Step 6: Commit**

```bash
git add -- package.json scripts/verify-gate.ts scripts/verify-gate-lib.ts tests/integration/verify-gate-script.test.mjs
git commit -m "✨ feat: add repository verify gate entrypoints"
```

**Acceptance:**
- Repository has a single full gate entrypoint.
- Failures are classified and evidenced without success noise.

### Task 2: Define failure categories and failure-only JSON evidence

**Files:**
- Create: `scripts/verify-gate-types.ts`
- Modify: `scripts/verify-gate-lib.ts`
- Test: `tests/integration/verify-gate-failure-report.test.mjs`

- [ ] **Step 1: Write a failing test for failure report shape**

Require fields:

- `gate`
- `category`
- `command`
- `exitCode`
- `failedChecks`
- `evidence`
- `affectedFiles`
- `blocking`
- `timestamp`

- [ ] **Step 2: Implement failure-only JSON output**

Write `.tmp/verify-gate/latest-failure.json` only when a category fails.

- [ ] **Step 3: Ensure success does not emit a large report**

The success path may delete stale failure output or leave it untouched with clear console messaging, but must not generate a full success dump.

- [ ] **Step 4: Run the failure-report tests**

Run:

```bash
bun test tests/integration/verify-gate-failure-report.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- scripts/verify-gate-types.ts scripts/verify-gate-lib.ts tests/integration/verify-gate-failure-report.test.mjs
git commit -m "✨ feat: add failure-only verify gate evidence model"
```

**Acceptance:**
- Failures have machine-readable evidence.
- Success path stays minimal.

## Chunk 2: Structure And Logic Gates

### Task 3: Implement structure gate with architecture rule tests

**Files:**
- Create: `tests/architecture/domain-boundaries.test.ts`
- Create: `tests/architecture/application-boundaries.test.ts`
- Create: `tests/architecture/adapter-boundaries.test.ts`
- Create: `scripts/verify-structure.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing architecture tests for forbidden dependencies**

Cover at least:

- domain cannot import runtime SDK / Feishu SDK / `fetch` / `ws` / `bun:sqlite`
- application cannot depend directly on infrastructure implementations
- adapters cannot become business-rule containers

- [ ] **Step 2: Implement import scanning or dependency assertions**

Prefer simple, explicit path rules over clever abstraction.

- [ ] **Step 3: Wire the structure script into `verify:structure`**

- [ ] **Step 4: Run structure gate**

Run:

```bash
bun run verify:structure
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run:

```bash
bun run verify:gate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- tests/architecture/domain-boundaries.test.ts tests/architecture/application-boundaries.test.ts tests/architecture/adapter-boundaries.test.ts scripts/verify-structure.ts package.json
git commit -m "✨ feat: add structure gate architecture tests"
```

**Acceptance:**
- Code organization correctness is enforced by executable rules.
- The gate blocks on forbidden layering violations.

### Task 4: Normalize the logic gate on domain/application/regression slices

**Files:**
- Create: `scripts/verify-logic.ts`
- Modify: `package.json`
- Modify: existing workspace test organization as needed
- Test: `tests/integration/verify-logic-script.test.mjs`

- [ ] **Step 1: Write a failing test for logic gate command selection**

The test should assert that logic gate covers:

- domain tests
- application tests
- regression tests

- [ ] **Step 2: Implement `verify:logic` with familiar test commands**

Prefer existing test commands plus any newly separated regression slices.

- [ ] **Step 3: Make sure logic gate remains local-only**

No real network, no real Feishu, no real runtime account state.

- [ ] **Step 4: Run logic gate**

Run:

```bash
bun run verify:logic
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run:

```bash
bun run verify:gate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/verify-logic.ts package.json tests/integration/verify-logic-script.test.mjs
git commit -m "✨ feat: add logic gate"
```

**Acceptance:**
- Logic correctness no longer depends on ad hoc test choices.
- The gate always runs the full logic slice before commit.

## Chunk 3: Interaction And Workflow Gates

### Task 5: Implement the interaction gate around local fixtures and compatibility tests

**Files:**
- Create: `scripts/verify-interaction.ts`
- Modify: `package.json`
- Create or move: `tests/contracts/*.test.ts`
- Modify: daemon / extension compatibility tests as needed
- Test: `tests/integration/verify-interaction-script.test.mjs`

- [ ] **Step 1: Write a failing interaction-gate integration test**

Require it to cover:

- HTTP contract
- WebSocket contract
- Feishu snapshot / card contract
- VSCode extension compatibility

- [ ] **Step 2: Wire interaction gate to fixture/snapshot-based checks**

Use only local fixtures, fakes, and compatibility tests.

- [ ] **Step 3: Ensure no real external integration is called**

If any command depends on real external state, replace it with a port-backed fake path first.

- [ ] **Step 4: Run interaction gate**

Run:

```bash
bun run verify:interaction
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run:

```bash
bun run verify:gate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/verify-interaction.ts package.json tests/contracts tests/integration/verify-interaction-script.test.mjs apps/bridge-daemon/tests apps/vscode-extension/tests
git commit -m "✨ feat: add interaction gate"
```

**Acceptance:**
- Interaction correctness is guarded without touching real external systems.
- Contract drift becomes a commit-blocking failure.

### Task 6: Implement workflow gate for state flows and task-system consistency

**Files:**
- Create: `scripts/verify-workflow.ts`
- Modify: `package.json`
- Create: `tests/workflows/task-status-flow.test.ts`
- Create: `tests/workflows/approval-flow.test.ts`
- Create: `tests/workflows/message-queue-flow.test.ts`
- Create: `tests/workflows/imported-thread-flow.test.ts`
- Test: `tests/integration/verify-workflow-script.test.mjs`

- [ ] **Step 1: Write failing workflow tests for key state transitions**

Cover:

- task lifecycle
- approval lifecycle
- queued message lifecycle
- imported-thread recovery lifecycle

- [ ] **Step 2: Add repository workflow checks**

Include:

```bash
bun scripts/task-cli.ts doctor
```

as part of workflow gate.

- [ ] **Step 3: Implement `verify:workflow`**

The command must fail if either product workflow tests or repo workflow doctor fails.

- [ ] **Step 4: Run workflow gate**

Run:

```bash
bun run verify:workflow
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run:

```bash
bun run verify:gate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -- scripts/verify-workflow.ts package.json tests/workflows tests/integration/verify-workflow-script.test.mjs
git commit -m "✨ feat: add workflow gate"
```

**Acceptance:**
- Workflow correctness is explicitly executable.
- Task-system drift also becomes commit-blocking.

## Chunk 4: Finalize Reuse And Adoption

### Task 7: Make the gate reusable across future refactors and features

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create: `docs/verification/agent-hard-gate.md`
- Modify: task / planning templates if needed

- [ ] **Step 1: Document how agents must use the gate**

State clearly:

- every small commit requires `bun run verify:gate`
- partial sub-gates are for diagnosis only
- real external integrations are excluded from commit gate

- [ ] **Step 2: Document how new modules add structure / interaction / workflow coverage**

- [ ] **Step 3: Run the full gate after docs and template changes**

Run:

```bash
bun run verify:gate
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -- README.md docs/architecture.md docs/verification/agent-hard-gate.md
git commit -m "📝 docs: document reusable agent hard gate"
```

**Acceptance:**
- The mechanism is documented as a repository rule, not a one-off project note.

### Task 8: Final verification and handoff

**Files:**
- Modify: any remaining gate scripts or tests required by final verification

- [ ] **Step 1: Run the full verification bundle**

Run:

```bash
bun run verify:gate
bun run typecheck
bun run lint
bun run test
```

Expected: all commands exit `0`.

- [ ] **Step 2: Check failure behavior intentionally in a safe test fixture**

Add or toggle a controlled failing fixture to verify gate failure classification, then revert it and rerun full gate.

- [ ] **Step 3: Confirm failure output is evidence-rich and success output stays quiet**

- [ ] **Step 4: Commit final stabilization**

```bash
git add -- package.json scripts tests README.md docs
git commit -m "✅ test: finalize reusable agent hard gate"
```

**Acceptance:**
- The repository has a reusable hard gate.
- Each commit-sized step can be independently blocked by the same full gate.
- Agent diagnosis relies on failure category and evidence rather than human-only interpretation.
