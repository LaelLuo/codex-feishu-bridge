import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type CodexBackendMode = "mock" | "stdio" | "socket-proxy" | "tcp-proxy";
export type FeishuUiLanguage = "en-US" | "zh-CN";

export interface Logger {
  info(message: string, metadata?: unknown): void;
  warn(message: string, metadata?: unknown): void;
  error(message: string, metadata?: unknown): void;
}

export interface BridgeConfig {
  host: string;
  port: number;
  wsPath: string;
  workspaceRoot: string;
  stateDir: string;
  bridgeCodexHome: string;
  codexHome: string;
  uploadsDir: string;
  codexBackend: CodexBackendMode;
  codexRuntimeProxySocket: string;
  codexRuntimeProxyHost: string;
  codexRuntimeProxyPort: number;
  codexRuntimeProxyBindHost: string;
  codexExecutable: string;
  codexArgs: string[];
  omitCodexHomeEnv: boolean;
  publicBaseUrl?: string;
  mockAutoCompleteLogin: boolean;
  feishuBaseUrl: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuVerificationToken?: string;
  feishuEncryptKey?: string;
  feishuDefaultChatId?: string;
  feishuDefaultChatName?: string;
  feishuUiLanguage: FeishuUiLanguage;
}

function parseFeishuUiLanguage(value: string | undefined): FeishuUiLanguage {
  return value === "zh-CN" ? "zh-CN" : "en-US";
}

export function createConsoleLogger(prefix = "bridge"): Logger {
  return {
    info(message: string, metadata?: unknown) {
      console.info(`[${prefix}] ${message}`, metadata ?? "");
    },
    warn(message: string, metadata?: unknown) {
      console.warn(`[${prefix}] ${message}`, metadata ?? "");
    },
    error(message: string, metadata?: unknown) {
      console.error(`[${prefix}] ${message}`, metadata ?? "");
    },
  };
}

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function isWindowsAbsolutePath(target: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(target) || target.startsWith("\\\\");
}

function isPosixAbsolutePath(target: string): boolean {
  return path.posix.isAbsolute(target);
}

function shouldUsePosixResolution(workspaceRoot: string): boolean {
  return isPosixAbsolutePath(workspaceRoot) && !isWindowsAbsolutePath(workspaceRoot);
}

export function resolveWorkspacePath(workspaceRoot: string, target: string): string {
  if (isWindowsAbsolutePath(target) || isPosixAbsolutePath(target)) {
    return target;
  }

  if (shouldUsePosixResolution(workspaceRoot)) {
    return path.posix.resolve(workspaceRoot, target);
  }

  return path.resolve(workspaceRoot, target);
}

export function loadBridgeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): BridgeConfig {
  const workspaceRoot = env.WORKSPACE_PATH ?? cwd;
  const stateDir = resolveWorkspacePath(workspaceRoot, env.BRIDGE_STATE_DIR ?? ".tmp");

  return {
    host: env.BRIDGE_HOST ?? "127.0.0.1",
    port: Number(env.BRIDGE_PORT ?? "8787"),
    wsPath: env.BRIDGE_WS_PATH ?? "/ws",
    workspaceRoot,
    stateDir,
    bridgeCodexHome: resolveWorkspacePath(
      workspaceRoot,
      env.BRIDGE_CODEX_HOME ?? env.CODEX_HOME ?? path.join(".tmp", "codex-home"),
    ),
    codexHome: resolveWorkspacePath(
      workspaceRoot,
      env.BRIDGE_CODEX_HOME ?? env.CODEX_HOME ?? path.join(".tmp", "codex-home"),
    ),
    uploadsDir: resolveWorkspacePath(
      workspaceRoot,
      env.BRIDGE_UPLOADS_DIR ?? path.join(".tmp", "uploads"),
    ),
    codexBackend: (env.CODEX_RUNTIME_BACKEND as CodexBackendMode | undefined) ?? "mock",
    codexRuntimeProxySocket: resolveWorkspacePath(
      workspaceRoot,
      env.CODEX_RUNTIME_PROXY_SOCKET ?? path.join(".tmp", "codex-runtime-proxy.sock"),
    ),
    codexRuntimeProxyHost: env.CODEX_RUNTIME_PROXY_HOST ?? "127.0.0.1",
    codexRuntimeProxyPort: Number(env.CODEX_RUNTIME_PROXY_PORT ?? "8788"),
    codexRuntimeProxyBindHost: env.CODEX_RUNTIME_PROXY_BIND_HOST ?? "127.0.0.1",
    codexExecutable: env.CODEX_APP_SERVER_BIN ?? "codex",
    codexArgs: (env.CODEX_APP_SERVER_ARGS ?? "app-server")
      .split(" ")
      .map((segment) => segment.trim())
      .filter(Boolean),
    omitCodexHomeEnv: parseBoolean(env.BRIDGE_OMIT_CODEX_HOME_ENV, false),
    publicBaseUrl: env.PUBLIC_BASE_URL,
    mockAutoCompleteLogin: parseBoolean(env.MOCK_AUTO_COMPLETE_LOGIN, true),
    feishuBaseUrl: env.FEISHU_BASE_URL ?? "https://open.feishu.cn",
    feishuAppId: env.FEISHU_APP_ID,
    feishuAppSecret: env.FEISHU_APP_SECRET,
    feishuVerificationToken: env.FEISHU_VERIFICATION_TOKEN,
    feishuEncryptKey: env.FEISHU_ENCRYPT_KEY,
    feishuDefaultChatId: env.FEISHU_DEFAULT_CHAT_ID,
    feishuDefaultChatName: env.FEISHU_DEFAULT_CHAT_NAME,
    feishuUiLanguage: parseFeishuUiLanguage(env.FEISHU_UI_LANGUAGE),
  };
}

export async function ensureDir(targetDir: string): Promise<void> {
  try {
    await mkdir(targetDir, { recursive: true });
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "EEXIST") {
      throw error;
    }

    const targetStat = await stat(targetDir);
    if (!targetStat.isDirectory()) {
      throw error;
    }
  }
}

export async function prepareBridgeDirectories(config: BridgeConfig): Promise<void> {
  await Promise.all([ensureDir(config.stateDir), ensureDir(config.codexHome), ensureDir(config.uploadsDir)]);
}

export async function writeJsonFile(targetFile: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(targetFile));
  await writeFile(targetFile, JSON.stringify(value, null, 2), "utf8");
}

export async function readJsonFile<T>(targetFile: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(targetFile, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export function notImplemented(name: string): never {
  throw new Error(`Not implemented: ${name}`);
}
