import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, request }) => {
  await request.post("/__test__/reset");
  await page.goto("/");
});

test("starts a wallet flow, shows QR and link, then reports verified age", async ({ page, request }) => {
  await page.getByRole("button", { name: "Verify age with your wallet" }).click();

  const widget = page.locator("dlbr-age-check");
  await expect(widget).toHaveAttribute("data-state", "pending");
  await expect(widget.locator("img.qr")).toBeVisible();
  await expect(widget.locator("a.wallet-link")).toHaveAttribute("href", /^openid4vp:/);
  await expect(widget.locator(".status")).toContainText("Scan the code");

  await request.post("/__test__/complete?age_over_18=true");
  await expect(widget).toHaveAttribute("data-state", "verified");
  await expect(widget.locator(".status")).toHaveText("Age verified.");
  await expect(page.locator("#result")).toHaveText("Access granted");
});

test("reports an under-18 result without granting access", async ({ page, request }) => {
  await page.getByRole("button", { name: "Verify age with your wallet" }).click();
  const widget = page.locator("dlbr-age-check");
  await expect(widget).toHaveAttribute("data-state", "pending");

  await request.post("/__test__/complete?age_over_18=false");
  await expect(widget).toHaveAttribute("data-state", "denied");
  await expect(widget.locator(".status")).toHaveText("Age not verified.");
  await expect(page.locator("#result")).toHaveText("Access denied");
});

test("shows terminal expiry and lets the user start again", async ({ page, request }) => {
  await page.getByRole("button", { name: "Verify age with your wallet" }).click();
  const widget = page.locator("dlbr-age-check");
  await expect(widget).toHaveAttribute("data-state", "pending");

  await request.post("/__test__/complete");
  await expect(widget).toHaveAttribute("data-state", "expired");
  await expect(widget.locator(".button")).toHaveText("Try age verification again");
});
