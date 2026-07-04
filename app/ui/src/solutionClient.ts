export type SolutionDocument = {
  readonly fen?: unknown;
  readonly sideToSolve?: unknown;
  readonly status?: unknown;
  readonly root?: unknown;
};

export class SolutionFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SolutionFetchError";
  }
}

const serverBaseUrl = import.meta.env.VITE_SERVER_URL ?? "http://127.0.0.1:3001";

export async function fetchSolution(initialFen: string): Promise<SolutionDocument> {
  const response = await fetch(new URL(`/v1/solution/${encodeURIComponent(initialFen)}`, serverBaseUrl).href);

  if (!response.ok) {
    throw new SolutionFetchError(response.status === 404 ? "Solution not found" : "Solution request failed", response.status);
  }

  return (await response.json()) as SolutionDocument;
}
