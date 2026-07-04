export interface Engine {
  prepare(): Promise<void>;
  bestMove(fen: string, depth: number): Promise<string>;
  dispose(): void;
}
