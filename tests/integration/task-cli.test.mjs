import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sourceTaskCliPath = path.join(repoRoot, "scripts", "task-cli.ts");
const sourceAgentsPath = path.join(repoRoot, "AGENTS.md");
const sourceTasksReadmePath = path.join(repoRoot, "tasks", "README.md");
const sourceOperatingModelPath = path.join(repoRoot, "docs", "governance", "agent-operating-model.md");
const sourceProjectSummaryPath = path.join(repoRoot, "memory", "project-summary.md");
const sourceKnownGapsPath = path.join(repoRoot, "memory", "known-gaps.md");

const tempRoots = [];

async function writeFixtureFile(targetPath, sourcePath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await readFile(sourcePath, "utf8"), "utf8");
}

async function createTaskCliFixture() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codex-task-cli-"));
  tempRoots.push(tempRoot);

  await writeFixtureFile(path.join(tempRoot, "scripts", "task-cli.ts"), sourceTaskCliPath);
  await writeFixtureFile(path.join(tempRoot, "AGENTS.md"), sourceAgentsPath);
  await writeFixtureFile(path.join(tempRoot, "tasks", "README.md"), sourceTasksReadmePath);
  await writeFixtureFile(
    path.join(tempRoot, "docs", "governance", "agent-operating-model.md"),
    sourceOperatingModelPath,
  );
  await writeFixtureFile(path.join(tempRoot, "memory", "project-summary.md"), sourceProjectSummaryPath);
  await writeFixtureFile(path.join(tempRoot, "memory", "known-gaps.md"), sourceKnownGapsPath);
  await mkdir(path.join(tempRoot, "tasks", "archived"), { recursive: true });

  return tempRoot;
}

describe("task-cli doctor", () => {
  afterEach(async () => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects archived tasks whose business status is outside the allowed task status set", async () => {
    const tempRoot = await createTaskCliFixture();
    const taskId = "TASK-1774071327327-invalid-status";
    const taskDir = path.join(tempRoot, "tasks", "archived", taskId);
    await mkdir(taskDir, { recursive: true });

    await writeFile(
      path.join(taskDir, "task.yaml"),
      [
        `id: ${taskId}`,
        "title: invalid status fixture",
        "status: completed",
        "archived: true",
        "created_at: '2026-03-21T13:35:27.327Z'",
        "updated_at: '2026-03-24T10:06:35.554Z'",
        "related_repos: []",
        "depends_on: []",
        "blocked_by: []",
        "tags: []",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(taskDir, "brief.md"), "# brief\n", "utf8");
    await writeFile(path.join(taskDir, "log.md"), "# Task Log\n\n", "utf8");
    await writeFile(path.join(taskDir, "decisions.md"), "# Decisions\n\n", "utf8");
    await writeFile(path.join(taskDir, "next-actions.md"), "# Next Actions\n\n## Open\n\n## Closed\n", "utf8");

    let failure;
    try {
      await execFileAsync("bun", [path.join(tempRoot, "scripts", "task-cli.ts"), "doctor", taskId], {
        cwd: tempRoot,
      });
    } catch (error) {
      failure = error;
    }

    assert.ok(failure, "doctor should reject invalid task statuses");
    assert.match(failure.stdout, new RegExp(`${taskId}: status=completed`));
  });
});
