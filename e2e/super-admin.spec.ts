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
  await expect(page.getByRole("heading", { name: /platform admin sign in/i })).toBeVisible();
  await page.getByPlaceholder("Email").fill("super@barbaari.test");
  await page.getByPlaceholder("Password").fill("Password123!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: /saas platform command center/i })).toBeVisible();
}

test("logged-out protected routes redirect to login", async ({ page }) => {
  await page.goto("/organizations");
  await expect(page.getByRole("heading", { name: /platform admin sign in/i })).toBeVisible();
});

test("super admin can log in and open core platform pages without blank screens", async ({ page }) => {
  const errors = await trackConsoleErrors(page);
  await login(page);

  for (const item of [
    { link: "Organizations", heading: /^organizations$/i },
    { link: "Pricing Plans", heading: /pricing plans/i },
    { link: "Global Users", heading: /global users/i },
    { link: "Support", heading: /support tickets/i },
    { link: "Settings", heading: /platform settings/i }
  ]) {
    await page.getByRole("link", { name: new RegExp(item.link, "i") }).click();
    await expect(page.getByRole("heading", { name: item.heading }).first()).toBeVisible();
  }

  expect(errors).toEqual([]);
});
