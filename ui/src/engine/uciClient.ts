export interface UciTransport {
  post(command: string): void;
  onLine(listener: (line: string) => void): () => void;
  dispose(): void;
}

type LineMatcher<T> = (line: string) => T | undefined;

export class UciEngineClient {
  private prepared = false;
  private activeSearch?: Promise<string>;

  constructor(private readonly transport: UciTransport) {}

  async prepare(): Promise<void> {
    if (this.prepared) return;

    const uciok = this.waitFor(line => (line === "uciok" ? true : undefined), "uciok");
    this.transport.post("uci");
    await uciok;

    const readyok = this.waitFor(line => (line === "readyok" ? true : undefined), "readyok");
    this.transport.post("isready");
    await readyok;

    this.prepared = true;
  }

  async bestMove(fen: string, depth: number): Promise<string> {
    if (this.activeSearch) throw new Error("Stockfish search is already running.");

    this.activeSearch = this.searchBestMove(fen, depth);

    try {
      return await this.activeSearch;
    } finally {
      this.activeSearch = undefined;
    }
  }

  dispose(): void {
    this.transport.dispose();
  }

  private async searchBestMove(fen: string, depth: number): Promise<string> {
    await this.prepare();

    const bestMove = this.waitFor(
      line => {
        const match = /^bestmove\s+(\S+)/.exec(line);
        return match?.[1];
      },
      "bestmove",
      30000,
    );

    this.transport.post(`position fen ${fen}`);
    this.transport.post(`go depth ${depth}`);

    const move = await bestMove;
    if (move === "(none)") throw new Error("Stockfish did not find a legal move.");

    return move;
  }

  private waitFor<T>(matcher: LineMatcher<T>, label: string, timeoutMs = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
      const off = this.transport.onLine(line => {
        const value = matcher(line);
        if (value === undefined) return;

        clearTimeout(timeout);
        off();
        resolve(value);
      });

      const timeout = window.setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for Stockfish ${label}.`));
      }, timeoutMs);
    });
  }
}
