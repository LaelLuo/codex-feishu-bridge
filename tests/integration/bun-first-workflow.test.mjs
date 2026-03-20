import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const bunLockPath = path.join(repoRoot, "bun.lock");
const packageLockPath = path.join(repoRoot, "package-lock.json");
const composePath = path.join(repoRoot, "docker", "compose.yaml");
const devStackPath = path.join(repoRoot, "scripts", "dev-stack.sh");
const dockerfilePath = path.join(repoRoot, "docker", "images", "dev.Dockerfile");
const bridgeCliPath = path.join(repoRoot, "scripts", "bridge-cli.mjs");
const liveRuntimeCheckPath = path.join(repoRoot, "scripts", "live-runtime-check.mjs");
const hubCliPath = path.join(repoRoot, "scripts", "hub-cli.mjs");
const hubCliIntegrationTestPath = path.join(repoRoot, "tests", "integration", "hub-cli.test.mjs");
const fakeAppServerFixturePath = path.join(
  repoRoot,
  "apps",
  "bridge-daemon",
  "tests",
  "fixtures",
  "fake-codex-app-server.mjs",
);
const mockCodexRuntimePath = path.join(
  repoRoot,
  "apps",
  "bridge-daemon",
  "src",
  "runtime",
  "mock-codex-runtime.ts",
);

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

describe("bun-first workflow", () => {
  it("uses Bun as the root package manager and lockfile", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

    assert.match(packageJson.packageManager, /^bun@/);
    assert.equal(await pathExists(bunLockPath), true);
    assert.equal(await pathExists(packageLockPath), false);
  });

  it("keeps root scripts free from npm and node entrypoints", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    const scriptValues = Object.values(packageJson.scripts ?? {});

    for (const script of scriptValues) {
      assert.equal(script.includes("npm run"), false, `unexpected npm script: ${script}`);
      assert.equal(script.startsWith("node "), false, `unexpected node entrypoint: ${script}`);
    }
  });

  it("uses bun-first commands in dev-stack and Docker runtime", async () => {
    const devStack = await readFile(devStackPath, "utf8");
    const compose = await readFile(composePath, "utf8");
    const dockerfile = await readFile(dockerfilePath, "utf8");

    assert.equal(devStack.includes("npm install"), false);
    assert.equal(devStack.includes("npm run"), false);
    assert.equal(devStack.includes("command -v node"), false);
    assert.match(devStack, /\bbun install\b/);
    assert.match(devStack, /\bbun run\b/);

    assert.match(compose, /command:\s+bun run/);
    assert.match(dockerfile, /\bbun\b/i);
  });

  it("keeps helper CLIs aligned with bun-first usage", async () => {
    const helperScripts = await Promise.all([
      readFile(bridgeCliPath, "utf8"),
      readFile(liveRuntimeCheckPath, "utf8"),
      readFile(hubCliPath, "utf8"),
    ]);

    for (const script of helperScripts) {
      assert.match(script, /^#!\/usr\/bin\/env bun/m);
      assert.equal(script.includes("node scripts/"), false);
      assert.equal(script.includes("Use `node scripts/"), false);
    }
  });

  it("keeps test helpers and mock runtime aligned with bun-first defaults", async () => {
    const [hubCliIntegrationTest, fakeAppServerFixture, mockCodexRuntime] = await Promise.all([
      readFile(hubCliIntegrationTestPath, "utf8"),
      readFile(fakeAppServerFixturePath, "utf8"),
      readFile(mockCodexRuntimePath, "utf8"),
    ]);

    assert.match(hubCliIntegrationTest, /execFileAsync\("bun",/);
    assert.match(fakeAppServerFixture, /^#!\/usr\/bin\/env bun/m);
    assert.equal(mockCodexRuntime.includes('["npm", "test"]'), false);
    assert.match(mockCodexRuntime, /\["bun", "test"\]/);
  });
});
