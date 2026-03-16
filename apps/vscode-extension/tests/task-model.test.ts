import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBridgeTask } from "@codex-feishu-bridge/protocol";

import { applyDaemonSnapshot, createEmptySnapshot, sortTasks } from "../src/core/task-model";

describe("task model", () => {
  it("sorts tasks by most recent update", () => {
    const first = createBridgeTask({
      threadId: "thr-1",
      title: "Older",
      workspaceRoot: "/tmp",
      mode: "bridge-managed",
      createdAt: "2026-03-17T00:00:00.000Z",
    });
    first.updatedAt = "2026-03-17T00:00:00.000Z";

    const second = createBridgeTask({
      threadId: "thr-2",
      title: "Newer",
      workspaceRoot: "/tmp",
      mode: "bridge-managed",
      createdAt: "2026-03-17T00:00:00.000Z",
    });
    second.updatedAt = "2026-03-17T00:00:01.000Z";

    const sorted = sortTasks([first, second]);
    assert.deepEqual(
      sorted.map((task) => task.taskId),
      ["thr-2", "thr-1"],
    );
  });

  it("hydrates a daemon snapshot into extension state", () => {
    const task = createBridgeTask({
      threadId: "thr-3",
      title: "Task",
      workspaceRoot: "/tmp",
      mode: "manual-import",
      createdAt: "2026-03-17T00:00:00.000Z",
    });
    task.updatedAt = "2026-03-17T00:00:05.000Z";

    const snapshot = applyDaemonSnapshot(
      createEmptySnapshot(),
      {
        seq: 4,
        tasks: [task],
        account: { account: { type: "chatgpt" } },
        rateLimits: { rateLimits: null },
      },
      "connected",
    );

    assert.equal(snapshot.connection, "connected");
    assert.equal(snapshot.seq, 4);
    assert.equal(snapshot.tasks[0].taskId, "thr-3");
    assert.ok(snapshot.lastUpdatedAt);
  });
});
