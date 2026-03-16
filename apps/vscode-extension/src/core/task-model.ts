import type { BridgeTask } from "@codex-feishu-bridge/protocol";

export interface DaemonSnapshot {
  seq: number;
  tasks: BridgeTask[];
  account: unknown;
  rateLimits: unknown;
}

export interface ExtensionSnapshot extends DaemonSnapshot {
  connection: "connecting" | "connected" | "disconnected";
  lastUpdatedAt?: string;
}

export function sortTasks(tasks: BridgeTask[]): BridgeTask[] {
  return [...tasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createEmptySnapshot(): ExtensionSnapshot {
  return {
    seq: 0,
    tasks: [],
    account: null,
    rateLimits: null,
    connection: "disconnected",
  };
}

export function applyDaemonSnapshot(
  current: ExtensionSnapshot,
  daemonSnapshot: DaemonSnapshot,
  connection: ExtensionSnapshot["connection"],
): ExtensionSnapshot {
  return {
    ...current,
    ...daemonSnapshot,
    tasks: sortTasks(daemonSnapshot.tasks),
    connection,
    lastUpdatedAt: new Date().toISOString(),
  };
}
