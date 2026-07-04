import { expect, test, type Page } from "@playwright/test";

const appUrl = "/";

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

async function openWoodpeckerDeck(page: Page) {
  await page.goto(appUrl);
  await page.getByRole("button", { name: /Woodpecker/ }).click();
}

async function openWoodpeckerPosition(page: Page, positionNumber = 1) {
  await openWoodpeckerDeck(page);
  await page.getByRole("button", { name: `Position ${positionNumber}`, exact: true }).click();
}

async function dragMove(page: Page, squareFrom: string, squareTo: string, orientation: "white" | "black") {
  const board = page.getByLabel("Chess position");
  const box = await board.boundingBox();
  if (!box) throw new Error("Could not find the chess board bounds.");

  const from = squarePoint(box, squareFrom, orientation);
  const to = squarePoint(box, squareTo, orientation);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test("renders the deck grid and opens a deck", async ({ page }) => {
  await page.goto(appUrl);

  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Woodpecker/ })).toBeVisible();

  await page.getByRole("button", { name: /Woodpecker/ }).click();

  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByText("1128 positions available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 2", exact: true })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toHaveCount(0);
});

test("opens a position from a deck and moves between position views", async ({ page }) => {
  await openWoodpeckerDeck(page);
  await expect(page).toHaveURL(/#\/decks\/woodpecker$/);

  await page.getByRole("button", { name: "Position 1", exact: true }).click();

  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/1$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - Position 1" })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(page.locator("piece")).not.toHaveCount(0);

  await expect(page.getByRole("button", { name: "Previous position" })).toBeDisabled();
  await page.getByRole("button", { name: "Next position" }).click();
  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/2$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - Position 2" })).toBeVisible();

  await page.getByRole("button", { name: "Previous position" }).click();
  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/1$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - Position 1" })).toBeVisible();
});

test("navigates between decks and solver", async ({ page }) => {
  await openWoodpeckerPosition(page);

  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/1$/);
  await page.getByRole("button", { name: "Go to deck", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Go to decks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Woodpecker - Position 1" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
});

test("lets the user play both sides without flipping the board", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const status = page.locator(".position-header p");
  const board = page.getByLabel("Chess position");
  await expect(status).toHaveText("Black to move");
  await expect(board).toHaveClass(/orientation-black/);

  await dragMove(page, "f4", "d3", "black");

  await expect(status).toHaveText("White to move");
  await expect(board).toHaveClass(/orientation-black/);

  await dragMove(page, "e1", "e2", "black");

  await expect(status).toHaveText("Black to move");
  await expect(board).toHaveClass(/orientation-black/);
});

test("syncs notation with board moves, arrows, and clicks", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const status = page.locator(".position-header p");
  const notation = page.getByLabel("Move notation");
  await expect(notation).toContainText("No moves yet");

  await dragMove(page, "f4", "d3", "black");
  await dragMove(page, "e1", "e2", "black");

  const humanMove = notation.getByRole("button", { name: "Nd3" });
  const replyMove = notation.getByRole("button", { name: "Re2" });
  await expect(humanMove).toBeVisible();
  await expect(replyMove).toBeVisible();
  await expect(status).toHaveText("Black to move");

  await page.keyboard.press("ArrowLeft");
  await expect(humanMove).toHaveAttribute("aria-current", "step");
  await expect(replyMove).not.toHaveAttribute("aria-current", "step");

  await page.keyboard.press("ArrowRight");
  await expect(replyMove).toHaveAttribute("aria-current", "step");

  await humanMove.click();
  await expect(humanMove).toHaveAttribute("aria-current", "step");
  await expect(replyMove).not.toHaveAttribute("aria-current", "step");
});

test("keeps the mainline when a sideline starts from an earlier position", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const status = page.locator(".position-header p");
  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await dragMove(page, "e1", "e2", "black");
  await expect(status).toHaveText("Black to move");

  const mainlineMove = notation.getByRole("button", { name: "Nd3" });
  const mainlineReply = notation.getByRole("button", { name: "Re2" });
  await expect(mainlineMove).toBeVisible();
  await expect(mainlineReply).toBeVisible();

  await page.getByRole("button", { name: "First move" }).click();
  await expect(status).toHaveText("Viewing start");

  await dragMove(page, "f4", "e2", "black");
  await expect(status).toHaveText("White to move");

  const sidelineMove = notation.getByRole("button", { name: "Ne2" });
  await expect(mainlineMove).toBeVisible();
  await expect(mainlineReply).toBeVisible();
  await expect(sidelineMove).toBeVisible();
  await expect(sidelineMove).toHaveAttribute("aria-current", "step");
  await expect(notation.locator(".notation-variations")).toContainText("Ne2");
  await expect(notation.locator(".notation-move")).toHaveCount(3);

  await mainlineMove.click();
  await expect(mainlineMove).toHaveAttribute("aria-current", "step");
  await expect(sidelineMove).not.toHaveAttribute("aria-current", "step");
});

test("resetting a move removes its user-entered continuation", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const status = page.locator(".position-header p");
  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await dragMove(page, "e1", "e2", "black");
  await expect(status).toHaveText("Black to move");
  await expect(notation.locator(".notation-move")).toHaveCount(2);

  const humanMove = notation.getByRole("button", { name: "Nd3" });
  await humanMove.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();

  await page.getByRole("menuitem", { name: "Reset here" }).click();

  await expect(status).toHaveText("White to move");
  await expect(notation.locator(".notation-move")).toHaveCount(1);
  await expect(humanMove).toHaveAttribute("aria-current", "step");

  await dragMove(page, "e1", "e3", "black");

  await expect(status).toHaveText("Black to move");
  await expect(notation.getByRole("button", { name: "Re3" })).toBeVisible();
  await expect(notation.locator(".notation-move")).toHaveCount(2);
});
