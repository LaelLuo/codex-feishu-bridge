#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { detectHostCodexBinDir, detectHostCodexHome } from "./dev-stack";

const containerWorkspaceRoot = "/workspace/codex-feishu-bridge";
const containerCodexHomeRoot = "/codex-home";
const containerCodexBinRoot = "/opt/host-codex-bin";

type HostRuntimeBackend = "stdio" | "socket-proxy" | "tcp-proxy";

function isBareCommand(target: string): boolean {
  return !target.includes("/") && !target.includes("\\");
}

function isWindowsAppsCodexResourceDir(target: string | undefined): boolean {
  if (!target) {
    return false;
  }

  return /[\\/]WindowsApps[\\/]OpenAI\.Codex_.*[\\/]app[\\/]resources$/i.test(target);
}

function listCommandCandidates(command: string, platform = process.platform): string[] {
  if (platform !== "win32") {
    return [];
  }

  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnvFile(targetFile: string): Record<string, string> {
  if (!existsSync(targetFile)) {
    return {};
  }

  const values: Record<string, string> = {};
  const content = readFileSync(targetFile, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    values[key] = value;
  }

  return values;
}

function defaultCodexHomeLiteral(): string {
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      return path.join(userProfile, ".codex");
    }
  }

  const home = process.env.HOME;
  if (home) {
    return path.join(home, ".codex");
  }

  return ".codex";
}

function resolveRepoPath(targetPath: string, repoRoot: string): string {
  if (targetPath.startsWith(containerWorkspaceRoot)) {
    return path.join(repoRoot, targetPath.slice(containerWorkspaceRoot.length));
  }

  if (!path.isAbsolute(targetPath)) {
    return path.resolve(repoRoot, targetPath);
  }

  return targetPath;
}

function resolveHostCodexHomePath(configuredPath: string | undefined, repoRoot: string, detectedHostCodexHome?: string): string {
  if (
    configuredPath &&
    configuredPath !== containerCodexHomeRoot &&
    !configuredPath.startsWith(containerWorkspaceRoot)
  ) {
    return resolveRepoPath(configuredPath, repoRoot);
  }

  if (detectedHostCodexHome) {
    return detectedHostCodexHome;
  }

  return defaultCodexHomeLiteral();
}

function resolveHostCodexExecutable(
  configuredExecutable: string | undefined,
  repoRoot: string,
  detectedHostCodexBinDir?: string,
): string {
  if (configuredExecutable && isBareCommand(configuredExecutable)) {
    return configuredExecutable;
  }

  if (configuredExecutable?.startsWith(containerCodexBinRoot) && isWindowsAppsCodexResourceDir(detectedHostCodexBinDir)) {
    return "codex";
  }

  const candidates: string[] = [];
  const shouldResolveFromHostBinDir =
    !configuredExecutable ||
    configuredExecutable === "codex" ||
    configuredExecutable === `${containerCodexBinRoot}/bin/codex.js` ||
    configuredExecutable === `${containerCodexBinRoot}/codex` ||
    configuredExecutable.startsWith(containerCodexBinRoot);

  if (detectedHostCodexBinDir && shouldResolveFromHostBinDir) {
    if (configuredExecutable?.startsWith(containerCodexBinRoot)) {
      candidates.push(
        path.join(
          detectedHostCodexBinDir,
          configuredExecutable.slice(containerCodexBinRoot.length).replace(/^[/\\]+/, ""),
        ),
      );
    }

    candidates.push(
      path.join(detectedHostCodexBinDir, "bin", "codex.js"),
      path.join(detectedHostCodexBinDir, "codex.exe"),
      path.join(detectedHostCodexBinDir, "codex"),
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (shouldResolveFromHostBinDir) {
    return "codex";
  }

  return resolveRepoPath(configuredExecutable, repoRoot);
}

export function resolveHostRuntimeBackend(requestedBackend: string | undefined): HostRuntimeBackend {
  if (requestedBackend === "socket-proxy" || requestedBackend === "tcp-proxy") {
    return requestedBackend;
  }

  return "stdio";
}

export function normalizeHostBridgeEnv(
  sourceEnv: NodeJS.ProcessEnv,
  repoRoot: string,
  requestedBackend?: string,
): NodeJS.ProcessEnv {
  const configuredCodexHome = sourceEnv.BRIDGE_CODEX_HOME ?? sourceEnv.CODEX_HOME;
  const hasExplicitCodexHome =
    !!configuredCodexHome &&
    configuredCodexHome !== containerCodexHomeRoot &&
    !configuredCodexHome.startsWith(containerWorkspaceRoot);
  const detectedHostCodexHome = hasExplicitCodexHome ? undefined : defaultCodexHomeLiteral();
  const detectedHostCodexBinDir =
    sourceEnv.HOST_CODEX_BIN_DIR ?? detectHostCodexBinDir(listCommandCandidates("codex"));
  const stateDir = resolveRepoPath(sourceEnv.BRIDGE_STATE_DIR ?? ".tmp", repoRoot);
  const uploadsDir = resolveRepoPath(sourceEnv.BRIDGE_UPLOADS_DIR ?? path.join(".tmp", "uploads"), repoRoot);
  const bridgeCodexHome = resolveHostCodexHomePath(
    configuredCodexHome,
    repoRoot,
    detectedHostCodexHome,
  );
  const normalizedBackend = resolveHostRuntimeBackend(requestedBackend);
  const omitCodexHomeEnv = !hasExplicitCodexHome;

  return {
    ...sourceEnv,
    WORKSPACE_PATH: repoRoot,
    BRIDGE_STATE_DIR: stateDir,
    BRIDGE_UPLOADS_DIR: uploadsDir,
    BRIDGE_CODEX_HOME: bridgeCodexHome,
    ...(omitCodexHomeEnv ? {} : { CODEX_HOME: bridgeCodexHome }),
    CODEX_RUNTIME_BACKEND: normalizedBackend,
    CODEX_APP_SERVER_BIN: resolveHostCodexExecutable(sourceEnv.CODEX_APP_SERVER_BIN, repoRoot, detectedHostCodexBinDir),
    BRIDGE_OMIT_CODEX_HOME_ENV: omitCodexHomeEnv ? "true" : "false",
    ...(hasExplicitCodexHome
      ? { HOST_CODEX_HOME: sourceEnv.HOST_CODEX_HOME }
      : {}),
    HOST_CODEX_BIN_DIR: detectedHostCodexBinDir ?? sourceEnv.HOST_CODEX_BIN_DIR,
    MOCK_AUTO_COMPLETE_LOGIN: normalizedBackend === "mock" ? "true" : "false",
    CODEX_RUNTIME_PROXY_SOCKET: sourceEnv.CODEX_RUNTIME_PROXY_SOCKET
      ? resolveRepoPath(sourceEnv.CODEX_RUNTIME_PROXY_SOCKET, repoRoot)
      : sourceEnv.CODEX_RUNTIME_PROXY_SOCKET,
  };
}

function runStep(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function runDaemon(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<never> {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  for (const event of ["SIGINT", "SIGTERM"] as const) {
    process.on(event, () => {
      if (!child.killed) {
        child.kill(event);
      }
    });
  }

  return await new Promise<never>(() => {
    // Intentionally never resolves; process exits via child lifecycle.
  });
}

async function main(argv: string[]): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const envFile = path.join(repoRoot, "docker", ".env");
  const command = argv[0] ?? "start";
  const requestedBackend = argv[1];

  if (command !== "start") {
    console.error("Usage: bun scripts/host-stack.ts start [stdio|socket-proxy|tcp-proxy]");
    process.exit(1);
  }

  const envFromFile = parseEnvFile(envFile);
  const runtimeEnv = normalizeHostBridgeEnv(
    {
      ...envFromFile,
      ...process.env,
    },
    repoRoot,
    requestedBackend,
  );

  runStep("bun", ["run", "build:shared"], runtimeEnv, repoRoot);
  runStep("bun", ["run", "build:protocol"], runtimeEnv, repoRoot);
  runStep("bun", ["run", "build:daemon"], runtimeEnv, repoRoot);

  const daemonEntrypoint = path.join(repoRoot, "apps", "bridge-daemon", "dist", "index.js");
  await runDaemon("bun", [daemonEntrypoint], runtimeEnv, repoRoot);
}

if (import.meta.main) {
  void main(process.argv.slice(2));
}
