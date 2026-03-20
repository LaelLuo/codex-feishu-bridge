import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectHostCodexBinDir, detectHostCodexHome, selectBashExecutable } from "../../scripts/dev-stack.ts";

describe("dev-stack.ts", () => {
  it("prefers a non-WSL bash executable on Windows", () => {
    const selected = selectBashExecutable(
      [
        "C:\\Windows\\System32\\bash.exe",
        "D:\\Applications\\Scoop\\shims\\bash.exe",
        "C:\\ProgramData\\scoop\\apps\\git\\current\\bin\\bash.exe",
        "C:\\Users\\LaelLuo\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe",
      ],
      "win32",
      (candidate) => /git\\current\\bin\\bash\.exe$/i.test(candidate),
    );

    assert.equal(selected, "C:\\ProgramData\\scoop\\apps\\git\\current\\bin\\bash.exe");
  });

  it("falls back to plain bash off Windows", () => {
    assert.equal(selectBashExecutable(["/usr/bin/bash"], "linux"), "bash");
  });

  it("detects Windows Codex desktop resources as the host bin directory", () => {
    const detected = detectHostCodexBinDir(
      [
        "D:\\Applications\\Scoop\\shims\\codex.exe",
        "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.313.5234.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe",
      ],
      "win32",
    );

    assert.equal(
      detected,
      "C:/Program Files/WindowsApps/OpenAI.Codex_26.313.5234.0_x64__2p2nqsd0c76g0/app/resources",
    );
  });

  it("falls back to the default .codex home outside Windows", () => {
    assert.equal(detectHostCodexHome("linux"), undefined);
  });
});
