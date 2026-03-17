import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";

import { createConsoleLogger, loadBridgeConfig, prepareBridgeDirectories } from "@codex-feishu-bridge/shared";

import { FeishuBridge } from "../src/feishu/bridge";
import { createCodexRuntime } from "../src/runtime";
import { BridgeService } from "../src/service/bridge-service";

function textInputs(
  input: Array<{ type: string; text?: string }>,
): string[] {
  return input.filter((item): item is { type: "text"; text: string } => item.type === "text" && Boolean(item.text)).map((item) => item.text);
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) {
      return;
    }
    await delay(20);
  }

  throw new Error(`Timed out waiting for ${message}`);
}

describe("feishu long connection ingress", () => {
  it("routes im.message.receive_v1 events from long connection with dedupe", async () => {
    const namespace = randomUUID();
    const workspaceRoot = process.cwd();
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: workspaceRoot,
        BRIDGE_STATE_DIR: path.join(".tmp", namespace, "state"),
        CODEX_HOME: path.join(".tmp", namespace, "codex-home"),
        BRIDGE_UPLOADS_DIR: path.join(".tmp", namespace, "uploads"),
        CODEX_RUNTIME_BACKEND: "mock",
        FEISHU_BASE_URL: "https://open.feishu.cn",
        FEISHU_APP_ID: "cli-app-id",
        FEISHU_APP_SECRET: "cli-app-secret",
        FEISHU_DEFAULT_CHAT_ID: "oc_chat_id",
        FEISHU_VERIFICATION_TOKEN: "",
        FEISHU_ENCRYPT_KEY: "",
      },
      workspaceRoot,
    );
    const logger = createConsoleLogger("feishu-long-connection-test");

    await prepareBridgeDirectories(config);

    const calls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);

      if (!url.startsWith("https://open.feishu.cn")) {
        return originalFetch(input, init);
      }

      if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_root_${calls.length}` } }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages/")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_reply_${calls.length}` } }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const interruptCalls: Array<{ threadId: string; turnId?: string }> = [];

    let onMessage: ((message?: any, sender?: any) => Promise<void>) | null = null;

    const longConnectionFactory = async (params: { onMessage: (message?: any, sender?: any) => Promise<void> }) => {
      onMessage = params.onMessage;
      return {
        stop: async () => {},
      };
    };

    try {
      const runtime = createCodexRuntime(config, logger);
      const originalInterruptTurn = runtime.interruptTurn.bind(runtime);
      runtime.interruptTurn = async (params) => {
        interruptCalls.push(params);
        await originalInterruptTurn(params);
      };

      await runtime.start();
      const service = new BridgeService({ config, logger, runtime });
      await service.initialize();

      const feishu = new FeishuBridge({ config, logger, service, longConnectionFactory });
      await feishu.initialize();

      const task = await service.createTask({
        title: "Long connection task",
        prompt: "Please edit the file and patch it.",
      });

      await waitFor(() => Boolean(service.getTask(task.taskId)?.feishuBinding?.rootMessageId), "feishu binding");
      const rootId = service.getTask(task.taskId)?.feishuBinding?.rootMessageId ?? "";

      assert.ok(onMessage, "long connection handler should be registered");

      await onMessage?.(
        {
          message_id: "om_long_interrupt",
          root_id: rootId,
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "interrupt" }),
        },
        {
          sender_id: {
            open_id: "ou_long",
          },
        },
      );

      await waitFor(() => interruptCalls.length > 0, "interrupt via long connection");
      assert.equal(interruptCalls.at(-1)?.threadId, task.taskId);

      // dedupe same message id
      await onMessage?.(
        {
          message_id: "om_long_interrupt",
          root_id: rootId,
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "interrupt" }),
        },
        {
          sender_id: {
            open_id: "ou_long",
          },
        },
      );

      assert.equal(interruptCalls.length, 1);
      assert.ok(calls.some((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")));

      await feishu.dispose();
      await service.dispose();
      await runtime.dispose();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("routes thread replies that identify the root via thread_id", async () => {
    const namespace = randomUUID();
    const workspaceRoot = process.cwd();
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: workspaceRoot,
        BRIDGE_STATE_DIR: path.join(".tmp", namespace, "state"),
        CODEX_HOME: path.join(".tmp", namespace, "codex-home"),
        BRIDGE_UPLOADS_DIR: path.join(".tmp", namespace, "uploads"),
        CODEX_RUNTIME_BACKEND: "mock",
        FEISHU_BASE_URL: "https://open.feishu.cn",
        FEISHU_APP_ID: "cli-app-id",
        FEISHU_APP_SECRET: "cli-app-secret",
        FEISHU_DEFAULT_CHAT_ID: "oc_chat_id",
        FEISHU_VERIFICATION_TOKEN: "",
        FEISHU_ENCRYPT_KEY: "",
      },
      workspaceRoot,
    );
    const logger = createConsoleLogger("feishu-long-connection-thread-id-test");

    await prepareBridgeDirectories(config);

    const calls: string[] = [];
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(`${init?.method ?? "GET"} ${url}`);

      if (!url.startsWith("https://open.feishu.cn")) {
        return originalFetch(input, init);
      }

      if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_root_${calls.length}` } }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages/")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_reply_${calls.length}` } }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    let onMessage: ((message?: any, sender?: any) => Promise<void>) | null = null;

    const longConnectionFactory = async (params: { onMessage: (message?: any, sender?: any) => Promise<void> }) => {
      onMessage = params.onMessage;
      return {
        stop: async () => {},
      };
    };

    try {
      const runtime = createCodexRuntime(config, logger);
      await runtime.start();

      const service = new BridgeService({ config, logger, runtime });
      await service.initialize();

      const feishu = new FeishuBridge({ config, logger, service, longConnectionFactory });
      await feishu.initialize();

      const task = await service.createTask({
        title: "Long connection thread-id task",
        prompt: "Reply with a short acknowledgement.",
      });

      await waitFor(() => Boolean(service.getTask(task.taskId)?.feishuBinding?.rootMessageId), "feishu binding");
      const rootId = service.getTask(task.taskId)?.feishuBinding?.rootMessageId ?? "";
      const beforeCount = service.getTask(task.taskId)?.conversation.length ?? 0;

      assert.ok(onMessage, "long connection handler should be registered");

      await onMessage?.(
        {
          message_id: "om_long_thread_reply",
          thread_id: rootId,
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "hello from thread reply" }),
        },
        {
          sender_id: {
            open_id: "ou_thread_reply",
          },
        },
      );

      await waitFor(
        () => (service.getTask(task.taskId)?.conversation.length ?? 0) > beforeCount,
        "thread_id reply routing",
      );
      const newMessages = service.getTask(task.taskId)?.conversation.slice(beforeCount) ?? [];
      assert.ok(
        newMessages.some((message) => message.author === "user" && message.content === "hello from thread reply"),
      );

      await feishu.dispose();
      await service.dispose();
      await runtime.dispose();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("supports slash bind, status, and unbind commands for the current Feishu thread", async () => {
    const namespace = randomUUID();
    const workspaceRoot = process.cwd();
    const config = loadBridgeConfig(
      {
        WORKSPACE_PATH: workspaceRoot,
        BRIDGE_STATE_DIR: path.join(".tmp", namespace, "state"),
        CODEX_HOME: path.join(".tmp", namespace, "codex-home"),
        BRIDGE_UPLOADS_DIR: path.join(".tmp", namespace, "uploads"),
        CODEX_RUNTIME_BACKEND: "mock",
        FEISHU_BASE_URL: "https://open.feishu.cn",
        FEISHU_APP_ID: "cli-app-id",
        FEISHU_APP_SECRET: "cli-app-secret",
        FEISHU_DEFAULT_CHAT_ID: "oc_chat_id",
        FEISHU_VERIFICATION_TOKEN: "",
        FEISHU_ENCRYPT_KEY: "",
      },
      workspaceRoot,
    );
    const logger = createConsoleLogger("feishu-long-connection-bind-command-test");

    await prepareBridgeDirectories(config);

    const calls: string[] = [];
    const requests: Array<{ method: string; url: string; body?: string }> = [];
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body === undefined || init?.body === null
            ? undefined
            : String(init.body);
      calls.push(`${method} ${url}`);
      requests.push({ method, url, body });

      if (!url.startsWith("https://open.feishu.cn")) {
        return originalFetch(input, init);
      }

      if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
        return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_root_${calls.length}` } }), {
          status: 200,
        });
      }

      if (url.includes("/open-apis/im/v1/messages/")) {
        return new Response(JSON.stringify({ code: 0, data: { message_id: `om_reply_${calls.length}` } }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    let onMessage: ((message?: any, sender?: any) => Promise<void>) | null = null;

    const longConnectionFactory = async (params: { onMessage: (message?: any, sender?: any) => Promise<void> }) => {
      onMessage = params.onMessage;
      return {
        stop: async () => {},
      };
    };

    try {
      const runtime = createCodexRuntime(config, logger);
      await runtime.start();

      const service = new BridgeService({ config, logger, runtime });
      await service.initialize();

      const feishu = new FeishuBridge({ config, logger, service, longConnectionFactory });
      await feishu.initialize();

      const task = await service.createTask({
        title: "Long connection bind command task",
      });

      await waitFor(() => Boolean(service.getTask(task.taskId)?.feishuBinding?.rootMessageId), "initial feishu binding");
      await service.unbindFeishuThread(task.taskId);

      assert.ok(onMessage, "long connection handler should be registered");
      assert.equal(service.getTask(task.taskId)?.feishuBinding, undefined);
      assert.equal(service.getTask(task.taskId)?.feishuBindingDisabled, true);

      const rootSendCountBefore = calls.filter((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")).length;

      await onMessage?.(
        {
          message_id: "om_status_unbound",
          thread_id: "omt_current_thread",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/status" }),
        },
        {
          sender_id: {
            open_id: "ou_bind_command",
          },
        },
      );

      await waitFor(
        () => requests.some((request) => request.body?.includes("currently unbound")),
        "unbound status reply",
      );

      await onMessage?.(
        {
          message_id: "om_bind_current",
          thread_id: "omt_current_thread",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: `/bind ${task.taskId}` }),
        },
        {
          sender_id: {
            open_id: "ou_bind_command",
          },
        },
      );

      await waitFor(
        () => service.getTask(task.taskId)?.feishuBinding?.threadKey === "omt_current_thread",
        "manual thread binding",
      );
      assert.equal(service.getTask(task.taskId)?.feishuBinding?.rootMessageId, "om_bind_current");
      assert.equal(service.getTask(task.taskId)?.feishuBindingDisabled, false);

      const beforeConversationCount = service.getTask(task.taskId)?.conversation.length ?? 0;
      await onMessage?.(
        {
          message_id: "om_bound_message",
          thread_id: "omt_current_thread",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "hello after bind" }),
        },
        {
          sender_id: {
            open_id: "ou_bind_command",
          },
        },
      );

      await waitFor(
        () => (service.getTask(task.taskId)?.conversation.length ?? 0) > beforeConversationCount,
        "bound thread message routing",
      );
      assert.ok(
        service
          .getTask(task.taskId)
          ?.conversation.some((message) => message.author === "user" && message.content === "hello after bind"),
      );

      await onMessage?.(
        {
          message_id: "om_status_bound",
          thread_id: "omt_current_thread",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/status" }),
        },
        {
          sender_id: {
            open_id: "ou_bind_command",
          },
        },
      );

      await waitFor(
        () => requests.some((request) => request.body?.includes(`taskId: ${task.taskId}`)),
        "bound status reply",
      );

      await onMessage?.(
        {
          message_id: "om_unbind_current",
          thread_id: "omt_current_thread",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/unbind" }),
        },
        {
          sender_id: {
            open_id: "ou_bind_command",
          },
        },
      );

      await waitFor(() => service.getTask(task.taskId)?.feishuBinding === undefined, "thread unbind");
      assert.equal(service.getTask(task.taskId)?.feishuBindingDisabled, true);

      await service.sendMessage(task.taskId, {
        content: "local follow-up after unbind",
      });
      await delay(50);

      const rootSendCountAfter = calls.filter((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")).length;
      assert.equal(rootSendCountAfter, rootSendCountBefore);

      await feishu.dispose();
      await service.dispose();
      await runtime.dispose();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
