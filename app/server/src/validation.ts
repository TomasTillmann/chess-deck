import type { IncomingMessage } from "node:http";
import { z } from "zod";

export const collectionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const idSchema = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const recordPayloadSchema = z.record(z.unknown()).refine(
  value => !Array.isArray(value) && value !== null,
  "Payload must be a JSON object",
);

export const recordCreateSchema = z.object({
  collection: collectionSchema,
  payload: recordPayloadSchema,
});

export const recordUpdateSchema = recordCreateSchema.extend({
  id: idSchema,
});

const solutionFenSchema = z.string().min(1);

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
        tree: z.object({
          fen: solutionFenSchema,
          root: z.record(z.unknown()),
        }).passthrough(),
      }).refine(solution => solution.tree.fen === solution.fen, "Solution FEN must match the requested FEN"),
    )
    .min(1)
    .max(100),
});

export const reviewQueueSchema = z.object({
  learnerId: idSchema,
  collection: collectionSchema,
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
  const result = schema.safeParse(Object.fromEntries(query));
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
