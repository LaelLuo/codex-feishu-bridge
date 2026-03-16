import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createConsoleLogger, loadBridgeConfig, prepareBridgeDirectories } from "@codex-feishu-bridge/shared";

import { MockCodexRuntime } from "../src/runtime/mock-codex-runtime";
import { BridgeService } from "../src/service/bridge-service";

describe("bridge recovery", () => {
  it("reloads persisted tasks and expires stale approvals when the runtime comes back idle", async () => {
    const namespace = randomUUID();
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        BRIDGE_PORT: "0",
        CODEX_RUNTIME_BACKEND: "mock",
        BRIDGE_STATE_DIR: `.tmp/${namespace}/state`,
        CODEX_HOME: `.tmp/${namespace}/codex-home`,
        BRIDGE_UPLOADS_DIR: `.tmp/${namespace}/uploads`,
      },
      "/workspace/codex-feishu-bridge",
    );
    const logger = createConsoleLogger("bridge-recovery-test");

    await prepareBridgeDirectories(config);

    const runtimeA = new MockCodexRuntime(config, logger);
    await runtimeA.start();

    const serviceA = new BridgeService({ config, logger, runtime: runtimeA });
    await serviceA.initialize();
    const created = await serviceA.createTask({
      title: "Recovery task",
      prompt: "Please edit the file and patch it.",
    });
    const beforeRestart = serviceA.getTask(created.taskId);
    assert.equal(beforeRestart?.pendingApprovals[0]?.state, "pending");

    await delay(20);
    await serviceA.dispose();
    await runtimeA.dispose();

    const runtimeB = new MockCodexRuntime(config, logger);
    await runtimeB.start();
    runtimeB.seedExternalThread({
      id: created.taskId,
      name: "Recovery task",
      cwd: "/workspace/codex-feishu-bridge",
      status: { type: "idle" },
    });

    const serviceB = new BridgeService({ config, logger, runtime: runtimeB });
    await serviceB.initialize();

    const recovered = serviceB.getTask(created.taskId);
    assert.equal(recovered?.status, "idle");
    assert.equal(recovered?.pendingApprovals[0]?.state, "expired");
    assert.equal(recovered?.activeTurnId, undefined);

    await serviceB.dispose();
    await runtimeB.dispose();
  });
});
