import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openDatabase, type Db } from "../src/database.js";
import { createApp } from "../src/http.js";
import { CollectionRepository, SolutionRepository } from "../src/repository.js";

const fen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const encyclopediaFen = "4r1k1/p1pb1ppp/Qbp1r3/8/1P6/2Pq1B2/R2P1PPP/2B2RK1 b - - 0 1";
const tree = {
  fen,
  sideToSolve: "b",
  status: "solved",
  root: {
    fen,
    turn: "b",
    moves: [{ uci: "h8h2", children: [] }],
  },
};
const encyclopediaTree = { ...tree, status: "encyclopedia" };

let db: Db;
let server: Server;
let baseUrl: string;

before(async () => {
  db = openDatabase(":memory:");
  db.prepare("INSERT INTO collections (fen) VALUES (?)").run(fen);
  db.prepare("INSERT INTO collections (collection, fen) VALUES (?, ?)").run("encyclopedia", encyclopediaFen);
  new SolutionRepository(db).upsert("woodpecker", fen, tree);
  new SolutionRepository(db).upsert("encyclopedia", fen, encyclopediaTree);

  server = createApp(
    {
      host: "127.0.0.1",
      port: 0,
      databasePath: ":memory:",
    },
    db,
  );

  await new Promise<void>(resolve => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
  db.close();
});

test("GET /v1/collections returns FENs from the collections table", async () => {
  const response = await fetch(`${baseUrl}/v1/collections`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    collections: [
      {
        slug: "woodpecker",
        name: "Woodpecker",
        description: "1 positions loaded from the Woodpecker deck.",
        fens: [fen],
      },
      {
        slug: "encyclopedia",
        name: "Encyclopedia of Chess Combinations",
        description: "1 positions loaded from the Encyclopedia of Chess Combinations deck.",
        fens: [encyclopediaFen],
      },
    ],
  });
});

test("CollectionRepository lists FENs by generated id", () => {
  const repository = new CollectionRepository(db);

  assert.deepEqual(repository.listFens(), [fen]);
  assert.deepEqual(repository.listFens("encyclopedia"), [encyclopediaFen]);
});

test("GET /v1/solution/:fen returns the stored solution JSON", async () => {
  const response = await fetch(`${baseUrl}/v1/solution/${encodeURIComponent(fen)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), tree);
});

test("GET /v1/solution/:fen selects the requested collection", async () => {
  const response = await fetch(
    `${baseUrl}/v1/solution/${encodeURIComponent(fen)}?collection=encyclopedia`,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), encyclopediaTree);
});

test("GET /v1/solution/:fen returns 404 when the solution is unknown", async () => {
  const response = await fetch(`${baseUrl}/v1/solution/${encodeURIComponent("missing fen")}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Solution not found" });
});

test("POST /v1/solver/solutions/existing returns existing solution FENs", async () => {
  const response = await fetch(`${baseUrl}/v1/solver/solutions/existing`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collection: "woodpecker",
      fens: [fen, "missing fen"],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { existing: [fen] });
});

test("POST /v1/solver/solutions stores a batch of solved trees", async () => {
  const batchFen = "8/8/8/8/8/8/5K2/6k1 w - - 0 1";
  const batchTree = {
    fen: batchFen,
    sideToSolve: "w",
    status: "solved",
    root: {
      fen: batchFen,
      turn: "w",
      moves: [],
    },
  };

  const response = await fetch(`${baseUrl}/v1/solver/solutions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      collection: "woodpecker",
      solutions: [{ fen: batchFen, tree: batchTree }],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { stored: 1 });
  assert.deepEqual(db.prepare("SELECT tree FROM solutions WHERE collection = ? AND fen = ?").get("woodpecker", batchFen), {
    tree: JSON.stringify(batchTree),
  });
});
