import { expect, test, type Page } from "@playwright/test";

const appUrl = "/";
const firstFen = "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1";
const secondFen = "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1";

type MutableSolutionPosition = {
  fen?: string;
  turn?: string;
  moves: MutableSolutionMove[];
};

type MutableSolutionMove = {
  uci: string;
  children: MutableSolutionPosition[];
};

type SolutionUpdatePayload = {
  collection?: string;
  solutions?: Array<{
    fen?: string;
    tree?: {
      fen?: string;
      sideToSolve?: string;
      status?: string;
      source?: string;
      root?: MutableSolutionPosition;
    };
  }>;
};

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
  await mockCollections(page);
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

function solutionDoc(lines: string[][]) {
  const root: MutableSolutionPosition = {
    fen: firstFen,
    turn: "b",
    moves: [],
  };

  for (const line of lines) {
    let position = root;

    for (const uci of line) {
      let move = position.moves.find(candidate => candidate.uci === uci);

      if (!move) {
        move = {
          uci,
          children: [{ moves: [] }],
        };
        position.moves.push(move);
      }

      position = move.children[0];
    }
  }

  return {
    fen: firstFen,
    sideToSolve: "b",
    status: "solved",
    root,
  };
}

async function mockSolution(page: Page, lines: string[][]) {
  await page.route("**/v1/solution/**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(solutionDoc(lines)),
    }),
  );
}

async function mockCollections(page: Page) {
  await page.route("**/v1/collections", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        collections: [
          {
            slug: "woodpecker",
            name: "Woodpecker",
            description: "2 positions loaded from the Woodpecker deck.",
            fens: [firstFen, secondFen],
          },
        ],
      }),
    }),
  );
}

test("renders the deck grid and opens a deck", async ({ page }) => {
  await mockCollections(page);
  await page.goto(appUrl);

  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Woodpecker/ })).toBeVisible();

  await page.getByRole("button", { name: /Woodpecker/ }).click();

  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByText("2 positions available")).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Position 2", exact: true })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toHaveCount(0);
});

test("opens a position from a deck and moves between position views", async ({ page }) => {
  await openWoodpeckerDeck(page);
  await expect(page).toHaveURL(/#\/decks\/woodpecker$/);

  await page.getByRole("button", { name: "Position 1", exact: true }).click();

  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/1$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - 1" })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(page.locator("piece")).not.toHaveCount(0);

  await expect(page.getByRole("button", { name: "Previous position" })).toBeDisabled();
  await page.getByRole("button", { name: "Next position" }).click();
  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/2$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - 2" })).toBeVisible();

  await page.getByRole("button", { name: "Previous position" }).click();
  await expect(page).toHaveURL(/#\/decks\/woodpecker\/positions\/1$/);
  await expect(page.getByRole("heading", { name: "Woodpecker - 1" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Woodpecker - 1" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible();
});

test("lets the user play both sides without flipping the board", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const board = page.getByLabel("Chess position");
  await expect(board).toHaveClass(/orientation-black/);

  await dragMove(page, "f4", "d3", "black");

  await expect(board).toHaveClass(/orientation-black/);

  await dragMove(page, "e1", "e2", "black");

  await expect(board).toHaveClass(/orientation-black/);
});

test("syncs notation with board moves, arrows, and clicks", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const notation = page.getByLabel("Move notation");
  await expect(notation).toContainText("No moves yet");

  await dragMove(page, "f4", "d3", "black");
  const humanMove = notation.getByRole("button", { name: "Nd3" });
  await expect(humanMove).toBeVisible();

  await dragMove(page, "e1", "e2", "black");

  const replyMove = notation.getByRole("button", { name: "Re2" });
  await expect(replyMove).toBeVisible();

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

  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await expect(notation.getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e2", "black");

  const mainlineMove = notation.getByRole("button", { name: "Nd3" });
  const mainlineReply = notation.getByRole("button", { name: "Re2" });
  await expect(mainlineMove).toBeVisible();
  await expect(mainlineReply).toBeVisible();

  await page.getByRole("button", { name: "First move" }).click();

  await dragMove(page, "f4", "e2", "black");

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

test("deleting a move removes it and its user-entered continuation", async ({ page }) => {
  await openWoodpeckerPosition(page);

  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await expect(notation.getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e2", "black");
  await expect(notation.locator(".notation-move")).toHaveCount(2);

  const humanMove = notation.getByRole("button", { name: "Nd3" });
  const replyMove = notation.getByRole("button", { name: "Re2" });
  await replyMove.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();

  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(notation.locator(".notation-move")).toHaveCount(1);
  await expect(humanMove).toHaveAttribute("aria-current", "step");

  await dragMove(page, "e1", "e3", "black");

  await expect(notation.getByRole("button", { name: "Re3" })).toBeVisible();
  await expect(notation.locator(".notation-move")).toHaveCount(2);
});

test("submits a correct line and shows a 100 percent review", async ({ page }) => {
  await mockSolution(page, [["f4d3", "e1e2"]]);
  await openWoodpeckerPosition(page);

  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await expect(notation.getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e2", "black");
  await expect(notation.getByRole("button", { name: "Re2" })).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("100%")).toBeVisible();
  await expect(notation.getByRole("button", { name: "Nd3" })).toBeVisible();
  await expect(notation.getByRole("button", { name: "Re2" })).toBeVisible();
  await expect(notation.locator(".notation-move.is-review-solution-missing")).toHaveCount(0);
  await expect(notation.locator(".notation-move.is-review-user-extra")).toHaveCount(0);
});

test("updates the stored solution from the edited move tree after submit", async ({ page }) => {
  let storedSolution = solutionDoc([["f4d3", "e1e2"]]);
  await page.route("**/v1/solution/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(storedSolution),
  }));

  let updatePayload:
    | {
        collection?: string;
        solutions?: Array<{
          fen?: string;
          tree?: {
            fen?: string;
            sideToSolve?: string;
            status?: string;
            source?: string;
            root?: MutableSolutionPosition;
          };
        }>;
      }
    | undefined;

  await page.route("**/v1/solver/solutions", async route => {
    updatePayload = route.request().postDataJSON();
    storedSolution = updatePayload?.solutions?.[0]?.tree as ReturnType<typeof solutionDoc>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stored: 1 }),
    });
  });

  await openWoodpeckerPosition(page);

  await expect(page.getByRole("button", { name: "Save solution" })).toHaveCount(0);

  await dragMove(page, "f4", "d3", "black");
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e3", "black");
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Re3" })).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();

  const updateButton = page.getByRole("button", { name: "Save solution" });
  await expect(updateButton).toBeVisible();

  await page.getByLabel("Move notation").getByRole("button", { name: "Re3" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await page.getByLabel("Move notation").getByRole("button", { name: "Nd3" }).click();
  await dragMove(page, "e1", "e2", "black");
  await updateButton.click();

  await expect(page.getByText("Solution saved")).toBeVisible();
  await expect.poll(() => updatePayload).toBeTruthy();

  const solution = updatePayload?.solutions?.[0];
  const rootMove = solution?.tree?.root?.moves[0];
  const replyMoves = rootMove?.children[0]?.moves.map(move => move.uci);

  expect(updatePayload?.collection).toBe("woodpecker");
  expect(solution?.fen).toBe(firstFen);
  expect(solution?.tree?.fen).toBe(firstFen);
  expect(solution?.tree?.sideToSolve).toBe("b");
  expect(solution?.tree?.status).toBe("solved");
  expect(solution?.tree?.source).toBe("manual");
  expect(rootMove?.uci).toBe("f4d3");
  expect(replyMoves).toContain("e1e2");
  expect(replyMoves).not.toContain("e1e3");

  await page.reload();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Re2" })).toBeVisible();
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Re3" })).toHaveCount(0);
});

test("submits a wrong continuation and shows neutral extra analysis plus a blue missing solution move", async ({ page }) => {
  await mockSolution(page, [["f4d3", "e1e2"]]);
  await openWoodpeckerPosition(page);

  const notation = page.getByLabel("Move notation");

  await dragMove(page, "f4", "d3", "black");
  await expect(notation.getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e3", "black");
  await expect(notation.getByRole("button", { name: "Re3" })).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();

  const wrongMove = notation.getByRole("button", { name: "Re3" });
  const solutionMove = notation.getByRole("button", { name: "Re2" });

  await expect(page.getByText("50%")).toBeVisible();
  await expect(wrongMove).toHaveClass(/is-review-user-extra/);
  await expect(wrongMove).toHaveAttribute("aria-description", "Extra analysis — no score penalty");
  await expect(solutionMove).toHaveClass(/is-review-solution-missing/);

  await solutionMove.click();
  await expect(solutionMove).toHaveAttribute("aria-current", "step");
});

test("deleting extra analysis clears the score and does not credit revealed moves on resubmit", async ({ page }) => {
  await mockSolution(page, [["f4d3", "e1e2"]]);
  await openWoodpeckerPosition(page);
  await dragMove(page, "f4", "d3", "black");
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Nd3" })).toBeVisible();
  await dragMove(page, "e1", "e3", "black");
  await expect(page.getByLabel("Move notation").getByRole("button", { name: "Re3" })).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("50% coverage")).toBeVisible();
  await page.getByLabel("Move notation").getByRole("button", { name: "Re3" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("50% coverage")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("50% coverage")).toBeVisible();
  await page.getByLabel("Move notation").getByRole("button", { name: "Nd3" }).click();
  await dragMove(page, "e1", "e2", "black");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("100% coverage")).toBeVisible();
});

test("provisional engine solutions show a warning and review reasons with their score", async ({ page }) => {
  await page.route("**/v1/solution/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...solutionDoc([["f4d3"]]), status: "needs_review", quality: { reviewReasons: ["max_seconds", "unrecognized_reason"] } }),
  }));
  await openWoodpeckerPosition(page);
  await dragMove(page, "f4", "d3", "black");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Provisional solution — engine analysis needs review.")).toBeVisible();
  await expect(page.getByText("100% coverage (provisional)")).toBeVisible();
  await page.getByText("Why this solution needs review").click();
  await expect(page.getByText("Analysis time limit reached")).toBeVisible();
  await expect(page.getByText("unrecognized reason")).toBeVisible();
});

test("an empty solution cannot show a passing score", async ({ page }) => {
  await mockSolution(page, []);
  await openWoodpeckerPosition(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/saved solution has no moves to score/)).toBeVisible();
  await expect(page.locator(".solution-score")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save solution" })).toBeDisabled();
});

test("submit shows an error and allows creating an update when no solution is available", async ({ page }) => {
  let updatePayload: SolutionUpdatePayload | undefined;

  await page.route("**/v1/solution/**", route =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Solution not found" }),
    }),
  );
  await page.route("**/v1/solver/solutions", async route => {
    updatePayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stored: 1 }),
    });
  });
  await openWoodpeckerPosition(page);

  await dragMove(page, "f4", "d3", "black");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("No solution found for this position.")).toBeVisible();
  await expect(page.getByText(/\d+%/)).toHaveCount(0);

  await page.getByRole("button", { name: "Save solution" }).click();

  await expect(page.getByText("Solution saved")).toBeVisible();
  await expect.poll(() => updatePayload).toBeTruthy();

  const solution = updatePayload?.solutions?.[0];
  const rootMove = solution?.tree?.root?.moves[0];

  expect(updatePayload?.collection).toBe("woodpecker");
  expect(solution?.fen).toBe(firstFen);
  expect(solution?.tree?.fen).toBe(firstFen);
  expect(solution?.tree?.sideToSolve).toBe("b");
  expect(solution?.tree?.status).toBe("solved");
  expect(rootMove?.uci).toBe("f4d3");
});
