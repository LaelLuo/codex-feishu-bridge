export function resolveRuntimeSocketPath(socketPath: string): string {
  if (process.platform !== "win32" || socketPath.startsWith("\\\\.\\pipe\\")) {
    return socketPath;
  }

  const sanitized = socketPath
    .replace(/^[A-Za-z]:/, "")
    .replace(/^[\\/]+/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-");

  return `\\\\.\\pipe\\${sanitized || "codex-runtime-proxy"}`;
}
