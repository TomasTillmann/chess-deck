import type { IncomingMessage } from "node:http";
import { z } from "zod";

export const collectionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const idSchema = z.string().uuid();

const solutionFenSchema = z.string().refine(value => value.trim().length > 0, "FEN must not be blank");

type SolutionPosition = {
  moves: { uci: string; children: SolutionPosition[] }[];
  [key: string]: unknown;
};

function solutionPositionSchema(depth: number): z.ZodType<SolutionPosition> {
  return z.object({
    // ponytail: cap recursive parsing at 128 plies; use iterative validation if longer lines are needed.
    moves: depth === 128 ? z.array(z.never()) : z.array(z.object({
      uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Move must be a UCI string"),
      children: z.array(z.lazy(() => solutionPositionSchema(depth + 1))),
    }).passthrough()),
  }).passthrough();
}

export const solutionTreeSchema = z.object({
  fen: solutionFenSchema,
  root: solutionPositionSchema(0).refine(root => root.moves.length > 0, "Solution root must contain a move"),
}).passthrough();

export const solutionExistingBatchSchema = z.object({
  collection: collectionSchema,
  fens: z.array(solutionFenSchema).min(1).max(5_000),
});

export const solutionStoreBatchSchema = z.object({
  collection: collectionSchema,
  overwrite: z.boolean().default(true),
  solutions: z
    .array(
      z.object({
        fen: solutionFenSchema,
        tree: solutionTreeSchema,
      }).refine(solution => solution.tree.fen === solution.fen, "Solution FEN must match the requested FEN"),
    )
    .min(1)
    .max(100),
});

export const reviewQueueSchema = z.object({
  learnerId: idSchema,
  collection: collectionSchema,
});

export const practiceQueueSchema = z.object({
  learnerId: idSchema,
  collection: z.union([collectionSchema, z.array(collectionSchema).max(1_000)])
    .transform(value => [...new Set(typeof value === "string" ? [value] : value)])
    .optional(),
});

export const deckViewQuerySchema = z.object({ learnerId: idSchema }).strict();

export const deckViewCreateSchema = deckViewQuerySchema.extend({
  collections: z.array(collectionSchema).min(1).max(1_000),
});

export const deckViewRenameSchema = deckViewQuerySchema.extend({
  name: z.string().trim().min(1).max(200),
});

export const reviewOptionsSchema = reviewQueueSchema.extend({
  fen: z.string().min(1).max(200),
});

export const reviewCreateSchema = reviewOptionsSchema.extend({
  reviewId: idSchema,
  rating: z.enum(["easy", "hard", "again"]),
}).strict();

export function parseQuery<TSchema extends z.ZodTypeAny>(
  query: URLSearchParams,
  schema: TSchema,
): z.infer<TSchema> {
  const values = Object.fromEntries([...query.keys()].map(key => {
    const entries = query.getAll(key);
    return [key, entries.length === 1 ? entries[0] : entries];
  }));
  const result = schema.safeParse(values);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues.map(issue => issue.message));
  }
  return result.data;
}

export class RequestValidationError extends Error {
  constructor(readonly issues: string[]) {
    super("Request validation failed");
  }
}

export async function readJsonBody<TSchema extends z.ZodTypeAny>(
  request: IncomingMessage,
  schema: TSchema,
  maxBytes = 1_000_000,
): Promise<z.infer<TSchema>> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    throw new RequestValidationError(["Content-Type must be application/json"]);
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;

    if (size > maxBytes) {
      throw new RequestValidationError(["Request body is too large"]);
    }

    chunks.push(buffer);
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    const result = schema.safeParse(parsed);

    if (!result.success) {
      throw new RequestValidationError(result.error.issues.map(issue => issue.message));
    }

    return result.data;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError(["Request body must be valid JSON"]);
  }
}
