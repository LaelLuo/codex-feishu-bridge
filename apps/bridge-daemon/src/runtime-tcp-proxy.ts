import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server, type Socket } from "node:net";
import { createInterface } from "node:readline";

import { createConsoleLogger, loadBridgeConfig } from "@codex-feishu-bridge/shared";

import { spawnCodexProcess } from "./runtime/spawn-codex-process";

export interface RuntimeTcpProxyHandle {
  close(): Promise<void>;
  host: string;
  port: number;
}

export async function startRuntimeTcpProxy(): Promise<RuntimeTcpProxyHandle> {
  const logger = createConsoleLogger("codex-runtime-tcp-proxy");
  const config = loadBridgeConfig();

  let activeClient: Socket | null = null;
  let activeChild: ChildProcessWithoutNullStreams | null = null;

  const clearSession = (client: Socket, child: ChildProcessWithoutNullStreams): void => {
    if (activeClient === client) {
      activeClient = null;
    }
    if (activeChild === child) {
      activeChild = null;
    }
  };

  const server: Server = createServer((client) => {
    if (activeClient || activeChild) {
      client.end();
      return;
    }

    logger.info("runtime proxy client connected");
    activeClient = client;

    const managedChild = spawnCodexProcess(config);
    const child = managedChild.child;
    activeChild = child;

    child.stderr.on("data", (chunk: Buffer) => {
      logger.warn("codex app-server stderr", chunk.toString("utf8"));
    });

    child.stdin.on("error", (error) => {
      logger.warn("codex app-server stdin error", error);
    });

    child.once("exit", (code, signal) => {
      managedChild.dispose();
      logger.warn(`codex app-server exited with code=${code} signal=${signal}`);
      if (!client.destroyed) {
        client.end();
      }
      clearSession(client, child);
    });

    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!client.destroyed) {
        client.write(`${line}\n`, "utf8");
      }
    });

    createInterface({ input: client }).on("line", (line) => {
      if (child.stdin.writable) {
        child.stdin.write(`${line}\n`, "utf8");
      }
    });

    client.once("close", () => {
      logger.info("runtime proxy client disconnected");
      if (!child.killed) {
        child.kill();
      }
      managedChild.dispose();
      clearSession(client, child);
    });

    client.on("error", (error) => {
      logger.warn("runtime proxy client error", error);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.codexRuntimeProxyPort, config.codexRuntimeProxyBindHost, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("codex runtime tcp proxy did not expose a tcp address");
  }

  logger.info(`codex runtime tcp proxy listening on ${config.codexRuntimeProxyBindHost}:${address.port}`);

  return {
    host: config.codexRuntimeProxyBindHost,
    port: address.port,
    async close() {
      if (activeClient && !activeClient.destroyed) {
        activeClient.destroy();
      }
      if (activeChild && !activeChild.killed) {
        activeChild.kill();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

if (require.main === module) {
  let handle: RuntimeTcpProxyHandle | null = null;

  const shutdown = async (exitCode: number): Promise<void> => {
    try {
      await handle?.close();
    } catch (error) {
      console.error("codex runtime tcp proxy failed to shut down cleanly", error);
      process.exitCode = 1;
    } finally {
      process.exit(exitCode);
    }
  };

  startRuntimeTcpProxy()
    .then((runtimeHandle) => {
      handle = runtimeHandle;
      process.on("SIGINT", () => {
        void shutdown(0);
      });
      process.on("SIGTERM", () => {
        void shutdown(0);
      });
    })
    .catch((error: unknown) => {
      console.error("codex runtime tcp proxy failed to start", error);
      process.exitCode = 1;
    });
}
