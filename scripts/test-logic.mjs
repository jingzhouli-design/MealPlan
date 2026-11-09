import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEALS, MEALS_BY_ID } from "../src/meals.js";
import {
  CATEGORIES,
  emptyPlan,
  emptyFilters,
  toggleFilter,
  mealMatches,
  addMeal,
  removeMeal,
  shoppingList,
  ingredientsByDish,
  ingredientsByDay,
  formatQty,
  plannedCount,
  filtersActive,
  clearCategoryFilters,
  weekKeyFromDate,
  shiftWeekKey,
  formatWeekRange,
  weekRelation,
  clonePlan,
  sanitizeMeal,
  realignMondayWeeks,
  shoppingText,
} from "../src/logic.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("recipes are complete, unique, and English", () => {
  const ids = new Set();
  const flags = {
    chinese: false,
    western: false,
    lunch: false,
    dinner: false,
    both: false,
    quick: false,
    slow: false,
    frozen: false,
    convenience: false,
    convenienceFresh: false,
  };

  for (const meal of MEALS) {
    assert.equal(ids.has(meal.id), false, meal.id);
    ids.add(meal.id);
    assert.ok(["chinese", "western"].includes(meal.cuisine), meal.id);
    assert.ok(["quick", "moderate", "slow"].includes(meal.effort), meal.id);
    assert.ok(meal.meals.length > 0, meal.id);
    assert.equal(meal.serves, 2, meal.id);
    assert.equal(typeof meal.frozen, "boolean");
    assert.equal(typeof meal.convenience, "boolean");
    assert.equal(/[\u4e00-\u9fff]/.test(JSON.stringify(meal)), false, meal.id);
    flags[meal.cuisine] = true;
    if (meal.effort === "quick" || meal.effort === "slow") flags[meal.effort] = true;
    if (meal.meals.includes("lunch")) flags.lunch = true;
    if (meal.meals.includes("dinner")) flags.dinner = true;
    if (meal.meals.includes("lunch") && meal.meals.includes("dinner")) flags.both = true;
    if (meal.frozen) flags.frozen = true;
    if (meal.convenience) flags.convenience = true;
    if (meal.convenience && !meal.frozen) flags.convenienceFresh = true;

    for (const ingredient of meal.ingredients) {
      assert.ok(CATEGORIES.includes(ingredient.category), `${meal.id} ${ingredient.category}`);
      assert.equal(typeof ingredient.qty, "number");
      assert.ok(ingredient.qty > 0);
      assert.ok(ingredient.name);
      assert.ok(ingredient.unit);
    }
    assert.equal(typeof meal.instructions, "string", meal.id);
    assert.ok(meal.instructions.length > 8, meal.id);
  }

  assert.ok(MEALS.length >= 30);
  for (const [key, value] of Object.entries(flags)) assert.equal(value, true, key);
});

test("source files shown to the user stay in English", () => {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "release") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|css|js|mjs|svg|json)$/.test(entry.name)) files.push(full);
    }
  }
  walk(root);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(/[\u4e00-\u9fff]/.test(text), false, file);
  }
});

test("filters combine within a group and across groups", () => {
  const quickChinese = emptyFilters();
  quickChinese.cuisine.add("chinese");
  quickChinese.effort.add("quick");
  assert.equal(mealMatches(MEALS_BY_ID["tomato-egg"], quickChinese, ""), true);
  assert.equal(mealMatches(MEALS_BY_ID.bolognese, quickChinese, ""), false);
  assert.equal(mealMatches(MEALS_BY_ID["beef-noodle"], quickChinese, ""), false);

  const pace = emptyFilters();
  pace.effort.add("quick");
  pace.effort.add("slow");
  assert.equal(mealMatches(MEALS_BY_ID["tomato-egg"], pace, ""), true);
  assert.equal(mealMatches(MEALS_BY_ID["beef-noodle"], pace, ""), true);
  assert.equal(mealMatches(MEALS_BY_ID.bolognese, pace, ""), false);

  const lunch = emptyFilters();
  lunch.meal.add("lunch");
  assert.equal(mealMatches(MEALS_BY_ID["tomato-egg"], lunch, ""), true);
  assert.equal(mealMatches(MEALS_BY_ID["kung-pao"], lunch, ""), false);

  const frozen = emptyFilters();
  frozen.frozen = true;
  frozen.convenience = true;
  assert.equal(mealMatches(MEALS_BY_ID["pork-dumplings"], frozen, ""), true);
  assert.equal(mealMatches(MEALS_BY_ID["tuna-melt"], frozen, ""), false);

  assert.equal(mealMatches(MEALS_BY_ID.salmon, emptyFilters(), "SALMON"), true);
  assert.equal(mealMatches(MEALS_BY_ID.salmon, emptyFilters(), "one pan"), false);
  assert.equal(mealMatches(MEALS_BY_ID.salmon, emptyFilters(), "garlic"), true);
  assert.equal(mealMatches(MEALS_BY_ID["tomato-egg"], emptyFilters(), "one pan"), true);

  const favorites = emptyFilters();
  favorites.favoritesOnly = true;
  const liked = { ...MEALS_BY_ID["tomato-egg"], favorite: true };
  const plain = { ...MEALS_BY_ID.bolognese, favorite: false };
  assert.equal(filtersActive(favorites), false);
  assert.equal(mealMatches(liked, favorites, ""), true);
  assert.equal(mealMatches(plain, favorites, ""), false);
  favorites.cuisine.add("chinese");
  assert.equal(mealMatches(liked, favorites, ""), true);
  assert.equal(mealMatches({ ...MEALS_BY_ID.salmon, favorite: true }, favorites, ""), false);
  const cleared = clearCategoryFilters(favorites);
  assert.equal(cleared.favoritesOnly, true);
  assert.equal(cleared.cuisine.size, 0);
});

test("toggleFilter does not mutate the previous filters", () => {
  const filters = emptyFilters();
  const next = toggleFilter(filters, "cuisine", "chinese");
  assert.equal(filters.cuisine.has("chinese"), false);
  assert.equal(next.cuisine.has("chinese"), true);
  const flagged = toggleFilter(filters, "flag", "frozen");
  assert.equal(flagged.frozen, true);
  assert.equal(filters.frozen, false);
  const favorites = toggleFilter(filters, "flag", "favoritesOnly");
  assert.equal(favorites.favoritesOnly, true);
  assert.equal(filters.favoritesOnly, false);
});

test("quantities format and merge across dishes, days, and repeats", () => {
  assert.equal(formatQty(300, "g"), "300 g");
  assert.equal(formatQty(1.5, "tbsp"), "1.5 tbsp");
  assert.equal(formatQty(0.25, "tsp"), "0.25 tsp");

  let plan = emptyPlan();
  plan = addMeal(plan, "mon", "tomato-egg", "a");
  plan = addMeal(plan, "wed", "omelette", "b");
  assert.equal(plannedCount(plan), 2);

  const shopping = shoppingList(plan, MEALS_BY_ID);
  const eggs = shopping
    .flatMap((group) => group.items)
    .find((item) => item.name === "Egg");
  const tomato = shopping
    .flatMap((group) => group.items)
    .find((item) => item.name === "Tomato");
  assert.equal(eggs.qty, 6);
  assert.equal(eggs.unit, "pcs");
  assert.equal(tomato.qty, 3);
  assert.deepEqual(eggs.dishes.sort(), ["Spinach Omelette", "Tomato and Egg Stir-fry"]);
  assert.deepEqual(
    shopping.map((group) => group.category),
    [...new Set(shopping.map((group) => group.category))].sort(
      (a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b)
    )
  );

  const dishes = ingredientsByDish(plan, MEALS_BY_ID);
  assert.equal(dishes[0].meal.id, "tomato-egg");
  assert.equal(dishes[0].count, 1);

  plan = addMeal(plan, "mon", "tomato-egg", "c");
  const repeated = ingredientsByDish(plan, MEALS_BY_ID).find((item) => item.meal.id === "tomato-egg");
  assert.equal(repeated.count, 2);
  assert.equal(repeated.ingredients.find((item) => item.name === "Egg").qty, 6);
  assert.deepEqual(repeated.days, ["mon"]);

  const byDay = ingredientsByDay(plan, MEALS_BY_ID);
  assert.equal(byDay.find((day) => day.day.id === "mon").meals.length, 2);
  assert.equal(byDay.find((day) => day.day.id === "tue").meals.length, 0);
  assert.equal(
    byDay.find((day) => day.day.id === "mon").ingredients.find((item) => item.name === "Egg").qty,
    6
  );

  const removed = removeMeal(plan, "mon", "a");
  assert.equal(removed.mon.length, 1);
  assert.equal(plan.mon.length, 2);
});

test("weeks start on Saturday and copied plans get new ids", () => {
  const sunday = new Date(2026, 10, 8);
  const friday = new Date(2026, 10, 6);
  assert.equal(sunday.getDay(), 0);
  assert.equal(friday.getDay(), 5);
  assert.equal(weekKeyFromDate(sunday), "2026-11-07");
  assert.equal(weekKeyFromDate(friday), "2026-10-31");
  assert.equal(shiftWeekKey("2026-11-07", 1), "2026-11-14");
  assert.equal(shiftWeekKey("2026-11-07", -1), "2026-10-31");
  assert.equal(formatWeekRange("2026-11-07"), "Nov 7 – Nov 13, 2026");
  assert.equal(weekRelation("2026-11-07", sunday), "This week");
  assert.equal(weekRelation("2026-10-31", sunday), "Last week");
  assert.equal(weekRelation("2026-11-14", sunday), "Next week");
  assert.equal(weekRelation("2026-10-24", sunday), "2 weeks ago");
  assert.equal(weekRelation("2026-11-21", sunday), "In 2 weeks");

  const oldPlans = {
    "2026-11-02": {
      mon: [{ id: "a", mealId: "greek" }],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [{ id: "b", mealId: "salmon" }],
      sun: [],
    },
  };
  const aligned = realignMondayWeeks(oldPlans, { "2026-11-02": ["Produce||Egg||pcs"] });
  assert.equal(aligned.plans["2026-10-31"].mon[0].mealId, "greek");
  assert.equal(aligned.plans["2026-11-07"].sat[0].mealId, "salmon");
  assert.deepEqual(aligned.checks["2026-10-31"], ["Produce||Egg||pcs"]);

  const plan = addMeal(emptyPlan(), "thu", "greek", "keep");
  const copy = clonePlan(plan, () => "fresh");
  assert.equal(copy.thu[0].mealId, "greek");
  assert.equal(copy.thu[0].id, "fresh");
  assert.equal(plan.thu[0].id, "keep");
  assert.equal(copy.mon.length, 0);
});

test("custom meals need a name, a meal time, and a real ingredient", () => {
  assert.equal(sanitizeMeal({ name: "  " }), null);
  assert.equal(
    sanitizeMeal({
      name: "Soup",
      meals: [],
      ingredients: [{ name: "Water", qty: 1, unit: "cup", category: "Pantry" }],
    }),
    null
  );
  assert.equal(
    sanitizeMeal({
      name: "Soup",
      meals: ["dinner"],
      ingredients: [{ name: "Salt", qty: 0, unit: "tsp", category: "Pantry" }],
    }),
    null
  );
  const clean = sanitizeMeal({
    name: " Garden Noodle Bowl ",
    cuisine: "martian",
    meals: ["lunch", "brunch"],
    effort: "speedy",
    minutes: 900,
    emoji: "noodles-please",
    ingredients: [{ name: " Noodles ", qty: 200.004, unit: "g", category: "Nope" }],
    instructions: " Boil the noodles. ",
    custom: true,
  });
  assert.equal(clean.name, "Garden Noodle Bowl");
  assert.equal(clean.cuisine, "western");
  assert.deepEqual(clean.meals, ["lunch"]);
  assert.equal(clean.effort, "moderate");
  assert.equal(clean.minutes, 300);
  assert.equal(clean.emoji, "noodles-");
  assert.equal(clean.serves, 2);
  assert.equal(clean.custom, true);
  assert.equal(clean.instructions, "Boil the noodles.");
  assert.equal(clean.ingredients[0].name, "Noodles");
  assert.equal(clean.ingredients[0].qty, 200);
  assert.equal(clean.ingredients[0].category, "Pantry");
});

test("copied shopping text leaves out ticked items", () => {
  let plan = emptyPlan();
  plan = addMeal(plan, "wed", "tomato-egg", "a");
  const groups = shoppingList(plan, MEALS_BY_ID);
  const keys = groups.flatMap((group) => group.items.map((item) => item.key));
  assert.ok(keys.length > 1);
  const first = groups[0].items[0];
  const text = shoppingText(groups, new Set([first.key]));
  assert.equal(text.includes(`${first.name} —`), false);
  assert.equal(text.includes("[x]"), false);
  const others = keys.length - 1;
  assert.equal((text.match(/^- /gm) || []).length, others);
  assert.match(shoppingText(groups, new Set(keys)), /Everything is ticked off/);
});
