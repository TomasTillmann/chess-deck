import { expect, test } from "@playwright/test";

test("renders the chess board", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Woodpecker" })).toBeVisible();
  await expect(page.getByLabel("Chess position")).toBeVisible();
  await expect(page.locator("piece")).not.toHaveCount(0);
});
