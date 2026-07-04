import fs from "node:fs";
import path from "node:path";
import { readConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { SolutionRepository } from "./repository.js";

const collection = "woodpecker";

type SolutionFile = {
  readonly fen?: unknown;
};

function readSolvedDirectory(): string {
  const explicitPath = process.argv[2];
  return explicitPath
    ? path.resolve(explicitPath)
    : path.resolve(process.cwd(), "..", "solved", collection);
}

function readSolutionFiles(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter(fileName => /^\d+\.json$/.test(fileName))
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10))
    .map(fileName => path.join(directory, fileName));
}

function readSolution(filePath: string): { readonly fen: string; readonly tree: unknown } {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as SolutionFile;

  if (typeof parsed.fen !== "string" || !parsed.fen.trim()) {
    throw new Error(`${filePath} does not contain a top-level fen string`);
  }

  return {
    fen: parsed.fen,
    tree: parsed,
  };
}

const solvedDirectory = readSolvedDirectory();
const db = openDatabase(readConfig().databasePath);
const solutions = new SolutionRepository(db);

try {
  const files = readSolutionFiles(solvedDirectory);

  for (const filePath of files) {
    const solution = readSolution(filePath);
    solutions.upsert(collection, solution.fen, solution.tree);
  }

  console.log(`Imported ${files.length} ${collection} solutions into ${readConfig().databasePath}`);
  console.log(`Stored ${solutions.count(collection)} ${collection} solutions total`);
} finally {
  db.close();
}
