import { expect, test } from "@playwright/test";

function squarePoint(box: { x: number; y: number; width: number }, square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const cell = box.width / 8;
  const xIndex = orientation === "white" ? file : 7 - file;
  const yIndex = orientation === "white" ? 7 - rank : rank;

  return {
    x: box.x + (xIndex + 0.5) * cell,
    y: box.y + (yIndex + 0.5) * cell,
  };
}

test("renders the chess board", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(page.locator("piece")).not.toHaveCount(0);
});

test("plays the FEN side against Stockfish without flipping the board", async ({ page }) => {
  await page.goto("/");

  const status = page.locator(".position-header p");
  const board = page.getByLabel("Chess position");
  await expect(status).toHaveText("Your move");
  await expect(board).toHaveClass(/orientation-black/);

  const box = await board.boundingBox();
  if (!box) throw new Error("Could not find the chess board bounds.");

  const from = squarePoint(box, "f4", "black");
  const to = squarePoint(box, "d3", "black");

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();

  await expect(status).toHaveText("Engine thinking", { timeout: 5000 });
  await expect(status).toHaveText("Your move", { timeout: 30000 });
  await expect(board).toHaveClass(/orientation-black/);
});
