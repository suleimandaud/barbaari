import { expect, test, type Page } from "@playwright/test";

async function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome to barbaari/i })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("admin@littlelantern.test");
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // The Today page greets the signed-in admin ("Good morning, Amina").
  await expect(page.getByRole("heading", { level: 1, name: /^good (morning|afternoon|evening)/i })).toBeVisible();
}

test("logged-out protected routes redirect to login", async ({ page }) => {
  await page.goto("/children");
  await expect(page.getByRole("heading", { name: /welcome to barbaari/i })).toBeVisible();
});

test("admin can log in and open core daycare pages without blank screens", async ({ page }) => {
  const errors = await trackConsoleErrors(page);
  await login(page);

  // Sidebar labels from the 2026 redesign (grouped navigation).
  const sidebar = page.getByRole("complementary", { name: "Main navigation" });
  for (const item of [
    { link: "Children", heading: /^children$/i },
    { link: "Attendance", heading: /^attendance$/i },
    { link: "Guardians & pickups", heading: /guardians & pickups/i },
    { link: "Classrooms", heading: /^classrooms$/i },
    { link: "Staff access", heading: /^staff access$/i },
    { link: "Audit log", heading: /^audit log$/i },
    { link: "Reports", heading: /^reports$/i },
    { link: "Devices", heading: /^devices$/i }
  ]) {
    await sidebar.getByRole("link", { name: item.link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
  }

  expect(errors).toEqual([]);
});
