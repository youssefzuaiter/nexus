import { test, expect, type Page } from "@playwright/test";

/**
 * Assertions read `main`, never `body`. `body.textContent` includes script
 * contents — among them Next's RSC flight payload, which retains props of
 * pages visited earlier in the session, so a deleted item can appear to still
 * be listed. `innerText` also returns rendered text, so anything styled
 * uppercase comes back uppercased; match case-insensitively.
 */
function main(page: Page) {
  return page.locator("main");
}

async function mainText(page: Page): Promise<string> {
  return (await main(page).innerText()).toLowerCase();
}

test("dashboard greets the signed-in user", async ({ page }) => {
  await page.goto("/");
  await expect(main(page).getByRole("heading", { level: 1 })).toContainText(
    /e2e/i,
  );
});

test("a note can be written, read back as Markdown, and found again", async ({
  page,
}) => {
  const title = `Gradient descent ${Date.now()}`;

  await page.goto("/notes/new");
  await page.fill('input[name="title"]', title);
  await page.fill(
    'textarea[name="content"]',
    "# Heading\n\nGradient descent steps against the gradient.\n\n- learning rate\n- convergence\n",
  );
  // The dashboard shell puts <aside> before <main>, so a bare
  // button[type=submit] selector would hit the sidebar's sign-out button.
  await main(page).getByRole("button", { name: /create note/i }).click();

  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);

  // Reading view renders Markdown rather than showing raw text.
  await expect(main(page).getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect(main(page).getByRole("listitem").first()).toContainText(
    "learning rate",
  );

  await page.goto("/notes");
  expect(await mainText(page)).toContain(title.toLowerCase());
});

test("editing a note records a restorable version", async ({ page }) => {
  const title = `Versioned ${Date.now()}`;

  await page.goto("/notes/new");
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="content"]', "The original wording.");
  await main(page).getByRole("button", { name: /create note/i }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);

  const noteUrl = page.url();

  await main(page).getByRole("button", { name: /^edit$/i }).click();
  await page.fill('textarea[name="content"]', "Overwritten by accident.");
  await main(page).getByRole("button", { name: /save changes/i }).click();
  await expect(main(page)).toContainText(/saved/i);

  await page.goto(`${noteUrl}/history`);
  expect(await mainText(page)).toContain("restore");

  page.once("dialog", (dialog) => dialog.accept());
  await main(page).getByRole("button", { name: /restore/i }).first().click();

  await page.waitForURL(noteUrl);
  expect(await mainText(page)).toContain("the original wording");
});

test("a task can be created, tagged, and completed", async ({ page }) => {
  const title = `Read chapter ${Date.now()}`;

  await page.goto("/tasks");
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="tags"]', "e2e-tag");
  await main(page).getByRole("button", { name: /add task|create task/i }).click();

  await expect(main(page)).toContainText(title);
  expect(await mainText(page)).toContain("e2e-tag");

  // The tag filter narrows to it.
  await page.goto("/tasks?tag=e2e-tag");
  await expect(main(page)).toContainText(title);
});

test("the trash restores a deleted note", async ({ page }) => {
  const title = `Doomed ${Date.now()}`;

  await page.goto("/notes/new");
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="content"]', "Delete me and bring me back.");
  await main(page).getByRole("button", { name: /create note/i }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);

  await main(page).getByRole("button", { name: /^edit$/i }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await main(page).getByRole("button", { name: /delete/i }).click();

  await page.waitForURL(/\/notes$/);
  expect(await mainText(page)).not.toContain(title.toLowerCase());

  await page.goto("/trash");
  await expect(main(page)).toContainText(title);
  await main(page)
    .getByRole("listitem")
    .filter({ hasText: title })
    .getByRole("button", { name: /restore/i })
    .click();

  await expect(main(page)).not.toContainText(title);
  await page.goto("/notes");
  expect(await mainText(page)).toContain(title.toLowerCase());
});

test("a course computes what is needed on the remaining work", async ({
  page,
}) => {
  const code = `E2E${Date.now().toString().slice(-5)}`;

  await page.goto("/courses");
  await page.fill('input[name="code"]', code);
  await page.fill('input[name="title"]', "Test Course");
  await main(page).getByRole("button", { name: /add course/i }).click();

  await main(page).getByRole("link", { name: new RegExp(code) }).click();
  await page.waitForURL(/\/courses\/[0-9a-f-]{36}$/);

  await page.fill('input[name="title"]', "Midterm");
  await page.fill('input[name="weight"]', "30");
  await page.fill('input[name="score"]', "72");
  await main(page).getByRole("button", { name: /add assessment/i }).click();

  await expect(main(page)).toContainText("Midterm");
  // 30% of the course banked at 72% = 21.6 points, average 72%.
  expect(await mainText(page)).toContain("72.0%");
});

test("navigation reaches every section", async ({ page }) => {
  for (const [path, heading] of [
    ["/search", /search/i],
    ["/cards", /cards/i],
    ["/review", /weekly review/i],
    ["/courses", /courses/i],
    ["/settings", /settings/i],
    ["/trash", /trash/i],
    ["/calendar/subscriptions", /imported calendars/i],
  ] as const) {
    await page.goto(path);
    await expect(
      main(page).getByRole("heading", { level: 1 }),
      `heading on ${path}`,
    ).toHaveText(heading);
  }
});
