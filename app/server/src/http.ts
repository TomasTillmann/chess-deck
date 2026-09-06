import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "./config.js";
import type { Db } from "./database.js";
import {
  CollectionRepository,
  RecordRepository,
  SolutionRepository,
  type SolutionInput,
} from "./repository.js";
import {
  RequestValidationError,
  readJsonBody,
  solutionExistingBatchSchema,
  solutionStoreBatchSchema,
} from "./validation.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

type DatabaseHealth =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export type AppContext = {
  readonly config: ServerConfig;
  readonly db: Db;
  readonly collections: CollectionRepository;
  readonly records: RecordRepository;
  readonly solutions: SolutionRepository;
};

export function createApp(config: ServerConfig, db: Db): http.Server {
  const context: AppContext = {
    config,
    db,
    collections: new CollectionRepository(db),
    records: new RecordRepository(db),
    solutions: new SolutionRepository(db),
  };

  return http.createServer((request, response) => {
    void handleRequest(context, request, response);
  });
}

async function handleRequest(
  context: AppContext,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthcheck")) {
      const database = checkDatabaseHealth(context.db);
      sendJson(response, database.ok ? 200 : 503, {
        ok: database.ok,
        status: database.ok ? "OK" : "UNHEALTHY",
        server: { ok: true },
        database,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/collections") {
      sendJson(response, 200, {
        collections: [
          ["woodpecker", "Woodpecker"],
          ["encyclopedia", "Encyclopedia of Chess Combinations"],
        ].map(([slug, name]) => {
          const fens = context.collections.listFens(slug);
          return { slug, name, description: `${fens.length} positions loaded from the ${name} deck.`, fens };
        }),
      });
      return;
    }

    const solutionPrefix = "/v1/solution/";
    if (request.method === "GET" && url.pathname.startsWith(solutionPrefix)) {
      const fen = decodeURIComponent(url.pathname.slice(solutionPrefix.length));
      const solution = context.solutions.findByFen(url.searchParams.get("collection") ?? "woodpecker", fen);

      if (!solution) {
        sendJson(response, 404, { error: "Solution not found" });
        return;
      }

      sendJson(response, 200, solution.tree as JsonValue);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/solver/solutions/existing") {
      const body = await readJsonBody(request, solutionExistingBatchSchema, 10_000_000);
      sendJson(response, 200, {
        existing: context.solutions.existingFens(body.collection, body.fens),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/solver/solutions") {
      const body = await readJsonBody(request, solutionStoreBatchSchema, 100_000_000);
      const solutions: SolutionInput[] = body.solutions.map(solution => ({
        fen: solution.fen,
        tree: solution.tree,
      }));
      sendJson(response, 200, {
        stored: context.solutions.upsertMany(body.collection, solutions),
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      sendJson(response, 400, { error: error.message, issues: error.issues });
      return;
    }

    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}

function checkDatabaseHealth(db: Db): DatabaseHealth {
  try {
    db.prepare("SELECT 1").get();

    const quickCheck = db.prepare("PRAGMA quick_check(1)").get() as
      | { readonly quick_check?: unknown }
      | undefined;
    const result = quickCheck?.quick_check;

    if (result !== "ok") {
      return {
        ok: false,
        error: `SQLite quick_check failed: ${String(result ?? "no result")}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown SQLite healthcheck error",
    };
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonValue): void {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(statusCode === 204 ? undefined : JSON.stringify(body));
}
