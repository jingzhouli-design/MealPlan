import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const out = "C:/Users/Jingzhou/AppData/Local/Temp";
const { server, url } = await startServer();
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  await desktop.addInitScript(() => localStorage.clear());
  await desktop.goto(url);
  await desktop.getByRole("heading", { name: "MealPlan" }).waitFor();
  await desktop.screenshot({ path: `${out}/mealplan-meals.png` });
  await desktop.getByRole("button", { name: "Select Wednesday" }).click();
  await desktop.getByRole("button", { name: "Add Kung Pao Chicken to Wednesday" }).click();
  await desktop.getByRole("button", { name: "Add Tomato and Egg Stir-fry to Wednesday" }).click();
  await desktop.getByRole("button", { name: "Select Thursday" }).click();
  await desktop.getByRole("button", { name: "Add Frozen Pork Dumplings to Thursday" }).click();
  await desktop.screenshot({ path: `${out}/mealplan-planned.png` });
  await desktop.getByRole("tab", { name: "Ingredients" }).click();
  await desktop.screenshot({ path: `${out}/mealplan-by-dish.png` });
  await desktop.getByRole("button", { name: "Shopping list" }).click();
  await desktop.screenshot({ path: `${out}/mealplan-shopping.png` });
  await desktop.getByRole("button", { name: "By day" }).click();
  await desktop.screenshot({ path: `${out}/mealplan-by-day.png` });
  await desktop.getByRole("tab", { name: "Meals" }).click();
  await desktop.getByRole("button", { name: "New meal" }).click();
  await desktop.locator("#meal-name").waitFor();
  await desktop.screenshot({ path: `${out}/mealplan-dialog.png` });
  await desktop.getByRole("button", { name: "Cancel" }).click();
  await desktop.getByRole("button", { name: "Favorites", exact: true }).click();
  await desktop.screenshot({ path: `${out}/mealplan-favorites.png` });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.addInitScript(() => localStorage.clear());
  await mobile.goto(url);
  await mobile.getByRole("heading", { name: "MealPlan" }).waitFor();
  await mobile.screenshot({ path: `${out}/mealplan-mobile.png` });
  await mobile.screenshot({ path: `${out}/mealplan-mobile-full.png`, fullPage: true });
  await mobile.close();
  console.log("shots saved");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
