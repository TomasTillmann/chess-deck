import "./App.css";
import { ChessBoard } from "./components/ChessBoard";

const initialFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";

export function App() {
  return (
    <main className="app-shell">
      <section className="board-stage" aria-labelledby="position-title">
        <div className="position-header">
          <h1 id="position-title">Woodpecker</h1>
          <p>Position 1</p>
        </div>
        <ChessBoard fen={initialFen} orientation="white" />
      </section>
    </main>
  );
}
