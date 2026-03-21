import type {
  ApprovalPolicy,
  BridgeTask,
  FeishuRunningMessageMode,
  FeishuThreadBinding,
  QueuedApproval,
  ReasoningEffort,
  SandboxMode,
  TaskExecutionProfile,
} from "@codex-feishu-bridge/protocol";
import type { FeishuUiLanguage } from "@codex-feishu-bridge/shared";
import { createFeishuTranslator } from "../i18n";

const DEFAULT_NEW_SANDBOX: SandboxMode = "workspace-write";
const DEFAULT_NEW_APPROVAL_POLICY: ApprovalPolicy = "on-request";
const CARD_NOTE_MAX_CHARS = 1400;

export interface FeishuInteractiveCard {
  config?: {
    enable_forward?: boolean;
    update_multi?: boolean;
    wide_screen_mode?: boolean;
  };
  header?: {
    title: {
      tag: "plain_text";
      content: string;
    };
    template?: "blue" | "wathet" | "turquoise" | "green" | "yellow" | "orange" | "red" | "carmine" | "violet" | "purple" | "indigo" | "grey";
  };
  elements?: Array<Record<string, unknown>>;
}

export interface FeishuModelOption {
  id: string;
  displayName: string;
  isDefault: boolean;
  supportedReasoningEfforts: ReasoningEffort[];
  defaultReasoningEffort: ReasoningEffort;
}

export interface FeishuThreadDraftCardData {
  prompt?: string;
  model?: string;
  effort?: ReasoningEffort;
  planMode: boolean;
  sandbox: SandboxMode;
  approvalPolicy: ApprovalPolicy;
  attachmentSummary?: string;
  note?: string;
  binding: FeishuThreadBinding;
  revision: number;
  modelOptions: FeishuModelOption[];
}

export interface FeishuTaskControlCardData {
  task: BridgeTask;
  note?: string;
  binding: FeishuThreadBinding;
  revision: number;
  modelOptions: FeishuModelOption[];
}

export interface FeishuTaskActivityCardData {
  task: BridgeTask;
  note?: string;
  binding: FeishuThreadBinding;
  revision: number;
  runtimeConnected: boolean;
  runtimeInitialized: boolean;
  receiptState: "queued" | "started" | "steered" | "withdrawn" | "failed";
  queuedMessageId?: string;
  canWithdrawMessage: boolean;
  canForceTurn: boolean;
}

export interface FeishuTaskStatusSnapshotCardData {
  task: BridgeTask;
  note?: string;
}

export interface FeishuTaskRenameCardData {
  task: BridgeTask;
  binding: FeishuThreadBinding;
  revision: number;
  note?: string;
}

export interface FeishuTaskInspectionSnapshotCardData {
  task: BridgeTask;
  queryLabel: string;
  note?: string;
}

export interface FeishuArchivedThreadCardData {
  binding: FeishuThreadBinding;
  taskId?: string;
  taskTitle?: string;
  archivedAt?: string;
  note?: string;
}

export type FeishuCardActionKind =
  | "test.ping"
  | "draft.select.model"
  | "draft.select.effort"
  | "draft.toggle.plan-mode"
  | "draft.select.sandbox"
  | "draft.select.approval"
  | "draft.use-defaults"
  | "draft.create"
  | "draft.cancel"
  | "task.select.model"
  | "task.select.effort"
  | "task.toggle.plan-mode"
  | "task.toggle.feishu-running-mode"
  | "task.force-turn"
  | "task.withdraw-queued-message"
  | "task.rename.open"
  | "task.rename.submit"
  | "task.status"
  | "task.interrupt"
  | "task.retry"
  | "task.approve"
  | "task.decline"
  | "task.cancel-approval"
  | "task.archive"
  | "task.unbind"
  | "task.inspect"
  | "task.inspect.global";

export interface FeishuCardActionValue {
  kind: FeishuCardActionKind;
  chatId: string;
  threadKey: string;
  rootMessageId?: string;
  taskId?: string;
  requestId?: string;
  queuedMessageId?: string;
  revision?: string | number;
}

type FeishuCardActionValueExtras = Partial<Omit<FeishuCardActionValue, "kind" | "chatId" | "threadKey" | "rootMessageId">> & {
  revision?: number | string;
};

interface FeishuCardRenderOptions {
  locale?: FeishuUiLanguage;
}

function plainText(content: string): { tag: "plain_text"; content: string } {
  return {
    tag: "plain_text",
    content,
  };
}

function markdown(content: string): Record<string, unknown> {
  return {
    tag: "markdown",
    content,
  };
}

function divider(): Record<string, unknown> {
  return {
    tag: "hr",
  };
}

function action(actions: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    tag: "action",
    actions,
  };
}

function form(elements: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    tag: "form",
    elements,
  };
}

function button(params: {
  text: string;
  value: FeishuCardActionValue;
  type?: "default" | "primary" | "danger";
}): Record<string, unknown> {
  return {
    tag: "button",
    type: params.type ?? "default",
    text: plainText(params.text),
    value: params.value,
  };
}

function formSubmitButton(params: {
  text: string;
  value: FeishuCardActionValue;
  type?: "default" | "primary" | "danger";
}): Record<string, unknown> {
  return {
    tag: "button",
    type: params.type ?? "primary",
    text: plainText(params.text),
    action_type: "form_submit",
    behaviors: [
      {
        type: "callback",
        value: params.value,
      },
    ],
  };
}

function inputField(params: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
}): Record<string, unknown> {
  return {
    tag: "input",
    name: params.name,
    label: plainText(params.label),
    placeholder: plainText(params.placeholder),
    ...(params.defaultValue !== undefined ? { default_value: params.defaultValue } : {}),
  };
}

function selectStatic(params: {
  placeholder: string;
  initialOption?: string;
  options: Array<{ label: string; value: string }>;
  value: FeishuCardActionValue;
}): Record<string, unknown> {
  const serializedOptions = params.options.map((option) => ({
    text: plainText(option.label),
    value: option.value,
  }));

  return {
    tag: "select_static",
    placeholder: plainText(params.placeholder),
    ...(params.initialOption !== undefined ? { initial_option: params.initialOption } : {}),
    // Some Feishu clients and SDK references disagree on whether the field is
    // `option` or `options`. Emit both so mobile clients always receive the
    // candidate list.
    option: serializedOptions,
    options: serializedOptions,
    value: params.value,
  };
}

function overflow(params: {
  text: string;
  options: Array<{ label: string; value: string }>;
  value: FeishuCardActionValue;
}): Record<string, unknown> {
  return {
    tag: "overflow",
    text: plainText(params.text),
    options: params.options.map((option) => ({
      text: plainText(option.label),
      value: option.value,
    })),
    value: params.value,
  };
}

function truncateNote(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length <= CARD_NOTE_MAX_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, CARD_NOTE_MAX_CHARS - 16)}\n\n[truncated]`;
}

function titleCaseLabel(value: string): string {
  if (!value) {
    return value;
  }

  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatExecutionProfile(
  profile: TaskExecutionProfile | undefined,
  locale: FeishuUiLanguage,
): string[] {
  const t = createFeishuTranslator(locale);
  return [
    `${t("feishu.labels.model")}: ${profile?.model ?? t("feishu.values.runtimeDefault")}`,
    `${t("feishu.labels.effort")}: ${profile?.effort ?? t("feishu.values.modelDefault")}`,
    `${t("feishu.labels.planMode")}: ${profile?.planMode ? t("feishu.values.on") : t("feishu.values.off")}`,
    `${t("feishu.labels.sandbox")}: ${profile?.sandbox ?? DEFAULT_NEW_SANDBOX}`,
    `${t("feishu.labels.approvalPolicy")}: ${profile?.approvalPolicy ?? DEFAULT_NEW_APPROVAL_POLICY}`,
  ];
}

function resolveOptionLabel(
  options: Array<{ label: string; value: string }>,
  value: string | undefined,
  fallbackLabel: string,
): string {
  if (value === undefined) {
    return fallbackLabel;
  }

  return options.find((option) => option.value === value)?.label ?? value;
}

function formatFeishuRunningMessageMode(mode: FeishuRunningMessageMode, locale: FeishuUiLanguage): string {
  const t = createFeishuTranslator(locale);
  return mode === "queue" ? t("feishu.values.queueNextTurn") : t("feishu.values.steerCurrentTurn");
}

function formatTaskActivityReceiptState(
  state: FeishuTaskActivityCardData["receiptState"],
  locale: FeishuUiLanguage,
): string {
  const t = createFeishuTranslator(locale);
  switch (state) {
    case "queued":
      return t("feishu.receipts.queued");
    case "started":
      return t("feishu.receipts.started");
    case "steered":
      return t("feishu.receipts.steered");
    case "withdrawn":
      return t("feishu.receipts.withdrawn");
    case "failed":
      return t("feishu.receipts.failed");
    default:
      return state;
  }
}

function formatTaskActivityState(
  task: BridgeTask,
  runtimeConnected: boolean,
  runtimeInitialized: boolean,
  locale: FeishuUiLanguage,
): {
  label: string;
  detail: string;
  template: NonNullable<FeishuInteractiveCard["header"]>["template"];
} {
  const t = createFeishuTranslator(locale);
  if (!runtimeConnected || !runtimeInitialized) {
    return {
      label: t("feishu.activityState.offline.label"),
      detail: t("feishu.activityState.offline.detail"),
      template: "grey",
    };
  }

  if (task.status === "failed") {
    return {
      label: t("feishu.activityState.failed.label"),
      detail: t("feishu.activityState.failed.detail"),
      template: "red",
    };
  }

  if (task.queuedMessageCount > 0) {
    return {
      label: t("feishu.activityState.queued.label"),
      detail:
        task.status === "awaiting-approval"
          ? t("feishu.activityState.queued.awaitingApproval")
          : task.status === "blocked"
            ? t("feishu.activityState.queued.blocked")
            : task.status === "running"
              ? t("feishu.activityState.queued.running")
              : t("feishu.activityState.queued.idle"),
      template: "orange",
    };
  }

  if (task.status === "awaiting-approval") {
    return {
      label: t("feishu.activityState.waitingApproval.label"),
      detail: t("feishu.activityState.waitingApproval.detail"),
      template: "yellow",
    };
  }

  if (task.status === "blocked") {
    return {
      label: t("feishu.activityState.blocked.label"),
      detail: t("feishu.activityState.blocked.detail"),
      template: "orange",
    };
  }

  if (task.status === "running") {
    return {
      label: t("feishu.activityState.running.label"),
      detail: t("feishu.activityState.running.detail"),
      template: "turquoise",
    };
  }

  if (task.status === "completed" || task.status === "interrupted" || task.status === "idle") {
    return {
      label: t("feishu.activityState.idle.label"),
      detail: t("feishu.activityState.idle.detail"),
      template: "green",
    };
  }

  return {
    label: task.status,
    detail: t("feishu.activityState.fallback.detail", { status: task.status }),
    template: "blue",
  };
}

function taskStartGuidance(task: BridgeTask, locale: FeishuUiLanguage): string[] {
  const t = createFeishuTranslator(locale);
  if (task.conversation.length > 0) {
    return [];
  }

  return [
    `**${t("feishu.sections.nextStep")}**`,
    t("feishu.taskStartGuidance.created"),
    t("feishu.taskStartGuidance.firstMessage"),
    t("feishu.taskStartGuidance.createOnHost"),
  ];
}

function baseActionValue(
  kind: FeishuCardActionKind,
  binding: FeishuThreadBinding,
  extras: FeishuCardActionValueExtras = {},
): FeishuCardActionValue {
  const { revision, ...rest } = extras;
  return {
    kind,
    chatId: binding.chatId,
    threadKey: binding.threadKey,
    ...(binding.rootMessageId ? { rootMessageId: binding.rootMessageId } : {}),
    ...rest,
    ...(revision !== undefined ? { revision: String(revision) } : {}),
  };
}

function buildApprovalActionRows(
  task: BridgeTask,
  binding: FeishuThreadBinding,
  revision: number,
  locale: FeishuUiLanguage,
): Array<Record<string, unknown>> {
  const t = createFeishuTranslator(locale);
  return task.pendingApprovals
    .filter((approval) => approval.state === "pending")
    .flatMap((approval) => {
      const value = {
        taskId: task.taskId,
        requestId: approval.requestId,
        revision,
      };

      return [
        markdown(
          [
            `**${t("feishu.sections.pendingApproval")}**`,
            `requestId: ${approval.requestId}`,
            `${t("feishu.labels.kind")}: ${approval.kind}`,
            `${t("feishu.labels.reason")}: ${approval.reason}`,
          ].join("\n"),
        ),
        action([
          button({
            text: t("feishu.taskApproval.approve"),
            type: "primary",
            value: baseActionValue("task.approve", binding, { ...value }),
          }),
          button({
            text: t("feishu.taskApproval.decline"),
            type: "danger",
            value: baseActionValue("task.decline", binding, { ...value }),
          }),
          button({
            text: t("feishu.taskApproval.cancel"),
            value: baseActionValue("task.cancel-approval", binding, { ...value }),
          }),
        ]),
      ];
    });
}

export function createCardActionValue(
  kind: FeishuCardActionKind,
  binding: FeishuThreadBinding,
  extras?: FeishuCardActionValueExtras,
): FeishuCardActionValue {
  return baseActionValue(kind, binding, extras);
}

export function createCardTestCard(note?: string, options: FeishuCardRenderOptions = {}): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const normalizedNote = truncateNote(note);
  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.cardTest.title")),
      template: "blue",
    },
    elements: [
      markdown(t("feishu.cardTest.description")),
      ...(normalizedNote ? [divider(), markdown(`**${t("feishu.cardTest.result")}**\n${normalizedNote}`)] : []),
    ],
  };
}

export function createDraftCard(
  data: FeishuThreadDraftCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const selectedEffort = data.effort;
  const selectedModel = data.model;
  const modelOptions = data.modelOptions.map((model) => ({
    label: model.isDefault ? `${model.id} (default)` : `${model.id} (${model.displayName})`,
    value: model.id,
  }));
  const modelDescriptor = data.modelOptions.find((entry) => entry.id === selectedModel);
  const effortOptions = (modelDescriptor?.supportedReasoningEfforts ?? ["none", "minimal", "low", "medium", "high", "xhigh"]).map(
    (effort) => ({
      label: modelDescriptor?.defaultReasoningEffort === effort ? `${effort} (default)` : effort,
      value: effort,
    }),
  );

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.draft.title")),
      template: "blue",
    },
    elements: [
      markdown(t("feishu.draft.intro")),
      divider(),
      markdown(`**${t("feishu.sections.prompt")}**\n${data.prompt?.trim() ? data.prompt : t("feishu.draft.promptPlaceholder")}`),
      markdown(
        [
          `**${t("feishu.sections.settings")}**`,
          ...formatExecutionProfile({
            model: data.model,
            effort: data.effort,
            planMode: data.planMode,
            sandbox: data.sandbox,
            approvalPolicy: data.approvalPolicy,
          }, locale),
          `${t("feishu.labels.attachments")}: ${data.attachmentSummary ?? t("feishu.values.none")}`,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.update")}**\n${note}`)] : []),
      divider(),
      ...(modelOptions.length
        ? [
            action([
              selectStatic({
                placeholder: t("feishu.draft.chooseModel"),
                initialOption: selectedModel,
                options: modelOptions,
                value: baseActionValue("draft.select.model", data.binding, {
                  revision: data.revision,
                }),
              }),
              selectStatic({
                placeholder: t("feishu.draft.chooseReasoning"),
                initialOption: selectedEffort,
                options: effortOptions,
                value: baseActionValue("draft.select.effort", data.binding, {
                  revision: data.revision,
                }),
              }),
            ]),
          ]
        : []),
      action([
        selectStatic({
          placeholder: t("feishu.draft.chooseSandbox"),
          initialOption: data.sandbox,
          options: [
            { label: "read-only", value: "read-only" },
            { label: "workspace-write", value: "workspace-write" },
            { label: "danger-full-access", value: "danger-full-access" },
          ],
          value: baseActionValue("draft.select.sandbox", data.binding, {
            revision: data.revision,
          }),
        }),
        selectStatic({
          placeholder: t("feishu.draft.chooseApproval"),
          initialOption: data.approvalPolicy,
          options: [
            { label: "untrusted", value: "untrusted" },
            { label: "on-failure", value: "on-failure" },
            { label: "on-request", value: "on-request" },
            { label: "never", value: "never" },
          ],
          value: baseActionValue("draft.select.approval", data.binding, {
            revision: data.revision,
          }),
        }),
      ]),
      action([
        button({
          text: data.planMode ? t("feishu.draft.planMode.on") : t("feishu.draft.planMode.off"),
          value: baseActionValue("draft.toggle.plan-mode", data.binding, {
            revision: data.revision,
          }),
          type: data.planMode ? "primary" : "default",
        }),
      ]),
      action([
        button({
          text: t("feishu.draft.resetDefaults"),
          value: baseActionValue("draft.use-defaults", data.binding, {
            revision: data.revision,
          }),
        }),
        button({
          text: t("feishu.draft.createOnHost"),
          type: "primary",
          value: baseActionValue("draft.create", data.binding, {
            revision: data.revision,
          }),
        }),
        button({
          text: t("feishu.draft.discard"),
          type: "danger",
          value: baseActionValue("draft.cancel", data.binding, {
            revision: data.revision,
          }),
        }),
      ]),
    ],
  };
}

export function createTaskControlCard(
  data: FeishuTaskControlCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const { task, binding, revision } = data;
  const selectedModel = task.executionProfile.model;
  const selectedEffort = task.executionProfile.effort;
  const modelDescriptor = data.modelOptions.find((entry) => entry.id === selectedModel);
  const modelOptions = [
    { label: "runtime-default", value: "" },
    ...data.modelOptions.map((model) => ({
      label: model.isDefault ? `${model.id} (default)` : `${model.id} (${model.displayName})`,
      value: model.id,
    })),
  ];
  const effortOptions = [
    { label: "model-default", value: "" },
    ...((modelDescriptor?.supportedReasoningEfforts ?? ["none", "minimal", "low", "medium", "high", "xhigh"]).map((effort) => ({
      label: modelDescriptor?.defaultReasoningEffort === effort ? `${effort} (default)` : effort,
      value: effort,
    }))),
  ];
  const currentModelLabel = resolveOptionLabel(modelOptions, selectedModel ?? "", t("feishu.values.runtimeDefault"));
  const currentEffortLabel = resolveOptionLabel(effortOptions, selectedEffort ?? "", t("feishu.values.modelDefault"));

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.taskControl.title", { title: task.title })),
      template: task.status === "failed" ? "red" : task.status === "awaiting-approval" ? "yellow" : "green",
    },
    elements: [
      markdown(t("feishu.taskControl.intro")),
      divider(),
      ...(task.conversation.length === 0
        ? [
            markdown(taskStartGuidance(task, locale).join("\n")),
            divider(),
          ]
        : []),
      markdown(
        [
          `**${t("feishu.sections.task")}**`,
          `${t("feishu.labels.taskId")}: ${task.taskId}`,
          `${t("feishu.labels.status")}: ${task.status}`,
          ...formatExecutionProfile(task.executionProfile, locale),
          `${t("feishu.labels.busyFeishuReplies")}: ${formatFeishuRunningMessageMode(task.feishuRunningMessageMode, locale)}`,
          `${t("feishu.labels.queuedNextTurnMessages")}: ${task.queuedMessageCount}`,
          `${t("feishu.labels.attachments")}: ${task.assets.length}`,
          `${t("feishu.labels.messages")}: ${task.conversation.length}`,
          `${t("feishu.labels.pendingApprovals")}: ${task.pendingApprovals.filter((approval) => approval.state === "pending").length}`,
        ].join("\n"),
      ),
      divider(),
      markdown(
        [
          `**${t("feishu.sections.runSettings")}**`,
          `${t("feishu.labels.model")}: ${currentModelLabel}`,
          `${t("feishu.labels.reasoning")}: ${currentEffortLabel}`,
          `${t("feishu.labels.planMode")}: ${task.executionProfile.planMode ? t("feishu.values.on") : t("feishu.values.off")}`,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.update")}**\n${note}`)] : []),
      divider(),
      action([
        selectStatic({
          placeholder: `${titleCaseLabel(t("feishu.labels.model"))}: ${currentModelLabel}`,
          initialOption: selectedModel,
          options: modelOptions,
          value: baseActionValue("task.select.model", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
        selectStatic({
          placeholder: `${titleCaseLabel(t("feishu.labels.reasoning"))}: ${currentEffortLabel}`,
          initialOption: selectedEffort,
          options: effortOptions,
          value: baseActionValue("task.select.effort", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
      ]),
      action([
        button({
          text: task.executionProfile.planMode ? t("feishu.draft.planMode.on") : t("feishu.draft.planMode.off"),
          type: task.executionProfile.planMode ? "primary" : "default",
          value: baseActionValue("task.toggle.plan-mode", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
      ]),
      ...buildApprovalActionRows(task, binding, revision, locale),
      divider(),
      action([
        button({
          text: t("feishu.taskControl.viewStatus"),
          value: baseActionValue("task.status", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
        button({
          text: t("feishu.taskControl.stopTurn"),
          type: "danger",
          value: baseActionValue("task.interrupt", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
        button({
          text: t("feishu.taskControl.retryLastTurn"),
          type: "primary",
          value: baseActionValue("task.retry", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
      ]),
      divider(),
      action([
        button({
          text: t("feishu.taskControl.renameTask"),
          value: baseActionValue("task.rename.open", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
        button({
          text: t("feishu.taskControl.unbindThread"),
          value: baseActionValue("task.unbind", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
        button({
          text: t("feishu.taskControl.archiveTask"),
          type: "danger",
          value: baseActionValue("task.archive", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
      ]),
      divider(),
      action([
        overflow({
          text: t("feishu.taskControl.more"),
          options: [
            { label: t("feishu.taskControl.more.currentTask"), value: "task" },
            { label: t("feishu.taskControl.more.allTasks"), value: "tasks" },
            { label: t("feishu.taskControl.more.health"), value: "health" },
            { label: t("feishu.taskControl.more.account"), value: "account" },
            { label: t("feishu.taskControl.more.limits"), value: "limits" },
          ],
          value: baseActionValue("task.inspect.global", binding, {
            taskId: task.taskId,
            revision,
          }),
        }),
      ]),
    ],
  };
}

export function createTaskRenameCard(
  data: FeishuTaskRenameCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const { task, binding, revision } = data;

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.rename.title", { title: task.title })),
      template: "blue",
    },
    elements: [
      markdown(t("feishu.rename.intro")),
      divider(),
      markdown(
        [
          `**${t("feishu.sections.currentTitle")}**`,
          task.title,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.update")}**\n${note}`)] : []),
      divider(),
      form([
        inputField({
          name: "task_title_input",
          label: t("feishu.sections.newTitle"),
          placeholder: t("feishu.rename.placeholder"),
          defaultValue: task.title,
        }),
        action([
          formSubmitButton({
            text: t("feishu.rename.apply"),
            type: "primary",
            value: baseActionValue("task.rename.submit", binding, {
              taskId: task.taskId,
              revision,
            }),
          }),
        ]),
      ]),
    ],
  };
}

export function createTaskActivityCard(
  data: FeishuTaskActivityCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const {
    task,
    binding,
    revision,
    runtimeConnected,
    runtimeInitialized,
    receiptState,
    queuedMessageId,
    canWithdrawMessage,
    canForceTurn,
  } = data;
  const activityState = formatTaskActivityState(task, runtimeConnected, runtimeInitialized, locale);

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.activity.title", { title: task.title })),
      template: activityState.template,
    },
    elements: [
      markdown(
        [
          `**${t("feishu.sections.receipt")}**`,
          `${t("feishu.sections.receipt").toLowerCase()}: ${formatTaskActivityReceiptState(receiptState, locale)}`,
          queuedMessageId ? `queued message id: ${queuedMessageId}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      divider(),
      markdown(
        [
          `**${t("feishu.sections.status")}**`,
          `${t("feishu.labels.state")}: ${activityState.label}`,
          `${t("feishu.labels.detail")}: ${activityState.detail}`,
          `${t("feishu.labels.status")}: ${task.status}`,
          `${t("feishu.labels.queuedNextTurnMessages")}: ${task.queuedMessageCount}`,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.update")}**\n${note}`)] : []),
      ...(canWithdrawMessage || canForceTurn
        ? [
            divider(),
            action(
              [
                canWithdrawMessage
                  ? button({
                      text: t("feishu.activity.withdraw"),
                      type: "danger",
                      value: baseActionValue("task.withdraw-queued-message", binding, {
                        taskId: task.taskId,
                        queuedMessageId,
                        revision,
                      }),
                    })
                  : null,
                canForceTurn
                  ? button({
                      text:
                        task.activeTurnId
                          ? t("feishu.activity.interruptRunNow")
                          : t("feishu.activity.runNow"),
                      type: "primary",
                      value: baseActionValue("task.force-turn", binding, {
                        taskId: task.taskId,
                        queuedMessageId,
                        revision,
                      }),
                    })
                  : null,
              ].filter(Boolean) as Array<Record<string, unknown>>,
            ),
          ]
        : []),
    ],
  };
}

export function createTaskStatusSnapshotCard(
  data: FeishuTaskStatusSnapshotCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const { task } = data;

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.statusSnapshot.title", { title: task.title })),
      template: task.status === "failed" ? "red" : task.status === "awaiting-approval" ? "yellow" : "green",
    },
    elements: [
      markdown(
        [
          `**${t("feishu.sections.currentTask")}**`,
          `${t("feishu.labels.taskId")}: ${task.taskId}`,
          `${t("feishu.labels.status")}: ${task.status}`,
          ...formatExecutionProfile(task.executionProfile, locale),
          `${t("feishu.labels.busyFeishuReplies")}: ${formatFeishuRunningMessageMode(task.feishuRunningMessageMode, locale)}`,
          `${t("feishu.labels.queuedNextTurnMessages")}: ${task.queuedMessageCount}`,
          `${t("feishu.labels.attachments")}: ${task.assets.length}`,
          `${t("feishu.labels.messages")}: ${task.conversation.length}`,
          `${t("feishu.labels.pendingApprovals")}: ${task.pendingApprovals.filter((approval) => approval.state === "pending").length}`,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.details")}**\n${note}`)] : []),
      divider(),
      markdown(t("feishu.statusSnapshot.footer")),
    ],
  };
}

export function createTaskInspectionSnapshotCard(
  data: FeishuTaskInspectionSnapshotCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);
  const { task, queryLabel } = data;

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.inspection.title", { queryLabel, title: task.title })),
      template: "blue",
    },
    elements: [
      markdown(
        [
          `**${t("feishu.sections.snapshotQuery")}**`,
          `${t("feishu.labels.query")}: ${queryLabel}`,
          `${t("feishu.labels.taskId")}: ${task.taskId}`,
          `${t("feishu.labels.status")}: ${task.status}`,
        ].join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.details")}**\n${note}`)] : []),
      divider(),
      markdown(t("feishu.inspection.footer")),
    ],
  };
}

export function createArchivedThreadCard(
  data: FeishuArchivedThreadCardData,
  options: FeishuCardRenderOptions = {},
): FeishuInteractiveCard {
  const locale = options.locale ?? "en-US";
  const t = createFeishuTranslator(locale);
  const note = truncateNote(data.note);

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      title: plainText(t("feishu.archived.title")),
      template: "grey",
    },
    elements: [
      markdown(t("feishu.archived.intro")),
      divider(),
      markdown(
        [
          `**${t("feishu.sections.archivedTask")}**`,
          `${t("feishu.labels.taskId")}: ${data.taskId ?? t("feishu.values.unknown")}`,
          `${t("feishu.labels.title")}: ${data.taskTitle ?? t("feishu.values.unknown")}`,
          data.archivedAt ? `archivedAt: ${data.archivedAt}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      ...(note ? [divider(), markdown(`**${t("feishu.sections.update")}**\n${note}`)] : []),
      divider(),
      markdown(t("feishu.archived.footer")),
    ],
  };
}
