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
  await expect(page.getByRole("heading", { name: /daycare sign in/i })).toBeVisible();
  await page.getByPlaceholder("Email").fill("admin@littlelantern.test");
  await page.getByPlaceholder("Password").fill("Password123!");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: /attendance dashboard/i })).toBeVisible();
}

test("logged-out protected routes redirect to login", async ({ page }) => {
  await page.goto("/children");
  await expect(page.getByRole("heading", { name: /daycare sign in/i })).toBeVisible();
});

test("admin can log in and open core daycare pages without blank screens", async ({ page }) => {
  const errors = await trackConsoleErrors(page);
  await login(page);

  for (const item of [
    { link: "Children", heading: /children/i },
    { link: "Attendance Operations", heading: /attendance operations/i },
    { link: "Guardians / Authorized Pickups", heading: /guardians/i },
    { link: "Classrooms", heading: /classrooms/i },
    { link: "Staff Access", heading: /staff/i },
    { link: "Attendance Audit Logs", heading: /attendance audit logs/i },
    { link: "Attendance Reports", heading: /attendance reports/i },
    { link: "Devices / Tablets", heading: /devices/i }
  ]) {
    await page.getByRole("link", { name: new RegExp(item.link, "i") }).click();
    await expect(page.getByRole("heading", { name: item.heading }).first()).toBeVisible();
  }

  expect(errors).toEqual([]);
});
