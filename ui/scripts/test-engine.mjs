import { createRequire } from "node:module";
import { Chess, fen as chessFen, isNormal, parseUci } from "chessops";

const require = createRequire(import.meta.url);
const initStockfish = require("stockfish");

const sampleFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const depth = 4;

function positionFromFen(fen) {
  return Chess.fromSetup(chessFen.parseFen(fen).unwrap()).unwrap();
}

function waitFor(listeners, matcher, label, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const listener = line => {
      const value = matcher(line);
      if (value === undefined) return;

      clearTimeout(timeout);
      listeners.delete(listener);
      resolve(value);
    };

    const timeout = setTimeout(() => {
      listeners.delete(listener);
      reject(new Error(`Timed out waiting for Stockfish ${label}.`));
    }, timeoutMs);

    listeners.add(listener);
  });
}

async function main() {
  const engine = await initStockfish("lite-single");
  const listeners = new Set();

  engine.listener = line => {
    for (const listener of listeners) listener(line);
  };

  try {
    const uciok = waitFor(listeners, line => (line === "uciok" ? true : undefined), "uciok");
    engine.sendCommand("uci");
    await uciok;

    const readyok = waitFor(listeners, line => (line === "readyok" ? true : undefined), "readyok");
    engine.sendCommand("isready");
    await readyok;

    const bestMove = waitFor(
      listeners,
      line => {
        const match = /^bestmove\s+(\S+)/.exec(line);
        return match?.[1];
      },
      "bestmove",
      30000,
    );

    engine.sendCommand(`position fen ${sampleFen}`);
    engine.sendCommand(`go depth ${depth}`);

    const uci = await bestMove;
    const position = positionFromFen(sampleFen);
    const move = parseUci(uci);

    if (!move || !isNormal(move)) throw new Error(`Stockfish returned an invalid UCI move: ${uci}`);
    if (!position.isLegal(move)) throw new Error(`Stockfish returned an illegal move: ${uci}`);

    console.log(`Stockfish lite-single returned legal move ${uci} at depth ${depth}.`);
  } finally {
    engine.sendCommand("quit");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
