import type {
  CodexModelDescriptor,
  CodexReasoningEffort,
  CodexRuntimeNotification,
  CodexTurnDescriptor,
  CodexThreadDescriptor,
} from "./types";

export interface RawCodexTurnDescriptor {
  id: string;
  status: CodexTurnDescriptor["status"];
  items?: CodexTurnDescriptor["items"];
  error?: CodexTurnDescriptor["error"] | null;
}

export interface RawCodexThreadDescriptor {
  id: string;
  name?: string | null;
  cwd?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  status?: unknown;
}

export interface RawCodexModelDescriptor {
  id: string;
  model: string;
  displayName: string;
  isDefault: boolean;
  supportedReasoningEfforts?: Array<{
    reasoningEffort?: CodexReasoningEffort;
  }>;
  defaultReasoningEffort: CodexReasoningEffort;
}

export function normalizeTimestamp(value: string | number | null | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return new Date(Number(trimmed) * 1000).toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

export function normalizeThreadDescriptor(thread: RawCodexThreadDescriptor): CodexThreadDescriptor {
  return {
    id: thread.id,
    name: thread.name ?? null,
    cwd: thread.cwd ?? null,
    createdAt: normalizeTimestamp(thread.createdAt),
    updatedAt: normalizeTimestamp(thread.updatedAt),
    status: thread.status,
  };
}

export function normalizeTurnDescriptor(
  turn: RawCodexTurnDescriptor,
  threadId?: string,
): CodexTurnDescriptor {
  return {
    id: turn.id,
    threadId,
    status: turn.status,
    items: turn.items ?? [],
    error: turn.error?.message ? { message: turn.error.message } : undefined,
  };
}

export function normalizeModelDescriptor(model: RawCodexModelDescriptor): CodexModelDescriptor {
  return {
    id: model.id,
    model: model.model,
    displayName: model.displayName,
    isDefault: model.isDefault,
    supportedReasoningEfforts: (model.supportedReasoningEfforts ?? [])
      .map((entry) => entry.reasoningEffort)
      .filter((value): value is CodexReasoningEffort => Boolean(value)),
    defaultReasoningEffort: model.defaultReasoningEffort,
  };
}

export function normalizeRuntimeNotification(notification: {
  method: string;
  params?: unknown;
  id?: number | string;
}): CodexRuntimeNotification {
  if (notification.method === "thread/started") {
    const params = notification.params as { thread?: RawCodexThreadDescriptor } | undefined;
    return {
      method: notification.method,
      params: params?.thread
        ? {
            ...params,
            thread: normalizeThreadDescriptor(params.thread),
          }
        : notification.params,
      requestId: notification.id,
    };
  }

  if (notification.method === "turn/started" || notification.method === "turn/completed") {
    const params = notification.params as
      | {
          threadId?: string;
          turn?: RawCodexTurnDescriptor;
        }
      | undefined;
    return {
      method: notification.method,
      params:
        params?.turn && params.threadId
          ? {
              ...params,
              turn: normalizeTurnDescriptor(params.turn, params.threadId),
            }
          : notification.params,
      requestId: notification.id,
    };
  }

  return {
    method: notification.method,
    params: notification.params,
    requestId: notification.id,
  };
}
