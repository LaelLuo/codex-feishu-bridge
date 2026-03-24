import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it } from "node:test";

import { createConsoleLogger, prepareBridgeDirectories, type Logger } from "@codex-feishu-bridge/shared";

import { FeishuBridge } from "../src/feishu/bridge";
import { createCodexRuntime } from "../src/runtime";
import { MockCodexRuntime } from "../src/runtime/mock-codex-runtime";
import { BridgeService } from "../src/service/bridge-service";
import { createTestBridgeConfig } from "./test-paths";

interface RequestRecord {
  method: string;
  url: string;
  body?: string;
  responseMessageId?: string;
}

interface LogRecord {
  level: "info" | "warn" | "error";
  message: string;
  metadata?: unknown;
}

interface LongConnectionHarness {
  calls: string[];
  logs: LogRecord[];
  requests: RequestRecord[];
  runtime: ReturnType<typeof createCodexRuntime>;
  service: BridgeService;
  feishu: FeishuBridge;
  cleanup: () => Promise<void>;
  onMessage: (message?: unknown, sender?: unknown) => Promise<void>;
  onCardAction: (event?: unknown) => Promise<unknown>;
}

function parseMessageText(request: RequestRecord): string {
  const payload = JSON.parse(request.body ?? "{}") as { content?: string };
  if (!payload.content) {
    return "";
  }

  try {
    return (JSON.parse(payload.content) as { text?: string }).text ?? "";
  } catch {
    return "";
  }
}

function parsePostTexts(request: RequestRecord): string[] {
  const payload = JSON.parse(request.body ?? "{}") as { content?: string; msg_type?: string };
  if (payload.msg_type !== "post" || !payload.content) {
    return [];
  }

  try {
    const parsed = JSON.parse(payload.content) as Record<string, unknown>;
    const localeBlock = Object.values(parsed).find(
      (value) =>
        value &&
        typeof value === "object" &&
        Array.isArray((value as { content?: unknown }).content),
    ) as { content?: Array<Array<{ tag?: string; text?: string }>> } | undefined;
    if (!localeBlock?.content) {
      return [];
    }

    const texts: string[] = [];
    for (const line of localeBlock.content) {
      for (const item of line) {
        if (item?.tag === "md" && typeof item.text === "string") {
          texts.push(item.text);
        }
      }
    }
    return texts;
  } catch {
    return [];
  }
}

function countMarkdownFenceMarkers(text: string): number {
  return text
    .split("\n")
    .filter((line) => line.trimStart().startsWith("```")).length;
}

function hasDanglingSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function parseInteractiveCard(request: RequestRecord): Record<string, unknown> | null {
  const payload = JSON.parse(request.body ?? "{}") as { content?: string; msg_type?: string };
  if ((payload.msg_type !== undefined && payload.msg_type !== "interactive") || !payload.content) {
    return null;
  }

  try {
    return JSON.parse(payload.content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function requestContainsCardTitle(request: RequestRecord, title: string): boolean {
  const card = parseInteractiveCard(request);
  const header = card?.header as { title?: { content?: string } } | undefined;
  return header?.title?.content === title;
}

function requestContainsCardText(request: RequestRecord, needle: string): boolean {
  const card = parseInteractiveCard(request);
  if (!card) {
    return false;
  }

  return JSON.stringify(card).includes(needle);
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

async function createHarness(envOverrides: Record<string, string> = {}): Promise<LongConnectionHarness> {
  const namespace = randomUUID();
  const config = createTestBridgeConfig(namespace, {
    CODEX_RUNTIME_BACKEND: "mock",
    FEISHU_BASE_URL: "https://open.feishu.cn",
    FEISHU_APP_ID: "cli-app-id",
    FEISHU_APP_SECRET: "cli-app-secret",
    FEISHU_DEFAULT_CHAT_ID: "oc_chat_id",
    FEISHU_VERIFICATION_TOKEN: "",
    FEISHU_ENCRYPT_KEY: "",
    ...envOverrides,
  });
  const baseLogger = createConsoleLogger("feishu-long-connection-test");
  const logs: LogRecord[] = [];
  const logger: Logger = {
    info(message, metadata) {
      logs.push({ level: "info", message, metadata });
      baseLogger.info(message, metadata);
    },
    warn(message, metadata) {
      logs.push({ level: "warn", message, metadata });
      baseLogger.warn(message, metadata);
    },
    error(message, metadata) {
      logs.push({ level: "error", message, metadata });
      baseLogger.error(message, metadata);
    },
  };

  await prepareBridgeDirectories(config);

  const calls: string[] = [];
  const requests: RequestRecord[] = [];
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
    const requestRecord: RequestRecord = { method, url, body };
    requests.push(requestRecord);

    if (!url.startsWith("https://open.feishu.cn")) {
      return originalFetch(input, init);
    }

    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }), {
        status: 200,
      });
    }

    if (url.includes("/open-apis/im/v1/messages/")) {
      requestRecord.responseMessageId = `om_reply_${requests.length}`;
      return new Response(JSON.stringify({ code: 0, data: { message_id: requestRecord.responseMessageId } }), {
        status: 200,
      });
    }

    if (url.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")) {
      requestRecord.responseMessageId = `om_root_${requests.length}`;
      return new Response(JSON.stringify({ code: 0, data: { message_id: requestRecord.responseMessageId } }), {
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  let onMessage: ((message?: unknown, sender?: unknown) => Promise<void>) | null = null;
  let onCardAction: ((event?: unknown) => Promise<unknown>) | null = null;
  const longConnectionFactory = async (params: {
    onMessage: (message?: unknown, sender?: unknown) => Promise<void>;
    onCardAction: (event?: unknown) => Promise<unknown>;
  }) => {
    onMessage = params.onMessage;
    onCardAction = params.onCardAction;
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

    return {
      calls,
      logs,
      requests,
      runtime,
      service,
      feishu,
      onMessage: async (message?: unknown, sender?: unknown) => {
        assert.ok(onMessage, "long connection handler should be registered");
        await onMessage?.(message, sender);
      },
      onCardAction: async (event?: unknown) => {
        assert.ok(onCardAction, "long connection card handler should be registered");
        return onCardAction?.(event);
      },
      cleanup: async () => {
        feishu.dispose();
        await service.dispose();
        await runtime.dispose();
        global.fetch = originalFetch;
      },
    };
  } catch (error) {
    global.fetch = originalFetch;
    throw error;
  }
}

describe("feishu long connection ingress", { concurrency: 1 }, () => {
  it("turns the first unbound plain-text message into a draft card and creates a bound task from card actions", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_plain",
          thread_id: "omt_new_task",
          root_id: "om_root_new_task",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "hello before binding" }),
        },
        {
          sender_id: {
            open_id: "ou_plain",
          },
        },
      );

      assert.equal(harness.service.listTasks().length, 0);
      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "draft card reply",
      );
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Current /new draft")),
        false,
      );
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Mock response for: hello before binding")),
        false,
      );

      const firstCard = await harness.onCardAction({
        open_message_id: "om_card_new_task",
        open_id: "ou_plain",
        action: {
          tag: "select_static",
          option: "gpt-5.4-mini",
          value: {
            kind: "draft.select.model",
            chatId: "oc_chat_id",
            threadKey: "omt_new_task",
            rootMessageId: "om_root_new_task",
          },
        },
      });
      assert.ok(firstCard);
      assert.match(JSON.stringify(firstCard), /gpt-5\.4-mini/);

      const createdCard = await harness.onCardAction({
        open_message_id: "om_card_new_task",
        open_id: "ou_plain",
        action: {
          tag: "button",
          value: {
            kind: "draft.create",
            chatId: "oc_chat_id",
            threadKey: "omt_new_task",
            rootMessageId: "om_root_new_task",
          },
        },
      });

      assert.ok(createdCard);
      assert.match(JSON.stringify(createdCard), /Creating the host task now/);
      await waitFor(
        () => harness.service.listTasks()[0]?.feishuBinding?.threadKey === "omt_new_task",
        "task binding after draft create",
      );
      const createdTask = harness.service.listTasks()[0];
      assert.ok(createdTask);
      assert.equal(createdTask?.feishuBinding?.threadKey, "omt_new_task");
      assert.equal(createdTask?.executionProfile.model, "gpt-5.4-mini");
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_card_new_task") &&
              requestContainsCardTitle(request, `Task: ${createdTask.title}`),
          ),
        "draft card patched into task control card",
      );
      assert.equal(
        harness.calls.some((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")),
        false,
      );

      await waitFor(
        () => harness.requests.some((request) => parsePostTexts(request).some((text) => text.includes("Mock response for: hello before binding"))),
        "first final agent reply",
      );
      assert.equal(
        harness.requests.some(
          (request) =>
            request.method === "POST" &&
            request.url.includes("/open-apis/im/v1/messages/") &&
            parsePostTexts(request).some((text) => text.includes("Mock response for: hello before binding")),
        ),
        true,
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardTitle(request, "Codex Reply")),
        false,
      );

      await harness.onMessage(
        {
          message_id: "om_follow_up",
          thread_id: "omt_new_task",
          root_id: "om_root_new_task",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "second prompt" }),
        },
        {
          sender_id: {
            open_id: "ou_new",
          },
        },
      );

      await waitFor(
        () =>
          harness.requests.some(
            (request) => {
              if (request.method !== "POST" || !request.url.includes("/open-apis/im/v1/messages/")) {
                return false;
              }
              const card = parseInteractiveCard(request);
              const title = ((card?.header as { title?: { content?: string } } | undefined)?.title?.content ?? "").trim();
              return (
                title.startsWith("Task Activity:") &&
                (
                  requestContainsCardText(request, "This Feishu message started a turn immediately.") ||
                  requestContainsCardText(request, "This Feishu message was sent into the current running turn.") ||
                  requestContainsCardText(request, "Queued the latest Feishu message for the next turn.")
                )
              );
            },
          ),
        "follow-up activity card",
      );
      await waitFor(
        () =>
          harness.requests.some((request) => parsePostTexts(request).some((text) => text.includes("Mock response for: second prompt"))) ||
          (harness.service.getTask(createdTask!.taskId)?.queuedMessageCount ?? 0) > 0,
        "follow-up reply or queue receipt",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("turns a group post message with an @ mention into a draft card", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_group_post",
          thread_id: "omt_group_post",
          root_id: "om_root_group_post",
          chat_id: "oc_chat_id",
          message_type: "post",
          content: JSON.stringify({
            title: "",
            content: [
              [
                {
                  tag: "at",
                  user_id: "@_user_1",
                  user_name: "codex-feishu-bridge",
                  style: [],
                },
                {
                  tag: "text",
                  text: " 这是群聊里发的",
                },
              ],
            ],
          }),
        },
        {
          sender_id: {
            open_id: "ou_group_post",
          },
        },
      );

      assert.equal(harness.service.listTasks().length, 0);
      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "group post draft card reply",
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "这是群聊里发的")),
        true,
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "codex-feishu-bridge")),
        false,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("splits long agent replies into multiple post markdown messages instead of falling back to cards", async () => {
    const harness = await createHarness();

    try {
      const replyWithAgentMessage = (harness.feishu as unknown as {
        replyWithAgentMessage(messageId: string, text: string): Promise<string>;
      }).replyWithAgentMessage.bind(harness.feishu);
      const longReply = [
        "## Deploy Plan",
        "",
        "```ts",
        `const rocket = "${"🚀".repeat(3600)}";`,
        "console.log(rocket);",
        "",
        "```",
        "",
        "## Notes",
        "",
        "A".repeat(2200),
        "",
        "## Next",
        "",
        "B".repeat(2200),
      ].join("\n");

      await replyWithAgentMessage("om_long_reply_target", longReply);

      const postReplies = harness.requests.filter(
        (request) =>
          request.method === "POST" &&
          request.url.endsWith("/open-apis/im/v1/messages/om_long_reply_target/reply") &&
          parsePostTexts(request).length > 0,
      );
      assert.ok(postReplies.length > 1);
      const postTexts = postReplies.flatMap((request) => parsePostTexts(request));
      assert.equal(postTexts.every((text) => text.trim().length > 0), true);
      assert.equal(postTexts.every((text) => countMarkdownFenceMarkers(text) % 2 === 0), true);
      assert.equal(postTexts.every((text) => !hasDanglingSurrogate(text)), true);
      assert.equal(postReplies.some((request) => requestContainsCardTitle(request, "Codex Reply")), false);
    } finally {
      await harness.cleanup();
    }
  });

  it("renders the first draft card in Chinese when FEISHU_UI_LANGUAGE=zh-CN", async () => {
    const harness = await createHarness({
      FEISHU_UI_LANGUAGE: "zh-CN",
    });

    try {
      await harness.onMessage(
        {
          message_id: "om_plain_zh",
          thread_id: "omt_new_task_zh",
          root_id: "om_root_new_task_zh",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "请帮我看一下 bridge 状态" }),
        },
        {
          sender_id: {
            open_id: "ou_plain_zh",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "创建 Codex 任务")),
        "zh-CN draft card reply",
      );

      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "在主机上开始")),
        true,
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "恢复默认配置")),
        true,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("opens import existing thread from a dedicated draft-card action and binds it to the current Feishu thread", async () => {
    const harness = await createHarness();

    try {
      const externalThread = (harness.runtime as MockCodexRuntime).seedExternalThread({
        id: "thr_import_from_card",
        name: "External CLI thread",
      });

      await harness.onMessage(
        {
          message_id: "om_plain_import",
          thread_id: "omt_import_task",
          root_id: "om_root_import_task",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "bind an existing thread here" }),
        },
        {
          sender_id: {
            open_id: "ou_import_card",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "draft card reply before import",
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "Import Existing Thread")),
        true,
      );

      const draftEntries = (
        harness.feishu as unknown as { threadDrafts: Map<string, { cardMessageId?: string }> }
      ).threadDrafts;
      const draftCard = draftEntries.get("oc_chat_id:omt_import_task");
      assert.ok(draftCard?.cardMessageId);

      const importOpenRequestCount = harness.requests.filter(
        (request) =>
          (request.method === "POST" || request.method === "PATCH") &&
          requestContainsCardTitle(request, "Import Existing Thread"),
      ).length;

      const openImportResult = await harness.onCardAction({
        open_message_id: draftCard?.cardMessageId,
        open_id: "ou_import_card",
        action: {
          tag: "button",
          value: {
            kind: "draft.import.open",
            chatId: "oc_chat_id",
            threadKey: "omt_import_task",
            rootMessageId: "om_root_import_task",
            revision: 1,
          },
        },
      });

      assert.ok(openImportResult);
      assert.equal(JSON.stringify(openImportResult).includes("Import Existing Thread"), true);
      assert.equal(JSON.stringify(openImportResult).includes("thread_id_input"), true);
      assert.equal(
        harness.requests.filter(
          (request) =>
            (request.method === "POST" || request.method === "PATCH") &&
            requestContainsCardTitle(request, "Import Existing Thread"),
        ).length,
        importOpenRequestCount,
      );

      const submitImportResult = await harness.onCardAction({
        open_message_id: draftCard?.cardMessageId,
        open_id: "ou_import_card",
        action: {
          tag: "button",
          form_value: {
            thread_id_input: externalThread.id,
          },
          value: {
            kind: "draft.import.submit",
            chatId: "oc_chat_id",
            threadKey: "omt_import_task",
            rootMessageId: "om_root_import_task",
            revision: 2,
          },
        },
      });

      assert.ok(submitImportResult);
      assert.equal(JSON.stringify(submitImportResult).includes("Import Existing Thread"), true);
      assert.equal(JSON.stringify(submitImportResult).includes("Importing that host thread now"), true);
      await waitFor(
        () => harness.service.getTask(externalThread.id)?.feishuBinding?.threadKey === "omt_import_task",
        "imported task binding",
      );
      assert.equal(harness.service.getTask(externalThread.id)?.mode, "manual-import");
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${draftCard?.cardMessageId}`) &&
              requestContainsCardTitle(request, "Task: External CLI thread"),
          ),
        "draft card replaced by task control card after import",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps the original binding when another Feishu thread tries to import the same task again", async () => {
    const harness = await createHarness();

    try {
      const externalThread = (harness.runtime as MockCodexRuntime).seedExternalThread({
        id: "thr_import_binding_conflict",
        name: "External CLI thread for conflict",
      });

      await harness.onMessage(
        {
          message_id: "om_plain_import_first",
          thread_id: "omt_import_first",
          root_id: "om_root_import_first",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "bind this existing thread here first" }),
        },
        {
          sender_id: {
            open_id: "ou_import_first",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "first draft card reply before import",
      );

      const firstDraftEntries = (
        harness.feishu as unknown as { threadDrafts: Map<string, { cardMessageId?: string }> }
      ).threadDrafts;
      const firstDraftCard = firstDraftEntries.get("oc_chat_id:omt_import_first");
      assert.ok(firstDraftCard?.cardMessageId);

      await harness.onCardAction({
        open_message_id: firstDraftCard.cardMessageId,
        open_id: "ou_import_first",
        action: {
          tag: "button",
          form_value: {
            thread_id_input: externalThread.id,
          },
          value: {
            kind: "draft.import.submit",
            chatId: "oc_chat_id",
            threadKey: "omt_import_first",
            rootMessageId: "om_root_import_first",
            revision: 1,
          },
        },
      });

      await waitFor(
        () => harness.service.getTask(externalThread.id)?.feishuBinding?.threadKey === "omt_import_first",
        "first imported task binding",
      );

      await harness.onMessage(
        {
          message_id: "om_plain_import_second",
          thread_id: "omt_import_second",
          root_id: "om_root_import_second",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "try importing the same task again" }),
        },
        {
          sender_id: {
            open_id: "ou_import_second",
          },
        },
      );

      const secondDraftEntries = (
        harness.feishu as unknown as { threadDrafts: Map<string, { cardMessageId?: string }> }
      ).threadDrafts;
      const secondDraftCard = secondDraftEntries.get("oc_chat_id:omt_import_second");
      assert.ok(secondDraftCard?.cardMessageId);

      await harness.onCardAction({
        open_message_id: secondDraftCard.cardMessageId,
        open_id: "ou_import_second",
        action: {
          tag: "button",
          form_value: {
            thread_id_input: externalThread.id,
          },
          value: {
            kind: "draft.import.submit",
            chatId: "oc_chat_id",
            threadKey: "omt_import_second",
            rootMessageId: "om_root_import_second",
            revision: 1,
          },
        },
      });

      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${secondDraftCard.cardMessageId}`) &&
              requestContainsCardTitle(request, "Import Existing Thread") &&
              requestContainsCardText(request, "already bound to a different Feishu thread"),
          ),
        "binding conflict shown on second import form",
      );

      assert.deepEqual(harness.service.getTask(externalThread.id)?.feishuBinding, {
        chatId: "oc_chat_id",
        threadKey: "omt_import_first",
        rootMessageId: "om_root_import_first",
      });
      assert.ok(secondDraftEntries.get("oc_chat_id:omt_import_second"));
    } finally {
      await harness.cleanup();
    }
  });

  it("opens the import form from the dedicated draft-card action even when Feishu omits open_message_id", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_plain_import_mobile",
          thread_id: "omt_import_mobile",
          root_id: "om_root_import_mobile",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "import thread on mobile" }),
        },
        {
          sender_id: {
            open_id: "ou_import_mobile",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "draft card reply before mobile import",
      );
      assert.equal(
        harness.requests.some((request) => requestContainsCardText(request, "Import Existing Thread")),
        true,
      );

      const draftEntries = (
        harness.feishu as unknown as { threadDrafts: Map<string, { cardMessageId?: string }> }
      ).threadDrafts;
      const draftCard = draftEntries.get("oc_chat_id:omt_import_mobile");
      assert.ok(draftCard?.cardMessageId);
      const importOpenRequestCount = harness.requests.filter(
        (request) =>
          (request.method === "POST" || request.method === "PATCH") &&
          requestContainsCardTitle(request, "Import Existing Thread"),
      ).length;

      const result = await harness.onCardAction({
        open_id: "ou_import_mobile",
        action: {
          tag: "button",
          value: {
            kind: "draft.import.open",
            chatId: "oc_chat_id",
            threadKey: "omt_import_mobile",
            rootMessageId: "om_root_import_mobile",
            revision: 1,
          },
        },
      });

      assert.ok(result);
      assert.equal(JSON.stringify(result).includes("Import Existing Thread"), true);
      assert.equal(JSON.stringify(result).includes("thread_id_input"), true);
      assert.equal(
        harness.logs.some(
          (entry) => {
            const metadata = (entry.metadata ?? {}) as {
              draftCardMessageId?: string;
              openMessageId?: string;
            };
            return (
            entry.level === "info" &&
            entry.message === "opening feishu draft import card from primary action" &&
            metadata.draftCardMessageId === draftCard?.cardMessageId &&
            metadata.openMessageId === undefined
            );
          },
        ),
        true,
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_root_import_mobile/reply") &&
              requestContainsCardTitle(request, "Import Existing Thread") &&
              requestContainsCardText(request, "thread_id_input"),
        ),
        "fallback import form reply on thread root for mobile clients",
      );
      await waitFor(
        () =>
          harness.logs.some(
            (entry) => {
              const metadata = (entry.metadata ?? {}) as {
                replyTargetId?: string;
                usedFallbackReply?: boolean;
              };
              return (
                entry.level === "info" &&
                entry.message === "completed feishu draft import open follow-up" &&
                metadata.replyTargetId === "om_root_import_mobile" &&
                metadata.usedFallbackReply === true
              );
            },
          ),
        "completed import-open follow-up log for mobile clients",
      );
      assert.equal(
        harness.requests.filter(
          (request) =>
            (request.method === "POST" || request.method === "PATCH") &&
            requestContainsCardTitle(request, "Import Existing Thread"),
        ).length,
        importOpenRequestCount + 1,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps import form updates on the fallback reply when submit also omits open_message_id", async () => {
    const harness = await createHarness();

    try {
      const importedThreadId = "thr_import_mobile_followup";
      harness.runtime.seedExternalThread({
        id: importedThreadId,
        name: "Imported mobile thread",
        cwd: "/tmp/workspace",
      });

      await harness.onMessage(
        {
          message_id: "om_plain_import_mobile_submit",
          thread_id: "omt_import_mobile_submit",
          root_id: "om_root_import_mobile_submit",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "import thread from mobile again" }),
        },
        {
          sender_id: {
            open_id: "ou_import_mobile_submit",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "draft card reply before mobile import submit",
      );

      const openImportResult = await harness.onCardAction({
        open_id: "ou_import_mobile_submit",
        action: {
          tag: "button",
          value: {
            kind: "draft.import.open",
            chatId: "oc_chat_id",
            threadKey: "omt_import_mobile_submit",
            rootMessageId: "om_root_import_mobile_submit",
            revision: 1,
          },
        },
      });

      assert.ok(openImportResult);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_root_import_mobile_submit/reply") &&
              requestContainsCardTitle(request, "Import Existing Thread"),
          ),
        "fallback import form reply before mobile submit",
      );

      const fallbackImportReply = harness.requests.find(
        (request) =>
          request.method === "POST" &&
          request.url.endsWith("/open-apis/im/v1/messages/om_root_import_mobile_submit/reply") &&
          requestContainsCardTitle(request, "Import Existing Thread"),
      );
      assert.ok(fallbackImportReply?.responseMessageId);

      const submitImportResult = await harness.onCardAction({
        open_id: "ou_import_mobile_submit",
        action: {
          tag: "button",
          form_value: {
            thread_id_input: importedThreadId,
          },
          value: {
            kind: "draft.import.submit",
            chatId: "oc_chat_id",
            threadKey: "omt_import_mobile_submit",
            rootMessageId: "om_root_import_mobile_submit",
            revision: 2,
          },
        },
      });

      assert.ok(submitImportResult);
      assert.equal(JSON.stringify(submitImportResult).includes("Import Existing Thread"), true);
      assert.equal(JSON.stringify(submitImportResult).includes("Importing that host thread now"), true);
      await waitFor(
        () =>
          harness.service.listTasks().some(
            (task) =>
              task.threadId === importedThreadId &&
              task.feishuBinding?.threadKey === "omt_import_mobile_submit",
          ),
        "mobile imported task binding",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${fallbackImportReply.responseMessageId}`) &&
              requestContainsCardTitle(request, "Task: Imported mobile thread") &&
              requestContainsCardText(request, importedThreadId),
          ),
        "patched fallback import reply into the bound task card",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId?: string }> }
      ).threadTaskCards;
      const savedTaskCard = taskCards.get("oc_chat_id:omt_import_mobile_submit");
      assert.equal(savedTaskCard?.messageId, fallbackImportReply.responseMessageId);
    } finally {
      await harness.cleanup();
    }
  });

  it("updates the draft card through long-connection card actions and falls back to the model default effort", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_models_init",
          thread_id: "omt_models",
          root_id: "om_root_models",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/new" }),
        },
        {
          sender_id: {
            open_id: "ou_models",
          },
        },
      );
      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "initial draft card",
      );

      const effortCard = await harness.onCardAction({
        open_message_id: "om_card_models",
        open_id: "ou_models",
        action: {
          tag: "select_static",
          option: "xhigh",
          value: {
            kind: "draft.select.effort",
            chatId: "oc_chat_id",
            threadKey: "omt_models",
            rootMessageId: "om_root_models",
          },
        },
      });
      assert.ok(effortCard);
      assert.match(JSON.stringify(effortCard), /Selected effort xhigh\./);

      const fallbackCard = await harness.onCardAction({
        open_message_id: "om_card_models",
        open_id: "ou_models",
        action: {
          tag: "select_static",
          option: "gpt-5.4-mini",
          value: {
            kind: "draft.select.model",
            chatId: "oc_chat_id",
            threadKey: "omt_models",
            rootMessageId: "om_root_models",
          },
        },
      });
      assert.ok(fallbackCard);
      assert.match(JSON.stringify(fallbackCard), /Selected model gpt-5\.4-mini; effort reverted to low\./);
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Available models:")),
        false,
      );

      const createCard = await harness.onCardAction({
        open_message_id: "om_card_models",
        open_id: "ou_models",
        action: {
          tag: "button",
          value: {
            kind: "draft.create",
            chatId: "oc_chat_id",
            threadKey: "omt_models",
            rootMessageId: "om_root_models",
          },
        },
      });

      assert.ok(createCard);
      assert.match(JSON.stringify(createCard), /Creating the host task now/);
      await waitFor(
        () => harness.service.listTasks()[0]?.feishuBinding?.threadKey === "omt_models",
        "task creation from model draft",
      );
      const task = harness.service.listTasks()[0];
      assert.equal(task?.executionProfile.model, "gpt-5.4-mini");
      assert.equal(task?.executionProfile.effort, "low");
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_card_models") &&
              requestContainsCardText(
                request,
                "Send the first plain-text message in this thread to start the first turn.",
              ),
          ),
        "patched task control card after model draft create",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps mobile card actions working when Feishu omits open_message_id", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_mobile_init",
          thread_id: "omt_mobile",
          root_id: "om_root_mobile",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/new" }),
        },
        {
          sender_id: {
            open_id: "ou_mobile",
          },
        },
      );
      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "initial mobile draft card",
      );

      const firstCancelCard = await harness.onCardAction({
        open_id: "ou_mobile",
        action: {
          tag: "button",
          value: {
            kind: "draft.cancel",
            chatId: "oc_chat_id",
            threadKey: "omt_mobile",
            rootMessageId: "om_root_mobile",
            revision: 1,
          },
        },
      });
      assert.ok(firstCancelCard);
      assert.match(JSON.stringify(firstCancelCard), /Draft cancelled/);

      const secondCancelCard = await harness.onCardAction({
        open_id: "ou_mobile",
        action: {
          tag: "button",
          value: {
            kind: "draft.cancel",
            chatId: "oc_chat_id",
            threadKey: "omt_mobile",
            rootMessageId: "om_root_mobile",
            revision: 2,
          },
        },
      });
      assert.ok(secondCancelCard);
      assert.match(JSON.stringify(secondCancelCard), /Draft cancelled/);

      const createCard = await harness.onCardAction({
        open_id: "ou_mobile",
        action: {
          tag: "button",
          value: {
            kind: "draft.create",
            chatId: "oc_chat_id",
            threadKey: "omt_mobile",
            rootMessageId: "om_root_mobile",
            revision: 3,
          },
        },
      });

      await waitFor(
        () => harness.service.listTasks()[0]?.feishuBinding?.threadKey === "omt_mobile",
        "mobile task creation",
      );
      assert.ok(createCard);
      assert.match(JSON.stringify(createCard), /Creating the host task now/);
      assert.equal(
        harness.calls.some((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")),
        false,
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardText(
                request,
                "Send the first plain-text message in this thread to start the first turn.",
              ),
          ),
        "mobile task control card patch",
      );
      assert.ok(
        harness.requests.filter(
          (request) => request.method === "PATCH" && request.url.includes("/open-apis/im/v1/messages/"),
        ).length >= 3,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("recovers stale draft cards that no longer have a saved card message id", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_stale_init",
          thread_id: "omt_stale",
          root_id: "om_root_stale",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "stale draft prompt" }),
        },
        {
          sender_id: {
            open_id: "ou_stale",
          },
        },
      );
      await waitFor(
        () => harness.requests.some((request) => requestContainsCardTitle(request, "Create Codex Task")),
        "stale draft card",
      );

      const staleKey = "oc_chat_id:omt_stale";
      const drafts = (harness.feishu as unknown as { threadDrafts: Map<string, { cardMessageId?: string }> }).threadDrafts;
      const staleDraft = drafts.get(staleKey);
      assert.ok(staleDraft);
      delete staleDraft?.cardMessageId;

      const previousInteractiveReplyCount = harness.requests.filter(
        (request) => request.method === "POST" && request.url.includes("/open-apis/im/v1/messages/") && requestContainsCardTitle(request, "Create Codex Task"),
      ).length;

      const cancelledCard = await harness.onCardAction({
        open_id: "ou_stale",
        action: {
          tag: "button",
          value: {
            kind: "draft.cancel",
            chatId: "oc_chat_id",
            threadKey: "omt_stale",
            rootMessageId: "om_root_stale",
            revision: 2,
          },
        },
      });

      assert.ok(cancelledCard);
      assert.match(JSON.stringify(cancelledCard), /Draft cancelled/);
      await waitFor(
        () =>
          harness.requests.filter(
            (request) => request.method === "POST" && request.url.includes("/open-apis/im/v1/messages/") && requestContainsCardTitle(request, "Create Codex Task"),
          ).length > previousInteractiveReplyCount,
        "replacement draft card reply",
      );
      assert.ok(drafts.get(staleKey)?.cardMessageId);
    } finally {
      await harness.cleanup();
    }
  });

  it("replies with a new interactive approval card instead of slash-command text when a bound task requests approval", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Approval card task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      const previousApprovalCardReplyCount = harness.requests.filter(
        (request) =>
          request.method === "POST" &&
          request.url.includes("/open-apis/im/v1/messages/") &&
          requestContainsCardTitle(request, `Task: ${task.title}`) &&
          requestContainsCardText(request, "Pending Approval"),
      ).length;

      await harness.service.sendMessage(task.taskId, {
        content: "Run a shell command for me.",
        source: "feishu",
        replyToFeishu: true,
      });

      await waitFor(
        () => (harness.service.getTask(task.taskId)?.pendingApprovals.length ?? 0) > 0,
        "approval after binding",
      );
      await waitFor(
        () =>
          harness.requests.filter(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`) &&
              requestContainsCardText(request, "Pending Approval"),
          ).length > previousApprovalCardReplyCount,
        "approval card reply",
      );

      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Approval requested for")),
        false,
      );
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Use /approve, /decline, or /cancel.")),
        false,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("replies with a new status snapshot card instead of patching the bound task card", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Status card task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId: string }> }
      ).threadTaskCards;
      const currentCard = taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`);
      assert.ok(currentCard?.messageId);

      const previousSnapshotReplyCount = harness.requests.filter(
        (request) =>
          request.method === "POST" &&
          request.url.includes("/open-apis/im/v1/messages/") &&
          requestContainsCardTitle(request, `Task Status Snapshot: ${task.title}`),
      ).length;
      const previousPatchCount = harness.requests.filter(
        (request) => request.method === "PATCH" && request.url.endsWith(`/open-apis/im/v1/messages/${currentCard?.messageId}`),
      ).length;

      const statusResult = await harness.onCardAction({
        open_message_id: currentCard?.messageId,
        open_id: "ou_status_card",
        action: {
          tag: "button",
          value: {
            kind: "task.status",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_status_task",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 1,
          },
        },
      });

      assert.ok(statusResult);
      await waitFor(
        () =>
          harness.requests.filter(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task Status Snapshot: ${task.title}`),
          ).length > previousSnapshotReplyCount,
        "status snapshot card reply",
      );
      assert.equal(
        harness.requests.filter(
          (request) => request.method === "PATCH" && request.url.endsWith(`/open-apis/im/v1/messages/${currentCard?.messageId}`),
        ).length,
        previousPatchCount,
      );
      assert.equal(taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`)?.messageId, currentCard?.messageId);
    } finally {
      await harness.cleanup();
    }
  });

  it("patches the interacted task card when toggling plan mode from an older bound card", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Running mode card task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId: string; revision: number; note?: string }> }
      ).threadTaskCards;
      const threadCardKey = `${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`;
      const originalCard = taskCards.get(threadCardKey);
      assert.ok(originalCard?.messageId);

      taskCards.set(threadCardKey, {
        messageId: "om_reply_newer_control_card",
        revision: (originalCard?.revision ?? 1) + 1,
        note: "A newer control card exists.",
      });

      const toggleResult = await harness.onCardAction({
        open_message_id: originalCard?.messageId,
        open_id: "ou_toggle_plan_mode",
        action: {
          tag: "button",
          value: {
            kind: "task.toggle.plan-mode",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_running_mode_task",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 1,
          },
        },
      });

      assert.ok(toggleResult);
      await waitFor(
        () => harness.service.getTask(task.taskId)?.executionProfile.planMode === true,
        "enabled plan mode",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${originalCard?.messageId}`) &&
              requestContainsCardText(request, "Plan Mode: On"),
          ),
        "patched interacted older task card",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_reply_newer_control_card") &&
              requestContainsCardText(request, "Plan Mode: On"),
          ),
        "patched persisted current task card",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("replies with new inspection snapshot cards for every More-menu query instead of patching the bound task card", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Inspection card task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId: string }> }
      ).threadTaskCards;
      const currentCard = taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`);
      assert.ok(currentCard?.messageId);

      const queryCases = [
        { option: "task", title: `Current Task Snapshot: ${task.title}` },
        { option: "tasks", title: `All Tasks Snapshot: ${task.title}` },
        { option: "health", title: `Bridge Health Snapshot: ${task.title}` },
        { option: "account", title: `Account Snapshot: ${task.title}` },
        { option: "limits", title: `Rate Limits Snapshot: ${task.title}` },
      ] as const;

      for (const queryCase of queryCases) {
        const previousReplyCount = harness.requests.filter(
          (request) =>
            request.method === "POST" &&
            request.url.includes("/open-apis/im/v1/messages/") &&
            requestContainsCardTitle(request, queryCase.title),
        ).length;
        const previousPatchCount = harness.requests.filter(
          (request) => request.method === "PATCH" && request.url.endsWith(`/open-apis/im/v1/messages/${currentCard?.messageId}`),
        ).length;

        const result = await harness.onCardAction({
          open_message_id: currentCard?.messageId,
          open_id: "ou_inspection_card",
          action: {
            tag: "overflow",
            option: queryCase.option,
            value: {
              kind: "task.inspect.global",
              chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
              threadKey: task.feishuBinding?.threadKey ?? "omt_inspection_task",
              rootMessageId: task.feishuBinding?.rootMessageId,
              taskId: task.taskId,
              revision: 1,
            },
          },
        });

        assert.ok(result);
        await waitFor(
          () =>
            harness.requests.filter(
              (request) =>
                request.method === "POST" &&
                request.url.includes("/open-apis/im/v1/messages/") &&
                requestContainsCardTitle(request, queryCase.title),
            ).length > previousReplyCount,
          `${queryCase.option} inspection snapshot reply`,
        );
        assert.equal(
          harness.requests.filter(
            (request) => request.method === "PATCH" && request.url.endsWith(`/open-apis/im/v1/messages/${currentCard?.messageId}`),
          ).length,
          previousPatchCount,
        );
      }

      assert.equal(taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`)?.messageId, currentCard?.messageId);
    } finally {
      await harness.cleanup();
    }
  });

  it("replies with a task-activity card when a Feishu message is queued behind an approval-blocked turn", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Queued activity task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      await harness.service.sendMessage(task.taskId, {
        content: "please run a shell command that needs approval",
        source: "feishu",
        replyToFeishu: true,
      });
      await waitFor(
        () => harness.service.getTask(task.taskId)?.status === "awaiting-approval",
        "awaiting approval status",
      );

      const previousActivityReplyCount = harness.requests.filter(
        (request) =>
          request.method === "POST" &&
          request.url.includes("/open-apis/im/v1/messages/") &&
          requestContainsCardTitle(request, `Task Activity: ${task.title}`),
      ).length;

      await harness.onMessage(
        {
          message_id: "om_busy_follow_up",
          thread_id: task.feishuBinding?.threadKey ?? "omt_busy_follow_up",
          root_id: task.feishuBinding?.rootMessageId ?? "om_root_busy_follow_up",
          chat_id: task.feishuBinding?.chatId ?? "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "follow up while approval is pending" }),
        },
        {
          sender_id: {
            open_id: "ou_busy_follow_up",
          },
        },
      );

      await waitFor(
        () => (harness.service.getTask(task.taskId)?.queuedMessageCount ?? 0) === 1,
        "queued feishu follow-up",
      );
      await waitFor(
        () =>
          harness.requests.filter(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task Activity: ${task.title}`),
          ).length > previousActivityReplyCount,
        "activity card reply",
      );
      assert.equal(
        harness.requests.some(
          (request) =>
            request.method === "POST" &&
            request.url.includes("/open-apis/im/v1/messages/") &&
            requestContainsCardTitle(request, `Task Activity: ${task.title}`) &&
            requestContainsCardText(request, "state: queued") &&
            requestContainsCardText(request, "Queued the latest Feishu message for the next turn.") &&
            requestContainsCardText(request, "Withdraw This Message") &&
            requestContainsCardText(request, "Run This Message Now"),
        ),
        true,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("can withdraw a queued Feishu message from its dedicated activity card", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Withdraw activity task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      await harness.service.sendMessage(task.taskId, {
        content: "please run a shell command that needs approval",
        source: "feishu",
        replyToFeishu: true,
      });
      await waitFor(
        () => harness.service.getTask(task.taskId)?.status === "awaiting-approval",
        "awaiting approval status",
      );

      await harness.onMessage(
        {
          message_id: "om_withdraw_follow_up",
          thread_id: task.feishuBinding?.threadKey ?? "omt_withdraw_follow_up",
          root_id: task.feishuBinding?.rootMessageId ?? "om_root_withdraw_follow_up",
          chat_id: task.feishuBinding?.chatId ?? "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "withdraw this queued follow-up" }),
        },
        {
          sender_id: {
            open_id: "ou_withdraw_follow_up",
          },
        },
      );

      await waitFor(
        () => harness.service.hasQueuedMessage(task.taskId, "om_withdraw_follow_up"),
        "queued message receipt",
      );

      const activityCards = (
        harness.feishu as unknown as {
          threadActivityCards: Map<string, { taskId: string; receiptId?: string; messageId: string }>;
        }
      ).threadActivityCards;
      const queuedActivityCard = [...activityCards.values()].find(
        (card) => card.taskId === task.taskId && card.receiptId === "om_withdraw_follow_up",
      );
      assert.ok(queuedActivityCard?.messageId);

      await harness.onCardAction({
        open_message_id: queuedActivityCard?.messageId,
        open_id: "ou_withdraw_card",
        action: {
          tag: "button",
          value: {
            kind: "task.withdraw-queued-message",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_withdraw_follow_up",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            queuedMessageId: "om_withdraw_follow_up",
            revision: 1,
          },
        },
      });

      await waitFor(
        () => harness.service.hasQueuedMessage(task.taskId, "om_withdraw_follow_up") === false,
        "queued message withdrawn",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${queuedActivityCard?.messageId}`) &&
              requestContainsCardText(request, "withdrawn before it ran"),
          ),
        "withdrawn activity card patch",
      );
      assert.equal(
        harness.requests.filter(
          (request) =>
            request.method === "PATCH" &&
            request.url.endsWith(`/open-apis/im/v1/messages/${queuedActivityCard?.messageId}`),
        ).length,
        1,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("opens a dedicated rename card and syncs renamed titles back into the bound task card", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Rename card task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId: string }> }
      ).threadTaskCards;
      const currentCard = taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`);
      assert.ok(currentCard?.messageId);

      const previousRenameReplyCount = harness.requests.filter(
        (request) =>
          request.method === "POST" &&
          request.url.includes("/open-apis/im/v1/messages/") &&
          requestContainsCardTitle(request, `Rename Task: ${task.title}`),
      ).length;

      const openRenameResult = await harness.onCardAction({
        open_message_id: currentCard?.messageId,
        open_id: "ou_rename_card",
        action: {
          tag: "button",
          value: {
            kind: "task.rename.open",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_rename_task",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 1,
          },
        },
      });

      assert.ok(openRenameResult);
      await waitFor(
        () =>
          harness.requests.filter(
            (request) =>
              request.method === "POST" &&
              request.url.includes("/open-apis/im/v1/messages/") &&
              requestContainsCardTitle(request, `Rename Task: ${task.title}`),
          ).length > previousRenameReplyCount,
        "rename card reply",
      );

      const submitRenameResult = await harness.onCardAction({
        open_message_id: "om_rename_card",
        open_id: "ou_rename_card",
        action: {
          tag: "button",
          form_value: {
            task_title_input: "Renamed from Feishu",
          },
          value: {
            kind: "task.rename.submit",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_rename_task",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 2,
          },
        },
      });

      assert.ok(submitRenameResult);
      assert.equal(JSON.stringify(submitRenameResult).includes("Rename Task:"), true);
      assert.equal(JSON.stringify(submitRenameResult).includes("Renaming the task now"), true);
      await waitFor(
        () => harness.service.getTask(task.taskId)?.title === "Renamed from Feishu",
        "renamed task title",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${currentCard?.messageId}`) &&
              requestContainsCardTitle(request, "Task: Renamed from Feishu"),
          ),
        "patched bound task card with renamed title",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith("/open-apis/im/v1/messages/om_rename_card") &&
              requestContainsCardTitle(request, "Rename Task: Renamed from Feishu") &&
              requestContainsCardText(request, "Task renamed to Renamed from Feishu."),
          ),
        "patched rename card confirmation",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("keeps rename confirmation on the dedicated reply when submit omits open_message_id", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Rename mobile task",
      });

      await harness.feishu.bindTaskToNewTopic(task.taskId);

      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              requestContainsCardTitle(request, `Task: ${task.title}`),
          ),
        "initial bound task card before mobile rename",
      );

      const taskCards = (
        harness.feishu as unknown as { threadTaskCards: Map<string, { messageId: string }> }
      ).threadTaskCards;
      const currentCard = taskCards.get(`${task.feishuBinding?.chatId}:${task.feishuBinding?.threadKey}`);
      assert.ok(currentCard?.messageId);

      const openRenameResult = await harness.onCardAction({
        open_message_id: currentCard?.messageId,
        open_id: "ou_rename_mobile",
        action: {
          tag: "button",
          value: {
            kind: "task.rename.open",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_rename_mobile",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 1,
          },
        },
      });

      assert.ok(openRenameResult);
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "POST" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${task.feishuBinding?.rootMessageId}/reply`) &&
              requestContainsCardTitle(request, `Rename Task: ${task.title}`),
          ),
        "rename reply card for mobile submit",
      );

      const renameReply = harness.requests.find(
        (request) =>
          request.method === "POST" &&
          request.url.endsWith(`/open-apis/im/v1/messages/${task.feishuBinding?.rootMessageId}/reply`) &&
          requestContainsCardTitle(request, `Rename Task: ${task.title}`),
      );
      assert.ok(renameReply?.responseMessageId);

      const submitRenameResult = await harness.onCardAction({
        open_id: "ou_rename_mobile",
        action: {
          tag: "button",
          form_value: {
            task_title_input: "Renamed from mobile submit",
          },
          value: {
            kind: "task.rename.submit",
            chatId: task.feishuBinding?.chatId ?? "oc_chat_id",
            threadKey: task.feishuBinding?.threadKey ?? "omt_rename_mobile",
            rootMessageId: task.feishuBinding?.rootMessageId,
            taskId: task.taskId,
            revision: 2,
          },
        },
      });

      assert.ok(submitRenameResult);
      assert.equal(JSON.stringify(submitRenameResult).includes("Rename Task:"), true);
      assert.equal(JSON.stringify(submitRenameResult).includes("Renaming the task now"), true);
      await waitFor(
        () => harness.service.getTask(task.taskId)?.title === "Renamed from mobile submit",
        "renamed task title from mobile submit",
      );
      await waitFor(
        () =>
          harness.requests.some(
            (request) =>
              request.method === "PATCH" &&
              request.url.endsWith(`/open-apis/im/v1/messages/${renameReply.responseMessageId}`) &&
              requestContainsCardTitle(request, "Rename Task: Renamed from mobile submit") &&
              requestContainsCardText(request, "Task renamed to Renamed from mobile submit."),
          ),
        "patched rename reply confirmation for mobile submit",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("supports slash bind, status, unbind, and approve commands without implicit root-thread creation", async () => {
    const harness = await createHarness();
    const originalRespondToRequest = harness.runtime.respondToRequest.bind(harness.runtime);
    const approvalDecisions: Array<{ requestId: number | string; result: unknown }> = [];
    harness.runtime.respondToRequest = async (requestId, result) => {
      approvalDecisions.push({ requestId, result });
      await originalRespondToRequest(requestId, result);
    };

    try {
      const task = await harness.service.createTask({
        title: "Bound task",
        prompt: "Please edit the file and patch it.",
      });

      await waitFor(
        () => (harness.service.getTask(task.taskId)?.pendingApprovals.length ?? 0) > 0,
        "pending approval",
      );
      assert.equal(
        harness.calls.some((entry) => entry.includes("/open-apis/im/v1/messages?receive_id_type=chat_id")),
        false,
      );

      await harness.onMessage(
        {
          message_id: "om_bind",
          thread_id: "omt_bind",
          root_id: "om_root_bind",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: `/bind ${task.taskId}` }),
        },
        {
          sender_id: {
            open_id: "ou_bind",
          },
        },
      );

      await waitFor(
        () => harness.service.getTask(task.taskId)?.feishuBinding?.threadKey === "omt_bind",
        "manual bind",
      );

      await harness.onMessage(
        {
          message_id: "om_status",
          thread_id: "omt_bind",
          root_id: "om_root_bind",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/status" }),
        },
        {
          sender_id: {
            open_id: "ou_bind",
          },
        },
      );
      await waitFor(
        () =>
          harness.requests.some((request) =>
            parseMessageText(request).includes(`taskId: ${task.taskId}`) &&
            parseMessageText(request).includes("Thread status: bound"),
          ),
        "status reply",
      );

      await harness.onMessage(
        {
          message_id: "om_approve",
          thread_id: "omt_bind",
          root_id: "om_root_bind",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/approve" }),
        },
        {
          sender_id: {
            open_id: "ou_bind",
          },
        },
      );

      await waitFor(() => approvalDecisions.length > 0, "approval decision");
      assert.deepEqual(approvalDecisions[0]?.result, { decision: "accept" });
      await delay(50);
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("Approval resolved for")),
        false,
      );
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("approve applied to approval")),
        false,
      );

      await harness.onMessage(
        {
          message_id: "om_unbind",
          thread_id: "omt_bind",
          root_id: "om_root_bind",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/unbind" }),
        },
        {
          sender_id: {
            open_id: "ou_bind",
          },
        },
      );

      await waitFor(() => !harness.service.getTask(task.taskId)?.feishuBinding, "unbind");
      const beforeConversationLength = harness.service.getTask(task.taskId)?.conversation.length ?? 0;
      await harness.onMessage(
        {
          message_id: "om_after_unbind",
          thread_id: "omt_bind",
          root_id: "om_root_bind",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "plain text after unbind" }),
        },
        {
          sender_id: {
            open_id: "ou_bind",
          },
        },
      );
      await delay(50);
      assert.equal(harness.service.getTask(task.taskId)?.conversation.length ?? 0, beforeConversationLength);
    } finally {
      await harness.cleanup();
    }
  });

  it("allows /bind to explicitly move an already-bound task onto the current Feishu thread", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Move me",
        prompt: "Start here",
      });

      await harness.onMessage(
        {
          message_id: "om_bind_first",
          thread_id: "omt_bind_first",
          root_id: "om_root_bind_first",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: `/bind ${task.taskId}` }),
        },
        {
          sender_id: {
            open_id: "ou_bind_first",
          },
        },
      );

      await waitFor(
        () => harness.service.getTask(task.taskId)?.feishuBinding?.threadKey === "omt_bind_first",
        "first slash bind",
      );

      await harness.onMessage(
        {
          message_id: "om_bind_second",
          thread_id: "omt_bind_second",
          root_id: "om_root_bind_second",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: `/bind ${task.taskId}` }),
        },
        {
          sender_id: {
            open_id: "ou_bind_second",
          },
        },
      );

      await waitFor(
        () => harness.service.getTask(task.taskId)?.feishuBinding?.threadKey === "omt_bind_second",
        "rebound slash bind",
      );
      assert.deepEqual(harness.service.getTask(task.taskId)?.feishuBinding, {
        chatId: "oc_chat_id",
        threadKey: "omt_bind_second",
        rootMessageId: "om_root_bind_second",
      });
      assert.equal(
        harness.requests.some((request) => parseMessageText(request).includes("already bound to a different Feishu thread")),
        false,
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("archives a bound topic from the task card and blocks future messages in the same thread", async () => {
    const harness = await createHarness();

    try {
      const task = await harness.service.createTask({
        title: "Archive me",
        prompt: "Start archive flow",
      });

      await harness.onMessage(
        {
          message_id: "om_archive_bind",
          thread_id: "omt_archive",
          root_id: "om_root_archive",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: `/bind ${task.taskId}` }),
        },
        {
          sender_id: {
            open_id: "ou_archive",
          },
        },
      );

      await waitFor(
        () => harness.service.getTask(task.taskId)?.feishuBinding?.threadKey === "omt_archive",
        "archive bind",
      );

      const archivedCard = await harness.onCardAction({
        open_message_id: "om_card_archive",
        open_id: "ou_archive",
        action: {
          tag: "button",
          value: {
            kind: "task.archive",
            chatId: "oc_chat_id",
            threadKey: "omt_archive",
            rootMessageId: "om_root_archive",
            taskId: task.taskId,
            revision: 2,
          },
        },
      });

      assert.ok(archivedCard);
      assert.match(JSON.stringify(archivedCard), /Archived Codex Topic/);
      await waitFor(() => !harness.service.getTask(task.taskId)?.feishuBinding, "task unbound after archive");

      const archivedThreads = (
        harness.feishu as unknown as { archivedThreads: Map<string, { taskId?: string }> }
      ).archivedThreads;
      assert.equal(archivedThreads.get("oc_chat_id:omt_archive")?.taskId, task.taskId);

      const previousConversationLength = harness.service.getTask(task.taskId)?.conversation.length ?? 0;
      await harness.onMessage(
        {
          message_id: "om_archive_after",
          thread_id: "omt_archive",
          root_id: "om_root_archive",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "please keep working" }),
        },
        {
          sender_id: {
            open_id: "ou_archive",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => parseMessageText(request).includes("This Feishu topic is archived")),
        "archived-thread reply",
      );
      await delay(50);
      assert.equal(harness.service.getTask(task.taskId)?.conversation.length ?? 0, previousConversationLength);
    } finally {
      await harness.cleanup();
    }
  });

  it("supports global slash commands without treating them as normal prompts", async () => {
    const harness = await createHarness();

    try {
      await harness.onMessage(
        {
          message_id: "om_help",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/help" }),
        },
        {
          sender_id: {
            open_id: "ou_global",
          },
        },
      );

      await harness.onMessage(
        {
          message_id: "om_health",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/health" }),
        },
        {
          sender_id: {
            open_id: "ou_global",
          },
        },
      );

      await harness.onMessage(
        {
          message_id: "om_unknown",
          chat_id: "oc_chat_id",
          message_type: "text",
          content: JSON.stringify({ text: "/unknown" }),
        },
        {
          sender_id: {
            open_id: "ou_global",
          },
        },
      );

      await waitFor(
        () => harness.requests.some((request) => parseMessageText(request).includes("Feishu bridge commands:")),
        "help reply",
      );
      await waitFor(
        () => harness.requests.some((request) => parseMessageText(request).includes("status: ok")),
        "health reply",
      );
      assert.equal(harness.service.listTasks().length, 0);
    } finally {
      await harness.cleanup();
    }
  });
});
