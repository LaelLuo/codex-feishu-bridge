import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { describe, it } from "node:test";

import { createConsoleLogger, prepareBridgeDirectories } from "@codex-feishu-bridge/shared";

import { startRuntimeTcpProxy } from "../src/runtime-tcp-proxy";
import { createCodexRuntime } from "../src/runtime";
import { TEST_REPO_ROOT, createTestBridgeConfig, resolveTestRepoPath } from "./test-paths";

async function allocateTcpPort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (!address || typeof address === "string") {
    throw new Error("failed to allocate tcp port for runtime proxy test");
  }

  return address.port;
}

describe("tcp-proxy runtime compatibility", () => {
  it("speaks to a host-side codex app-server proxy over tcp", async () => {
    const namespace = randomUUID();
    const fixturePath = resolveTestRepoPath("apps/bridge-daemon/tests/fixtures/fake-codex-app-server.mjs");
    const port = await allocateTcpPort();
    const config = createTestBridgeConfig(namespace, {
      CODEX_RUNTIME_BACKEND: "tcp-proxy",
      CODEX_RUNTIME_PROXY_HOST: "127.0.0.1",
      CODEX_RUNTIME_PROXY_PORT: String(port),
      CODEX_RUNTIME_PROXY_BIND_HOST: "127.0.0.1",
      CODEX_APP_SERVER_BIN: process.execPath,
      CODEX_APP_SERVER_ARGS: fixturePath,
    });
    const logger = createConsoleLogger("tcp-proxy-runtime-test");

    await prepareBridgeDirectories(config);

    const originalEnv = {
      WORKSPACE_PATH: process.env.WORKSPACE_PATH,
      CODEX_HOME: process.env.CODEX_HOME,
      BRIDGE_CODEX_HOME: process.env.BRIDGE_CODEX_HOME,
      CODEX_APP_SERVER_BIN: process.env.CODEX_APP_SERVER_BIN,
      CODEX_APP_SERVER_ARGS: process.env.CODEX_APP_SERVER_ARGS,
      CODEX_RUNTIME_PROXY_HOST: process.env.CODEX_RUNTIME_PROXY_HOST,
      CODEX_RUNTIME_PROXY_PORT: process.env.CODEX_RUNTIME_PROXY_PORT,
      CODEX_RUNTIME_PROXY_BIND_HOST: process.env.CODEX_RUNTIME_PROXY_BIND_HOST,
    };

    process.env.WORKSPACE_PATH = config.workspaceRoot;
    process.env.CODEX_HOME = config.codexHome;
    process.env.BRIDGE_CODEX_HOME = config.codexHome;
    process.env.CODEX_APP_SERVER_BIN = process.execPath;
    process.env.CODEX_APP_SERVER_ARGS = fixturePath;
    process.env.CODEX_RUNTIME_PROXY_HOST = "127.0.0.1";
    process.env.CODEX_RUNTIME_PROXY_PORT = String(port);
    process.env.CODEX_RUNTIME_PROXY_BIND_HOST = "127.0.0.1";

    const proxy = await startRuntimeTcpProxy();
    const runtime = createCodexRuntime(config, logger);

    try {
      assert.equal(runtime.backend, "tcp-proxy");
      await runtime.start();

      const health = await runtime.health();
      assert.equal(health.backend, "tcp-proxy");
      assert.equal(health.initialized, true);

      const account = await runtime.readAccount(false);
      assert.equal(account.account?.type, "chatgpt");

      const listed = await runtime.listThreads();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, "thread-live-shape");

      const startedThread = await runtime.startThread({
        cwd: TEST_REPO_ROOT,
        title: "Proxy Runtime Task",
        model: "gpt-5.4",
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
      });
      assert.equal(startedThread.id, "thread-created");

      const startedTurn = await runtime.startTurn({
        threadId: startedThread.id,
        input: [{ type: "text", text: "Say hello from the tcp proxy" }],
        model: "gpt-5.4",
        effort: "high",
        approvalPolicy: "never",
      });
      assert.equal(startedTurn.threadId, startedThread.id);
    } finally {
      await runtime.dispose();
      await proxy.close();
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });
});
