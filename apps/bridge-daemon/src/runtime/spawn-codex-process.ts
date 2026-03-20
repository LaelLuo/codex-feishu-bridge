import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import type { BridgeConfig } from "@codex-feishu-bridge/shared";

const scriptExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);

function stageExecutable(executable: string, stateDir: string): { path: string; cleanup: () => void } {
  const stagedDir = mkdtempSync(path.join(stateDir, "codex-bin-"));
  const stagedExecutable = path.join(stagedDir, path.basename(executable));

  copyFileSync(executable, stagedExecutable);
  chmodSync(stagedExecutable, 0o755);

  return {
    path: stagedExecutable,
    cleanup() {
      rmSync(stagedDir, { recursive: true, force: true });
    },
  };
}

function resolveLaunchCommand(config: BridgeConfig): {
  command: string;
  args: string[];
  cleanup: () => void;
} {
  const executable = config.codexExecutable;
  const extension = path.extname(executable).toLowerCase();

  if (scriptExtensions.has(extension)) {
    return {
      command: "bun",
      args: [executable, ...config.codexArgs],
      cleanup() {},
    };
  }

  if (process.platform !== "win32" && existsSync(executable)) {
    const stat = statSync(executable);
    if (stat.isFile() && (stat.mode & 0o111) === 0) {
      const staged = stageExecutable(executable, config.stateDir);
      return {
        command: staged.path,
        args: config.codexArgs,
        cleanup: staged.cleanup,
      };
    }
  }

  return {
    command: executable,
    args: config.codexArgs,
    cleanup() {},
  };
}

export interface ManagedCodexProcess {
  child: ChildProcessWithoutNullStreams;
  dispose: () => void;
}

export function spawnCodexProcess(config: BridgeConfig): ManagedCodexProcess {
  const launch = resolveLaunchCommand(config);
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    launch.cleanup();
  };

  try {
    const child = spawn(launch.command, launch.args, {
      cwd: config.workspaceRoot,
      env: {
        ...process.env,
        CODEX_HOME: config.codexHome,
      },
      stdio: "pipe",
    });
    child.once("exit", dispose);

    return {
      child,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
