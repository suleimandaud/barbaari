import { expect, test, type Page } from "@playwright/test";

async function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("WebSocket connection to 'ws://127.0.0.1:5174/' failed")) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /barbaari platform admin/i })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("super@barbaari.test");
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^platform$/i })).toBeVisible();
}

test("logged-out protected routes redirect to login", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.getByRole("heading", { name: /barbaari platform admin/i })).toBeVisible();
});

test("super admin can log in and open core platform pages without blank screens", async ({ page }) => {
  const errors = await trackConsoleErrors(page);
  await login(page);

  // Sidebar labels from the 2026 redesign (grouped navigation).
  const sidebar = page.getByRole("complementary", { name: "Main navigation" });
  for (const item of [
    { link: "Organizations", heading: /^organizations$/i },
    { link: "Pricing plans", heading: /pricing plans/i },
    { link: "Global users", heading: /global users/i },
    { link: "Support", heading: /support tickets/i },
    { link: "Settings", heading: /platform settings/i }
  ]) {
    await sidebar.getByRole("link", { name: item.link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
  }

  expect(errors).toEqual([]);
});
