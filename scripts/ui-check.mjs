import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium, _electron as electron } from "playwright";
import { startServer } from "./serve.mjs";
import { formatWeekRange, weekKeyFromDate } from "../src/logic.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(pathToFileURL(path.join(root, "package.json")));

const { server, url } = await startServer();
const browser = await chromium.launch({ channel: "msedge", headless: true });

try {
  await checkPage(await openPage(1360, 860), "desktop");
  const mobile = await openPage(390, 844);
  await resetStorage(mobile);
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `mobile overflow ${overflow}`);
  await mobile.getByRole("button", { name: "Select Thursday" }).click();
  await mobile.getByRole("button", { name: "Add Greek Salad to Thursday" }).click();
  assert.equal(
    await mobile.locator('[data-day="thu"] .planned-name').innerText(),
    "Greek Salad"
  );
  await mobile.close();

  await checkElectron();
  console.log("UI check passed");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function openPage(width, height) {
  return browser.newPage({ viewport: { width, height } });
}

async function resetStorage(page) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function checkPage(page, label) {
  await resetStorage(page);
  await page.getByRole("heading", { name: "MealPlan" }).waitFor();

  const text = await page.locator("body").innerText();
  assert.equal(/[\u4e00-\u9fff]/.test(text), false, `${label} has non-English text`);
  assert.equal(await page.locator("[data-day]").count(), 7);
  assert.equal(await page.locator("[data-day]").first().getAttribute("data-day"), "sat");
  assert.equal(await page.locator("#week-label").innerText(), formatWeekRange(weekKeyFromDate()));
  assert.equal(await page.locator(".today-pill:visible").count(), 1);
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  assert.match(await page.locator("#week-relation").innerText(), /Next week/);
  assert.equal(await page.locator(".today-pill:visible").count(), 0);
  await page.getByRole("button", { name: "Previous week" }).click();
  assert.equal(await page.locator(".today-pill:visible").count(), 1);

  const columns = await page.evaluate(() => {
    const week = document.querySelector(".week-panel").getBoundingClientRect();
    const library = document.querySelector('[aria-label="Meal library"]').getBoundingClientRect();
    return { week: week.x, library: library.x };
  });
  assert.ok(columns.week < columns.library, `${label} week should sit on the left`);
  assert.match(await page.locator(".day.selected .day-empty").innerText(), /from the right/);

  const card = page.locator('[data-meal-id="tomato-egg"]');
  assert.equal(
    await card.evaluate((node) => node.lastElementChild.classList.contains("tags")),
    true
  );
  assert.match(await card.locator(".instruction").innerText(), /Egg/);
  await card.locator("h3").click();
  await page.locator("#meal-dialog-title").waitFor();
  assert.equal(await page.locator("#meal-dialog-title").innerText(), "Edit meal");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator("#meal-dialog").waitFor({ state: "hidden" });

  const fits = await page.evaluate(
    () => document.documentElement.scrollHeight <= window.innerHeight + 4
  );
  assert.equal(fits, true, `${label} page should fit the window`);

  await page.getByRole("button", { name: "Select Wednesday" }).click();
  assert.equal(
    await page.locator('[data-day="wed"]').evaluate((el) => el.classList.contains("selected")),
    true
  );
  assert.match(await page.locator("#adding-hint").innerText(), /Wednesday/);

  await page.getByRole("button", { name: "Add Tomato and Egg Stir-fry to Wednesday" }).click();
  await page.getByRole("button", { name: "Add Spinach Omelette to Wednesday" }).click();
  const names = await page.locator('[data-day="wed"] .planned-name').allInnerTexts();
  assert.deepEqual(names, ["Tomato and Egg Stir-fry", "Spinach Omelette"]);
  assert.equal(await page.locator('[data-day="mon"] .planned').count(), 0);

  await page.getByRole("tab", { name: "Ingredients" }).click();
  assert.match(await page.locator("#ingredient-body").innerText(), /Tomato and Egg Stir-fry/);
  assert.match(await page.locator("#ingredient-body").innerText(), /Spinach Omelette/);

  await page.getByRole("button", { name: "Shopping list" }).click();
  const shopping = await page.locator("#ingredient-body").innerText();
  assert.match(shopping, /Egg/);
  assert.match(shopping, /6 pcs/);
  assert.match(shopping, /Produce/);
  assert.match(shopping, /Dairy & Eggs/);

  await page.getByRole("button", { name: "By day" }).click();
  const byDay = await page.locator("#ingredient-body").innerText();
  assert.match(byDay, /Wednesday/);
  assert.match(byDay, /Nothing planned/);
  assert.match(byDay, /6 pcs/);

  await page.getByRole("tab", { name: "Meals" }).click();
  await page.getByRole("button", { name: "Frozen", exact: true }).click();
  const frozen = await page.locator(".meal-card").evaluateAll((cards) =>
    cards.map((card) => card.dataset.frozen)
  );
  assert.ok(frozen.length > 0);
  assert.ok(frozen.every((value) => value === "true"));

  await page.getByRole("button", { name: "All meals" }).click();
  await page.locator("#search").fill("salmon");
  await page.locator('[data-meal-id="salmon"]').waitFor();
  assert.equal(await page.locator(".meal-card").count(), 1);

  await page.locator("#search").fill("");
  await page.getByRole("button", { name: "Chinese", exact: true }).click();
  await page.getByRole("button", { name: "Convenience", exact: true }).click();
  const narrowed = await page.locator(".meal-card").evaluateAll((cards) =>
    cards.map((card) => `${card.dataset.cuisine}:${card.dataset.convenience}`)
  );
  assert.ok(narrowed.length > 0);
  assert.ok(narrowed.every((value) => value === "chinese:true"));

  await page.getByRole("button", { name: "All meals" }).click();
  await page
    .getByRole("button", { name: "Remove Spinach Omelette from Wednesday" })
    .click();
  assert.deepEqual(await page.locator('[data-day="wed"] .planned-name').allInnerTexts(), [
    "Tomato and Egg Stir-fry",
  ]);

  await page.getByRole("button", { name: "Clear week" }).click();
  await page.getByRole("button", { name: "Click again to clear" }).click();
  assert.equal(await page.locator(".planned").count(), 0);

  await page.getByRole("button", { name: "Select Thursday" }).click();
  await page.getByRole("button", { name: "Add Greek Salad to Thursday" }).click();
  await page.getByRole("button", { name: "Copy to next week" }).click();
  assert.match(await page.locator("#week-relation").innerText(), /Next week/);
  assert.equal(await page.locator('[data-day="thu"] .planned-name').innerText(), "Greek Salad");
  await page.getByRole("button", { name: "Previous week" }).click();
  assert.match(await page.locator("#week-relation").innerText(), /This week/);
  assert.equal(await page.locator('[data-day="thu"] .planned-name').innerText(), "Greek Salad");

  await page.getByRole("tab", { name: "Ingredients" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^MealPlan-.+\.png$/);
  const pngPath = await download.path();
  const png = fs.readFileSync(pngPath);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  assert.equal(png[2], 0x4e);
  assert.equal(png[3], 0x47);
  assert.equal(png.readUInt32BE(16), 1240);
  assert.equal(png.readUInt32BE(20), 1754);

  await page.getByRole("tab", { name: "Meals" }).click();
  await page.getByRole("button", { name: "Save Tomato and Egg Stir-fry to favorites" }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await page.getByRole("button", { name: "Chinese", exact: true }).click();
  const favoriteChinese = await page.locator(".meal-card").evaluateAll((cards) =>
    cards.map((card) => `${card.dataset.cuisine}:${card.dataset.favorite}`)
  );
  assert.ok(favoriteChinese.length > 0);
  assert.ok(favoriteChinese.every((value) => value === "chinese:true"));
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  const chineseCount = await page.locator(".meal-card").count();
  assert.ok(chineseCount > favoriteChinese.length);
  await page.getByRole("button", { name: "All meals" }).click();

  await page.getByRole("button", { name: "New meal" }).click();
  await page.locator("#meal-name").fill("Garden Noodle Bowl");
  await page.locator("#meal-cuisine").selectOption("chinese");
  await page.locator("#meal-lunch").check();
  await page.locator("#ingredient-rows [data-field=name]").fill("Noodles");
  await page.locator("#ingredient-rows [data-field=qty]").fill("200");
  await page.locator("#ingredient-rows [data-field=unit]").fill("g");
  await page.locator("#meal-steps").fill("Boil the noodles and toss them with greens.");
  await page.getByRole("button", { name: "Save meal" }).click();
  await page.locator("#meal-dialog").waitFor({ state: "hidden" });
  await page.locator("#search").fill("Garden Noodle Bowl");
  await page.locator(".meal-card h3").waitFor();
  assert.equal(await page.locator(".meal-card").count(), 1);
  assert.equal(await page.locator(".meal-card h3").innerText(), "Garden Noodle Bowl");
  assert.match(await page.locator(".meal-card .tags").innerText(), /Yours/);

  await page.reload();
  await page.getByRole("heading", { name: "MealPlan" }).waitFor();
  await page.locator("#search").fill("Garden Noodle Bowl");
  await page.getByRole("button", { name: "Edit Garden Noodle Bowl" }).click();
  await page.locator("#meal-name").fill("Garden Noodle Bowl Plus");
  await page.locator("#ingredient-rows [data-field=qty]").fill("250");
  await page.getByRole("button", { name: "Save meal" }).click();
  await page.locator("#meal-dialog").waitFor({ state: "hidden" });
  await page.locator("#search").fill("Garden Noodle Bowl Plus");
  await page.locator(".meal-card h3").waitFor();
  assert.equal(await page.locator(".meal-card h3").innerText(), "Garden Noodle Bowl Plus");
  assert.match(await page.locator(".meal-card .instruction").innerText(), /250 g/);
  const stored = await page.evaluate(() => localStorage.getItem("mealplan.v2"));
  assert.match(stored, /Garden Noodle Bowl Plus/);
  await page.close();
}

async function checkElectron() {
  const electronBinary = require("electron");
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [root],
    cwd: root,
  });
  try {
    const window = await app.firstWindow();
    await window.evaluate(() => localStorage.clear());
    await window.reload();
    await window.getByRole("heading", { name: "MealPlan" }).waitFor();
    assert.equal(await window.locator("[data-day]").count(), 7);
    const columns = await window.evaluate(() => {
      const week = document.querySelector(".week-panel").getBoundingClientRect();
      const library = document.querySelector('[aria-label="Meal library"]').getBoundingClientRect();
      return week.x < library.x;
    });
    assert.equal(columns, true);
    await window.getByRole("button", { name: "Copy to next week" }).waitFor();
    await window.getByRole("button", { name: "Favorites", exact: true }).waitFor();
    await window.getByRole("tab", { name: "Ingredients" }).click();
    await window.getByRole("button", { name: "Export PNG" }).waitFor();
    await window.getByRole("tab", { name: "Meals" }).click();
    await window.getByRole("button", { name: "Select Friday" }).click();
    await window.getByRole("button", { name: "Add Lemon Herb Salmon to Friday" }).click();
    assert.equal(
      await window.locator('[data-day="fri"] .planned-name').innerText(),
      "Lemon Herb Salmon"
    );
  } finally {
    await app.close();
  }
}
