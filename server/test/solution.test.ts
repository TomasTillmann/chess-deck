import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openDatabase, type Db } from "../src/database.js";
import { createApp } from "../src/http.js";
import { SolutionRepository } from "../src/repository.js";

const fen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
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

let db: Db;
let server: Server;
let baseUrl: string;

before(async () => {
  db = openDatabase(":memory:");
  new SolutionRepository(db).upsert("woodpecker", fen, tree);

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

test("GET /v1/solution/:fen returns the stored solution JSON", async () => {
  const response = await fetch(`${baseUrl}/v1/solution/${encodeURIComponent(fen)}`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), tree);
});

test("GET /v1/solution/:fen returns 404 when the solution is unknown", async () => {
  const response = await fetch(`${baseUrl}/v1/solution/${encodeURIComponent("missing fen")}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Solution not found" });
});
