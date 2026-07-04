import stockfishWorkerUrl from "stockfish/bin/stockfish-18-lite-single.js?url";
import stockfishWasmUrl from "stockfish/bin/stockfish-18-lite-single.wasm?url";

import { UciEngineClient, type UciTransport } from "./uciClient";

class WorkerUciTransport implements UciTransport {
  private readonly worker: Worker;
  private readonly listeners = new Set<(line: string) => void>();

  constructor() {
    const wasmUrl = new URL(stockfishWasmUrl, globalThis.location.href).href;
    const workerUrl = new URL(stockfishWorkerUrl, globalThis.location.href).href;
    this.worker = new Worker(`${workerUrl}#${encodeURIComponent(wasmUrl)}`);
    this.worker.addEventListener("message", event => {
      if (typeof event.data !== "string") return;
      for (const listener of this.listeners) listener(event.data);
    });
  }

  post(command: string): void {
    this.worker.postMessage(command);
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.worker.postMessage("quit");
    this.worker.terminate();
    this.listeners.clear();
  }
}

let client: UciEngineClient | undefined;

function getClient(): UciEngineClient {
  client ??= new UciEngineClient(new WorkerUciTransport());
  return client;
}

export function prepare(): Promise<void> {
  return getClient().prepare();
}

export function bestMove(fen: string, depth: number): Promise<string> {
  return getClient().bestMove(fen, depth);
}

export function dispose(): void {
  client?.dispose();
  client = undefined;
}
