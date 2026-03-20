#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wslBashPatterns = [
  /\\Windows\\System32\\bash\.exe$/i,
  /\\WindowsApps\\bash\.exe$/i,
];

export function detectHostCodexBinDir(
  lines: string[],
  platform = process.platform,
): string | undefined {
  if (platform !== "win32") {
    return undefined;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/\\bin\\codex\.js$/i.test(line)) {
      return path.win32.dirname(path.win32.dirname(line)).replace(/\\/g, "/");
    }

    if (/\\resources\\codex(?:\.exe)?$/i.test(line)) {
      return path.win32.dirname(line).replace(/\\/g, "/");
    }
  }

  return undefined;
}

export function detectHostCodexHome(platform = process.platform): string | undefined {
  if (platform !== "win32") {
    return undefined;
  }

  const userProfile = process.env.USERPROFILE;
  if (!userProfile) {
    return undefined;
  }

  const defaultRoot = path.join(userProfile, ".codex");
  const authPath = path.join(defaultRoot, "auth.json");

  try {
    const resolvedAuthPath = realpathSync(authPath);
    const resolvedRoot = path.win32.dirname(resolvedAuthPath);
    return resolvedRoot.replace(/\\/g, "/");
  } catch {
    return defaultRoot.replace(/\\/g, "/");
  }
}

function isPreferredBash(candidate: string): boolean {
  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return result.status === 0 && /GNU bash/i.test(output);
}

export function selectBashExecutable(
  candidates: string[],
  platform = process.platform,
  probe = isPreferredBash,
): string {
  if (platform !== "win32") {
    return "bash";
  }

  const normalized = candidates
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  const preferred = normalized.find((candidate) => {
    if (wslBashPatterns.some((pattern) => pattern.test(candidate))) {
      return false;
    }

    return probe(candidate);
  });

  if (preferred) {
    return preferred;
  }

  const nonWsl = normalized.find(
    (candidate) => !wslBashPatterns.some((pattern) => pattern.test(candidate)),
  );

  return nonWsl ?? "bash";
}

function listBashCandidates(platform = process.platform): string[] {
  if (platform !== "win32") {
    return ["bash"];
  }

  const candidates = new Set<string>();
  const bashResult = spawnSync("where.exe", ["bash"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (bashResult.status === 0) {
    for (const line of bashResult.stdout.split(/\r?\n/)) {
      const candidate = line.trim();
      if (candidate) {
        candidates.add(candidate);
      }
    }
  }

  const gitResult = spawnSync("where.exe", ["git"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (gitResult.status === 0) {
    for (const line of gitResult.stdout.split(/\r?\n/)) {
      const gitPath = line.trim();
      if (!gitPath) {
        continue;
      }

      const gitRoot = path.resolve(path.dirname(gitPath), "..");
      candidates.add(path.join(gitRoot, "bin", "bash.exe"));
      candidates.add(path.join(gitRoot, "usr", "bin", "bash.exe"));
    }
  }

  return candidates.size > 0 ? Array.from(candidates) : ["bash"];
}

function listCodexCandidates(platform = process.platform): string[] {
  if (platform !== "win32") {
    return [];
  }

  const result = spawnSync("where.exe", ["codex"], {
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

function main(argv: string[]): never {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const scriptPath = path.join(repoRoot, "scripts", "dev-stack.sh").replace(/\\/g, "/");
  const bashExecutable = selectBashExecutable(listBashCandidates());
  const hostCodexBinDir = process.env.HOST_CODEX_BIN_DIR ?? detectHostCodexBinDir(listCodexCandidates());
  const hostCodexHome = process.env.HOST_CODEX_HOME ?? detectHostCodexHome();
  const result = spawnSync(bashExecutable, [scriptPath, ...argv], {
    cwd: process.cwd(),
    stdio: "inherit",
    env:
      process.platform === "win32"
        ? {
            ...process.env,
            CHERE_INVOKING: "1",
            HOST_CODEX_BIN_DIR: hostCodexBinDir ?? process.env.HOST_CODEX_BIN_DIR,
            HOST_CODEX_HOME: hostCodexHome ?? process.env.HOST_CODEX_HOME,
            MSYS_NO_PATHCONV: "1",
            MSYS2_ARG_CONV_EXCL: "*",
          }
        : process.env,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
