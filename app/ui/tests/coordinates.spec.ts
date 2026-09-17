import { expect, test } from "@playwright/test";

const fens = [
  "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1",
  "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1",
];

test("coordinates stay inside their squares at both orientations and responsive sizes", async ({ page }) => {
  await page.route("**/v1/collections", route => route.fulfill({ json: {
    collections: [{ slug: "coordinates", name: "Coordinate check", description: "", fens }],
  } }));
  await page.route("**/v1/review-queue?*", route => route.fulfill({ json: {
    serverNow: "2026-09-17T12:00:00.000Z",
    cards: fens.map(fen => ({ fen, status: "new", dueAt: null })),
    recommendedFen: fens[0],
    nextDueAt: null,
  } }));

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [index, orientation] of ["black", "white"].entries()) {
      await page.goto(`/#/decks/coordinates/positions/${index + 1}`);
      const board = page.getByLabel("Chess position");
      await expect(board).toHaveClass(new RegExp(`orientation-${orientation}`));
      for (const theme of ["light", "dark"]) {
        await page.getByRole("combobox", { name: "Theme", exact: true }).selectOption(theme);
        const coordinates = await board.evaluate(element => {
          // Chessground rounds its rendered board to whole-pixel square sizes.
          const boardRect = element.querySelector("cg-board")!.getBoundingClientRect();
          return [...element.querySelectorAll("coords coord")].map(coordinate => {
            const range = document.createRange();
            range.selectNodeContents(coordinate);
            const rect = range.getBoundingClientRect();
            return {
              label: coordinate.textContent!,
              isFile: coordinate.parentElement!.classList.contains("files"),
              left: rect.left - boardRect.left,
              right: rect.right - boardRect.left,
              top: rect.top - boardRect.top,
              bottom: rect.bottom - boardRect.top,
              squareSize: boardRect.width / 8,
            };
          });
        });
        expect(coordinates).toHaveLength(16);
        for (const coordinate of coordinates) {
          const { label, isFile, left, right, top, bottom, squareSize } = coordinate;
          const ordinal = isFile ? label.charCodeAt(0) - "a".charCodeAt(0) : Number(label) - 1;
          const squareIndex = isFile
            ? orientation === "white" ? ordinal : 7 - ordinal
            : orientation === "black" ? ordinal : 7 - ordinal;
          const column = isFile ? squareIndex : 0;
          const row = isFile ? 7 : squareIndex;
          const description = `${viewport.width}px ${theme} ${orientation}: ${label}`;
          expect(left, description).toBeGreaterThan(column * squareSize);
          expect(right, description).toBeLessThan((column + 1) * squareSize);
          expect(top, description).toBeGreaterThan(row * squareSize);
          expect(bottom, description).toBeLessThan((row + 1) * squareSize);
        }
      }
    }
  }
});
