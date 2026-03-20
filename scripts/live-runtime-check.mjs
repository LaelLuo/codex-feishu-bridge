#!/usr/bin/env bun

const baseUrl = process.env.BRIDGE_BASE_URL ?? "http://127.0.0.1:8787";
const args = process.argv.slice(2);

function parseArgs(argv) {
  const options = {
    createThread: false,
    exerciseTurns: false,
    workspaceRoot: process.cwd(),
    title: `Live validation ${new Date().toISOString()}`,
    turnPrompt:
      "Inspect this repository in detail and produce a long structured report with at least fifty bullet points. Take your time and be exhaustive.",
    steerContent: "Change of plan: ignore the prior request and reply with exactly DONE.",
    interruptPrompt:
      "Inspect this repository in detail and produce a very long multi-section report. Keep working until finished.",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--create-thread":
        options.createThread = true;
        break;
      case "--exercise-turns":
        options.exerciseTurns = true;
        break;
      case "--workspace-root":
        index += 1;
        options.workspaceRoot = argv[index] ?? options.workspaceRoot;
        break;
      case "--title":
        index += 1;
        options.title = argv[index] ?? options.title;
        break;
      case "--turn-prompt":
        index += 1;
        options.turnPrompt = argv[index] ?? options.turnPrompt;
        break;
      case "--steer-content":
        index += 1;
        options.steerContent = argv[index] ?? options.steerContent;
        break;
      case "--interrupt-prompt":
        index += 1;
        options.interruptPrompt = argv[index] ?? options.interruptPrompt;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  return options;
}

async function request(pathname, init) {
  const response = await fetch(new URL(pathname, baseUrl), {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}) ${pathname}: ${body}`);
  }

  return response.json();
}

function printUsage() {
  console.log(`codex-feishu-bridge live runtime check

Usage:
  bun scripts/live-runtime-check.mjs
  bun scripts/live-runtime-check.mjs --create-thread
  bun scripts/live-runtime-check.mjs --exercise-turns
  bun scripts/live-runtime-check.mjs --create-thread --exercise-turns
  bun scripts/live-runtime-check.mjs --create-thread --workspace-root /workspace/codex-feishu-bridge
  bun scripts/live-runtime-check.mjs --create-thread --title "Live validation task"

Notes:
  - Default mode is read-only and does not create a thread.
  - --create-thread creates a real thread without sending a prompt.
  - --exercise-turns runs real turn/start, immediate turn/steer, and immediate turn/interrupt checks.
  - --exercise-turns sends real prompts and may consume model tokens.
`);
}

function printSection(title, value) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const options = parseArgs(args);

  console.log(`# Live Runtime Check`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(
    `Mode: ${
      options.createThread || options.exerciseTurns
        ? [
            options.createThread ? "create-thread" : null,
            options.exerciseTurns ? "exercise-turns" : null,
          ]
            .filter(Boolean)
            .join("+")
        : "read-only"
    }`,
  );

  const health = await request("/health");
  const account = await request("/auth/account");
  const rateLimits = await request("/auth/rate-limits");
  const tasks = await request("/tasks");

  printSection("Health", health);
  printSection("Account", account);
  printSection("Rate Limits", rateLimits);
  printSection("Tasks Summary", {
    taskCount: tasks.tasks.length,
    taskIds: tasks.tasks.map((task) => task.taskId),
  });

  if (!options.createThread && !options.exerciseTurns) {
    console.log("\nRead-only validation completed.");
    console.log("Skipped thread creation and turn actions.");
    return;
  }

  if (options.createThread) {
    const created = await request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: options.title,
        workspaceRoot: options.workspaceRoot,
        prompt: "",
      }),
    });

    printSection("Created Thread", {
      taskId: created.task.taskId,
      threadId: created.task.threadId,
      status: created.task.status,
      workspaceRoot: created.task.workspaceRoot,
    });
  }

  if (options.exerciseTurns) {
    const turnTask = await request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: `${options.title} turn-start`,
        workspaceRoot: options.workspaceRoot,
        prompt: options.turnPrompt,
      }),
    });
    const steered = await request(`/tasks/${encodeURIComponent(turnTask.task.taskId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: options.steerContent,
      }),
    });

    const interruptTask = await request("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: `${options.title} interrupt`,
        workspaceRoot: options.workspaceRoot,
        prompt: options.interruptPrompt,
      }),
    });
    const interrupted = await request(`/tasks/${encodeURIComponent(interruptTask.task.taskId)}/interrupt`, {
      method: "POST",
    });

    printSection("Turn Start", {
      taskId: turnTask.task.taskId,
      threadId: turnTask.task.threadId,
      status: turnTask.task.status,
      activeTurnId: turnTask.task.activeTurnId ?? null,
    });
    printSection("Turn Steer", {
      taskId: steered.task.taskId,
      status: steered.task.status,
      activeTurnId: steered.task.activeTurnId ?? null,
    });
    printSection("Turn Interrupt", {
      taskId: interrupted.task.taskId,
      status: interrupted.task.status,
      activeTurnId: interrupted.task.activeTurnId ?? null,
    });
  }

  console.log("\nLive runtime mutation validation completed.");
  if (options.createThread && !options.exerciseTurns) {
    console.log("No prompt was sent, so this path should not consume model tokens.");
    return;
  }

  console.log("Turn exercises sent real prompts and may consume model tokens.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("If you are running inside workspace-dev, set BRIDGE_BASE_URL=http://bridge-runtime:8787.");
  process.exitCode = 1;
});
