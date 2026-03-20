import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ensureDir, loadBridgeConfig, resolveWorkspacePath } from "../src/index";

describe("shared config helpers", () => {
  it("preserves POSIX workspace semantics for relative paths", () => {
    assert.equal(
      resolveWorkspacePath("/workspace/codex-feishu-bridge", ".tmp"),
      "/workspace/codex-feishu-bridge/.tmp",
    );
  });

  it("resolves relative bridge paths inside the workspace", () => {
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        BRIDGE_STATE_DIR: ".tmp",
        BRIDGE_CODEX_HOME: ".tmp/codex-home",
        BRIDGE_UPLOADS_DIR: ".tmp/uploads",
      },
      "/workspace/codex-feishu-bridge",
    );

    assert.equal(config.stateDir, "/workspace/codex-feishu-bridge/.tmp");
    assert.equal(config.bridgeCodexHome, "/workspace/codex-feishu-bridge/.tmp/codex-home");
    assert.equal(config.codexHome, "/workspace/codex-feishu-bridge/.tmp/codex-home");
    assert.equal(config.uploadsDir, "/workspace/codex-feishu-bridge/.tmp/uploads");
  });

  it("keeps absolute workspace paths unchanged", () => {
    assert.equal(
      resolveWorkspacePath("/workspace/codex-feishu-bridge", "/data/codex-home"),
      "/data/codex-home",
    );
  });

  it("loads feishu bridge settings when present", () => {
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        FEISHU_BASE_URL: "https://open.feishu.cn",
        FEISHU_APP_ID: "cli-app-id",
        FEISHU_APP_SECRET: "cli-app-secret",
        FEISHU_VERIFICATION_TOKEN: "verify-token",
        FEISHU_ENCRYPT_KEY: "encrypt-key",
        FEISHU_DEFAULT_CHAT_ID: "oc_xxx",
        FEISHU_DEFAULT_CHAT_NAME: "Bridge Test Group",
      },
      "/workspace/codex-feishu-bridge",
    );

    assert.equal(config.feishuBaseUrl, "https://open.feishu.cn");
    assert.equal(config.feishuAppId, "cli-app-id");
    assert.equal(config.feishuAppSecret, "cli-app-secret");
    assert.equal(config.feishuVerificationToken, "verify-token");
    assert.equal(config.feishuEncryptKey, "encrypt-key");
    assert.equal(config.feishuDefaultChatId, "oc_xxx");
    assert.equal(config.feishuDefaultChatName, "Bridge Test Group");
  });

  it("loads tcp proxy runtime settings when present", () => {
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        CODEX_RUNTIME_BACKEND: "tcp-proxy",
        CODEX_RUNTIME_PROXY_HOST: "host.docker.internal",
        CODEX_RUNTIME_PROXY_PORT: "8788",
        CODEX_RUNTIME_PROXY_BIND_HOST: "0.0.0.0",
      },
      "/workspace/codex-feishu-bridge",
    );

    assert.equal(config.codexBackend, "tcp-proxy");
    assert.equal(config.codexRuntimeProxyHost, "host.docker.internal");
    assert.equal(config.codexRuntimeProxyPort, 8788);
    assert.equal(config.codexRuntimeProxyBindHost, "0.0.0.0");
  });

  it("loads the omit-CODEX_HOME flag when present", () => {
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: "/workspace/codex-feishu-bridge",
        BRIDGE_OMIT_CODEX_HOME_ENV: "true",
      },
      "/workspace/codex-feishu-bridge",
    );

    assert.equal(config.omitCodexHomeEnv, true);
  });

  it("tolerates an existing Windows Codex home directory", async () => {
    const codexHome = path.join(process.env.USERPROFILE ?? "", "OneDrive", "Codex");

    if (process.platform !== "win32" || !existsSync(codexHome)) {
      return;
    }

    await ensureDir(codexHome);
    assert.equal(existsSync(codexHome), true);
  });
});
