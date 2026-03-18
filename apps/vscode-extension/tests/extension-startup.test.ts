import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it } from "node:test";

describe("extension startup flow source", () => {
  it("supports automatic monitor startup through activation, config, and the repo launch entry", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const extensionPackagePath = path.resolve(currentDir, "../package.json");
    const extensionSourcePath = path.resolve(currentDir, "../src/extension.ts");
    const launchPath = path.resolve(currentDir, "../../../.vscode/launch.json");
    const rootPackagePath = path.resolve(currentDir, "../../../package.json");
    const devStackPath = path.resolve(currentDir, "../../../scripts/dev-stack.sh");
    const extensionPackage = readFileSync(extensionPackagePath, "utf8");
    const extensionSource = readFileSync(extensionSourcePath, "utf8");
    const launch = readFileSync(launchPath, "utf8");
    const rootPackage = readFileSync(rootPackagePath, "utf8");
    const devStack = readFileSync(devStackPath, "utf8");

    assert.match(extensionPackage, /"onStartupFinished"/);
    assert.match(extensionPackage, /"codexFeishuBridge\.openMonitorOnStartup"/);
    assert.match(rootPackage, /"monitor:all": "bash \.\/scripts\/dev-stack\.sh monitor"/);
    assert.match(launch, /"CODEX_FEISHU_BRIDGE_AUTO_OPEN_MONITOR": "1"/);
    assert.match(extensionSource, /function envFlagEnabled\(name: string\): boolean/);
    assert.match(extensionSource, /CODEX_FEISHU_BRIDGE_AUTO_OPEN_MONITOR/);
    assert.match(extensionSource, /const shouldAutoOpenMonitor =/);
    assert.match(extensionSource, /if \(shouldAutoOpenMonitor\) \{/);
    assert.match(extensionSource, /await monitorPanel\.show\(\);/);
    assert.match(extensionSource, /async function ensureStoreStarted\(showError = true\): Promise<boolean>/);
    assert.match(devStack, /command_monitor\(\)/);
    assert.match(devStack, /CODEX_FEISHU_BRIDGE_AUTO_OPEN_MONITOR=1/);
    assert.match(devStack, /--extensionDevelopmentPath="\$\{extension_dev_path\}"/);
    assert.match(devStack, /Usage: scripts\/dev-stack\.sh \[up\|down\|status\|logs\|monitor\]/);
  });
});
