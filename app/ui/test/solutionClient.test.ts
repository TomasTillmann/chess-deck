import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { Chess, fen as chessFen, parseUci, san } from "chessops";
import { createMoveRoot } from "../src/gameTree.ts";
import { SolutionUpdateError, updateSolution } from "../src/solutionClient.ts";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function tree(uci: string) {
  const position = Chess.default();
  const move = parseUci(uci)!;
  const record = { ply: 1, san: san.makeSan(position, move), uci, color: position.turn, moveNumber: 1 };
  position.play(move);
  return {
    ...createMoveRoot(fen),
    children: [{ ...createMoveRoot(chessFen.makeFen(position.toSetup())), id: uci, move: record }],
  };
}

function captureRequests(t: TestContext) {
  const stored: string[] = [];
  const requests: { body: string; finish: (status?: number) => void; reject: (error: Error) => void }[] = [];
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const body = init.body as string;
    requests.push({ body, reject, finish(status = 204) {
      if (status === 204) stored.push(JSON.parse(body).solutions[0].tree.root.moves[0].uci);
      resolve(new Response(null, { status }));
    } });
  }));
  return { requests, stored };
}

test("same-position saves from separate attempts persist in invocation order", async t => {
  const { requests, stored } = captureRequests(t);
  const first = updateSolution("attempts", fen, tree("e2e4"));
  const nextTree = tree("d2d4");
  const second = updateSolution("attempts", fen, nextTree);
  nextTree.children.length = 0;
  await setImmediate();
  assert.equal(requests.length, 1, "the next attempt must wait for the previous write");
  requests[0].finish();
  await first;
  await setImmediate();
  assert.equal(requests.length, 2);

  const third = updateSolution("attempts", fen, tree("c2c4"));
  await setImmediate();
  assert.equal(requests.length, 2, "finishing an older write must retain the newer pending write");
  requests[1].finish();
  await second;
  await setImmediate();
  assert.equal(requests.length, 3);
  requests[2].finish();
  await third;
  assert.deepEqual(stored, ["e2e4", "d2d4", "c2c4"]);
});

test("different collections or positions can save independently", async t => {
  const { requests } = captureRequests(t);
  const otherFen = chessFen.makeFen(Chess.default().toSetup()).replace(" 0 1", " 1 1");
  const pending = [
    updateSolution("one", fen, tree("e2e4")),
    updateSolution("two", fen, tree("d2d4")),
    updateSolution("one", otherFen, tree("c2c4")),
  ];
  await setImmediate();
  assert.equal(requests.length, 3);
  requests.forEach(request => request.finish());
  await Promise.all(pending);
});

for (const failure of ["http", "network"]) {
  test(`a ${failure} failure releases the next save and permits a later retry`, async t => {
    const { requests, stored } = captureRequests(t);
    const first = updateSolution(failure, fen, tree("e2e4"));
    const rejected = assert.rejects(first, failure === "http" ? SolutionUpdateError : /offline/);
    const second = updateSolution(failure, fen, tree("d2d4"));
    await setImmediate();
    assert.equal(requests.length, 1);
    if (failure === "http") requests[0].finish(500);
    else requests[0].reject(new Error("offline"));
    await rejected;
    await setImmediate();
    assert.equal(requests.length, 2);
    requests[1].finish();
    await second;
    const retry = updateSolution(failure, fen, tree("c2c4"));
    await setImmediate();
    assert.equal(requests.length, 3);
    requests[2].finish();
    await retry;
    assert.deepEqual(stored, ["d2d4", "c2c4"]);
  });
}
