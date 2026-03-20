import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { normalizeHostBridgeEnv, resolveHostRuntimeBackend } from "../../scripts/host-stack.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageJsonPath = path.join(repoRoot, "package.json");

describe("host-stack.ts", () => {
  it("defaults host startup to stdio when backend is missing or mock", () => {
    assert.equal(resolveHostRuntimeBackend(undefined), "stdio");
    assert.equal(resolveHostRuntimeBackend("mock"), "stdio");
    assert.equal(resolveHostRuntimeBackend("stdio"), "stdio");
    assert.equal(resolveHostRuntimeBackend("tcp-proxy"), "tcp-proxy");
  });

  it("maps container-oriented runtime env into host-native paths", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codex-host-stack-"));
    const hostCodexHome = path.join(tempRoot, "host-codex-home");
    const hostCodexBinDir = path.join(tempRoot, "host-codex-bin");
    const hostRepoRoot = path.join(tempRoot, "repo");

    await mkdir(hostCodexHome, { recursive: true });
    await mkdir(path.join(hostCodexBinDir, "bin"), { recursive: true });
    await writeFile(path.join(hostCodexBinDir, "bin", "codex.js"), "#!/usr/bin/env bun\n", "utf8");

    const normalized = normalizeHostBridgeEnv(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        BRIDGE_STATE_DIR: ".tmp",
        BRIDGE_CODEX_HOME: hostCodexHome,
        BRIDGE_UPLOADS_DIR: "/workspace/codex-feishu-bridge/.tmp/uploads",
        CODEX_RUNTIME_BACKEND: "mock",
        CODEX_APP_SERVER_BIN: "/opt/host-codex-bin/bin/codex.js",
        HOST_CODEX_BIN_DIR: hostCodexBinDir,
      },
      hostRepoRoot,
    );

    assert.equal(normalized.WORKSPACE_PATH, hostRepoRoot);
    assert.equal(normalized.BRIDGE_STATE_DIR, path.join(hostRepoRoot, ".tmp"));
    assert.equal(normalized.BRIDGE_UPLOADS_DIR, path.join(hostRepoRoot, ".tmp", "uploads"));
    assert.equal(normalized.BRIDGE_CODEX_HOME, hostCodexHome);
    assert.equal(normalized.CODEX_HOME, hostCodexHome);
    assert.equal(normalized.BRIDGE_OMIT_CODEX_HOME_ENV, "false");
    assert.equal(normalized.CODEX_RUNTIME_BACKEND, "stdio");
    assert.equal(normalized.CODEX_APP_SERVER_BIN, path.join(hostCodexBinDir, "bin", "codex.js"));
  });

  it("keeps an explicit bare CODEX_APP_SERVER_BIN command unchanged", () => {
    const normalized = normalizeHostBridgeEnv(
      {
        CODEX_APP_SERVER_BIN: "codex",
        CODEX_RUNTIME_BACKEND: "stdio",
      },
      repoRoot,
      "stdio",
    );

    assert.equal(normalized.CODEX_APP_SERVER_BIN, "codex");
  });

  it("defaults host-native startup to the literal ~/.codex path without exporting CODEX_HOME", () => {
    const normalized = normalizeHostBridgeEnv(
      {
        CODEX_RUNTIME_BACKEND: "stdio",
      },
      repoRoot,
      "stdio",
    );

    const expectedDefaultCodexHome =
      process.platform === "win32"
        ? path.join(process.env.USERPROFILE ?? "", ".codex")
        : path.join(process.env.HOME ?? "", ".codex");

    assert.equal(normalized.BRIDGE_CODEX_HOME, expectedDefaultCodexHome);
    assert.equal(normalized.CODEX_HOME, undefined);
    assert.equal(normalized.BRIDGE_OMIT_CODEX_HOME_ENV, "true");
  });

  it("falls back to the PATH codex command when WindowsApps resources are detected", () => {
    if (process.platform !== "win32") {
      return;
    }

    const whereResult = spawnSync("where.exe", ["codex"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const windowsAppsResourceDir = whereResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /\\WindowsApps\\OpenAI\.Codex_.*\\app\\resources\\codex(?:\.exe)?$/i.test(line))
      ?.replace(/\\codex(?:\.exe)?$/i, "")
      .replace(/\\/g, "/");

    if (!windowsAppsResourceDir) {
      return;
    }

    const normalized = normalizeHostBridgeEnv(
      {
        HOST_CODEX_BIN_DIR: windowsAppsResourceDir,
        CODEX_APP_SERVER_BIN: "/opt/host-codex-bin/bin/codex.js",
        CODEX_RUNTIME_BACKEND: "stdio",
      },
      repoRoot,
      "stdio",
    );

    assert.equal(normalized.CODEX_APP_SERVER_BIN, "codex");
  });

  it("exposes host and tcp-proxy root scripts", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    assert.match(packageJson.scripts["start:host"] ?? "", /host-stack\.ts/);
    assert.equal(packageJson.scripts["start:tcp-proxy"], "bun scripts/dev-stack.ts up tcp-proxy");
    assert.equal(packageJson.scripts["monitor:tcp-proxy"], "bun scripts/dev-stack.ts monitor tcp-proxy");
  });
});
