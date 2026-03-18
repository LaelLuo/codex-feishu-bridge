import { EventEmitter } from "node:events";
import { createConnection, type Socket } from "node:net";
import { createInterface } from "node:readline";

import type { BridgeConfig, Logger } from "@codex-feishu-bridge/shared";

type JsonRpcId = number;

interface JsonRpcResponse {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
  id?: JsonRpcId;
}

export class JsonRpcSocketClient {
  private readonly emitter = new EventEmitter();
  private readonly pending = new Map<
    JsonRpcId,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  private socket: Socket | null = null;
  private initialized = false;
  private nextId = 1;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly config: BridgeConfig,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    if (!this.startPromise) {
      this.startPromise = this.connectAndInitialize().finally(() => {
        this.startPromise = null;
      });
    }

    await this.startPromise;
  }

  async stop(): Promise<void> {
    if (!this.socket) {
      return;
    }

    this.socket.destroy();
    this.socket = null;
    this.initialized = false;
  }

  async request<TResponse>(method: string, params?: unknown): Promise<TResponse> {
    await this.start();

    if (!this.socket) {
      throw new Error("codex runtime socket proxy is not available");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const result = new Promise<TResponse>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value: unknown) => resolve(value as TResponse),
        reject,
      });
    });

    this.writePayload(payload);

    return result;
  }

  notify(method: string, params?: unknown): void {
    if (!this.socket) {
      return;
    }

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    });

    this.writePayload(payload);
  }

  respond(id: JsonRpcId | string, result: unknown): void {
    if (!this.socket) {
      return;
    }

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    });

    this.writePayload(payload);
  }

  onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
    this.emitter.on("notification", listener);
    return () => {
      this.emitter.off("notification", listener);
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private async connectAndInitialize(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(this.config.codexRuntimeProxySocket);
      let connected = false;

      const rejectConnect = (error: Error): void => {
        if (connected) {
          this.handleClose(error);
          return;
        }

        socket.destroy();
        reject(error);
      };

      socket.once("error", rejectConnect);
      socket.once("connect", () => {
        connected = true;
        socket.off("error", rejectConnect);
        this.socket = socket;
        socket.on("error", (error) => {
          this.logger.warn("codex runtime socket proxy error", error);
        });
        socket.once("close", () => {
          this.handleClose(new Error("codex runtime socket proxy connection closed"));
        });
        createInterface({ input: socket }).on("line", (line) => {
          this.handleLine(line);
        });
        resolve();
      });
    });

    const response = await this.requestInternal("initialize", {
      clientInfo: {
        name: "codex_feishu_bridge",
        title: "Codex Feishu Bridge",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    void response;
    this.notify("initialized", {});
    this.initialized = true;
  }

  private async requestInternal<TResponse>(method: string, params?: unknown): Promise<TResponse> {
    if (!this.socket) {
      throw new Error("codex runtime socket proxy is not available");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const result = new Promise<TResponse>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value: unknown) => resolve(value as TResponse),
        reject,
      });
    });

    this.writePayload(payload);
    return result;
  }

  private writePayload(payload: string): void {
    this.socket?.write(`${payload}\n`, "utf8");
  }

  private handleClose(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.socket = null;
    this.initialized = false;
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let message: JsonRpcResponse | JsonRpcNotification;
    try {
      message = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
    } catch (error) {
      this.logger.warn("failed to parse codex runtime socket proxy message", {
        line,
        error,
      });
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    this.emitter.emit("notification", message);
  }
}
