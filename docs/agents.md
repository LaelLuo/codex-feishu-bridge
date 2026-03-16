# Agents Manual

## Purpose

This file is the detailed operational manual for agents working in this repository.

## Start-of-Task Routine

1. Read `AGENTS.md`.
2. Read `docs/status.md`.
3. Read `docs/plan.md`.
4. Read `docs/log.md`.
5. Read `docs/architecture.md` if interfaces or structure may change.

## Execution Rules

- Perform installs, builds, tests, and debugging inside Docker by default.
- Keep public names stable once introduced.
- Prefer shared packages for reusable contracts and helpers.
- Avoid adding host-only setup instructions unless requested.
- If a task changes architecture boundaries, update `docs/architecture.md` and `docs/log.md`.
- Use Codex CLI and `codex app-server` as the runtime truth; do not restore the OpenAI VSCode extension as the primary runtime path.

## Update Rules

- `docs/status.md` reflects the latest state.
- `docs/log.md` is append-only and date-based.
- `docs/lessons.md` is append-only and used for corrective learning.
- `docs/plan.md` tracks current phases and immediate next work.

## Commit and Review Defaults

- Keep commits focused by one independently testable change slice.
- After each major change slice, run the relevant tests or self-checks and commit immediately.
- Use `<gitmoji> <prefix>: <precise summary>` for commit titles.
- Default prefixes are `feat`, `fix`, `refactor`, `docs`, `test`, and `chore`.
- Docs-only updates can be committed after Markdown and structure self-checks pass.
- Do not claim a test passed if no relevant test exists yet; state that explicitly in the log or task summary.
- Prefer structural clarity over defensive compatibility code.
- Call out missing decisions instead of hiding them in temporary patches.
