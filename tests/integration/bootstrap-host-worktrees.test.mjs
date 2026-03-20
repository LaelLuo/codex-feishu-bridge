import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = path.join(repoRoot, "docker", "scripts", "bootstrap-host-worktrees.sh");
const devStackPath = path.join(repoRoot, "scripts", "dev-stack.sh");
const gitAttributesPath = path.join(repoRoot, ".gitattributes");

describe("bootstrap-host-worktrees.sh", () => {
  it("uses an LF shebang so Linux containers can execute it", async () => {
    const content = await readFile(scriptPath, "utf8");

    assert.ok(content.startsWith("#!/usr/bin/env bash\n"));
    assert.equal(content.includes("\r"), false);
  });

  it("is protected by gitattributes so Windows checkouts keep shell scripts on LF", async () => {
    const gitAttributes = await readFile(gitAttributesPath, "utf8");

    assert.match(gitAttributes, /^\*\.sh text eol=lf$/m);
  });
});

describe("dev-stack.sh", () => {
  it("uses LF line endings so host bash can execute it on Windows workspaces", async () => {
    const content = await readFile(devStackPath, "utf8");

    assert.ok(content.startsWith("#!/usr/bin/env bash\n"));
    assert.equal(content.includes("\r"), false);
  });

  it("contains Windows Codex app resource handling for container stdio runs", async () => {
    const content = await readFile(devStackPath, "utf8");

    assert.match(content, /resources\/codex/);
    assert.match(content, /\/opt\/host-codex-bin\/codex/);
  });
});
