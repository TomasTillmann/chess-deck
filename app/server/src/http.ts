import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerConfig } from "./config.js";
import type { Db } from "./database.js";
import { ReviewRepository, ReviewConflictError, ReviewPositionNotFoundError } from "./reviewRepository.js";
import { DeckViewRepository, DeckViewCollectionsError } from "./deckViewRepository.js";
import {
  CollectionRepository,
  collectionName,
  SolutionRepository,
  type SolutionInput,
} from "./repository.js";
import {
  RequestValidationError,
  readJsonBody,
  parseQuery,
  idSchema,
  deckViewQuerySchema,
  deckViewCreateSchema,
  deckViewRenameSchema,
  reviewQueueSchema,
  practiceQueueSchema,
  reviewOptionsSchema,
  reviewCreateSchema,
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
  readonly solutions: SolutionRepository;
  readonly reviews: ReviewRepository;
  readonly deckViews: DeckViewRepository;
};

export function createApp(config: ServerConfig, db: Db): http.Server {
  const context: AppContext = {
    config,
    db,
    collections: new CollectionRepository(db),
    solutions: new SolutionRepository(db),
    reviews: new ReviewRepository(db),
    deckViews: new DeckViewRepository(db),
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
        collections: context.collections.listSlugs().map(slug => {
          const name = collectionName(slug);
          const fens = context.collections.listFens(slug);
          return { slug, name, description: `${fens.length} positions loaded from the ${name} deck.`, fens };
        }),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/deck-views") {
      const query = parseQuery(url.searchParams, deckViewQuerySchema);
      sendJson(response, 200, { views: context.deckViews.list(query.learnerId) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/deck-views") {
      const body = await readJsonBody(request, deckViewCreateSchema, 100_000);
      sendJson(response, 200, context.deckViews.create(body.learnerId, body.collections));
      return;
    }

    const deckViewRoute = /^\/v1\/deck-views\/([^/]+)$/.exec(url.pathname);
    if (deckViewRoute && ["GET", "PATCH", "DELETE"].includes(request.method ?? "")) {
      const id = idSchema.safeParse(deckViewRoute[1]);
      if (!id.success) throw new RequestValidationError(["Invalid deck view ID"]);
      if (request.method === "PATCH") {
        const body = await readJsonBody(request, deckViewRenameSchema, 4_096);
        const view = context.deckViews.rename(body.learnerId, id.data, body.name);
        sendJson(response, view ? 200 : 404, view ?? { error: "Deck view not found" });
      } else {
        const query = parseQuery(url.searchParams, deckViewQuerySchema);
        if (request.method === "DELETE") {
          const deleted = context.deckViews.delete(query.learnerId, id.data);
          sendJson(response, deleted ? 204 : 404, deleted ? null : { error: "Deck view not found" });
        } else {
          const view = context.deckViews.find(query.learnerId, id.data);
          sendJson(response, view ? 200 : 404, view ?? { error: "Deck view not found" });
        }
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/review-queue") {
      const query = parseQuery(url.searchParams, reviewQueueSchema);
      sendJson(response, 200, context.reviews.queue(query.learnerId, query.collection));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/practice-queue") {
      const query = parseQuery(url.searchParams, practiceQueueSchema);
      sendJson(response, 200, context.reviews.queue(query.learnerId, query.collection));
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/review-options") {
      const query = parseQuery(url.searchParams, reviewOptionsSchema);
      sendJson(response, 200, context.reviews.options(query.learnerId, query.collection, query.fen));
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/reviews") {
      const body = await readJsonBody(request, reviewCreateSchema, 4_096);
      sendJson(response, 200, context.reviews.save(body));
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
        stored: context.solutions.upsertMany(body.collection, solutions, body.overwrite),
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof DeckViewCollectionsError) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    if (error instanceof RequestValidationError) {
      sendJson(response, 400, { error: error.message, issues: error.issues });
      return;
    }

    if (error instanceof ReviewPositionNotFoundError || error instanceof ReviewConflictError) {
      sendJson(response, error instanceof ReviewConflictError ? 409 : 404, { error: error.message });
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
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(statusCode === 204 ? undefined : JSON.stringify(body));
}
