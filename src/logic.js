export const DAYS = [
  { id: "sat", short: "Sat", label: "Saturday" },
  { id: "sun", short: "Sun", label: "Sunday" },
  { id: "mon", short: "Mon", label: "Monday" },
  { id: "tue", short: "Tue", label: "Tuesday" },
  { id: "wed", short: "Wed", label: "Wednesday" },
  { id: "thu", short: "Thu", label: "Thursday" },
  { id: "fri", short: "Fri", label: "Friday" },
];

// Grocery aisles, in the order you walk a typical store.
export const CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy, Eggs & Tofu",
  "Bakery",
  "Rice, Pasta & Noodles",
  "Canned & Dry Goods",
  "Sauces & Condiments",
  "Oils, Spices & Baking",
  "Frozen",
];

const FALLBACK_AISLE = "Canned & Dry Goods";

// Older saves used broader groups; map them onto the aisles above.
const LEGACY_AISLES = {
  Protein: "Meat & Seafood",
  "Dairy & Eggs": "Dairy, Eggs & Tofu",
  Pantry: FALLBACK_AISLE,
  "Sauces & Seasoning": "Sauces & Condiments",
};

const AISLE_BY_NAME = {
  "soft tofu": "Dairy, Eggs & Tofu",
  "firm tofu": "Dairy, Eggs & Tofu",
  tofu: "Dairy, Eggs & Tofu",
  "century egg": "Dairy, Eggs & Tofu",
  rice: "Rice, Pasta & Noodles",
  "cooked rice": "Rice, Pasta & Noodles",
  "egg noodles": "Rice, Pasta & Noodles",
  "wheat noodles": "Rice, Pasta & Noodles",
  macaroni: "Rice, Pasta & Noodles",
  penne: "Rice, Pasta & Noodles",
  spaghetti: "Rice, Pasta & Noodles",
  "all-purpose flour": "Oils, Spices & Baking",
  flour: "Oils, Spices & Baking",
  cornstarch: "Oils, Spices & Baking",
  sugar: "Oils, Spices & Baking",
  "rock sugar": "Oils, Spices & Baking",
  "olive oil": "Oils, Spices & Baking",
  "vegetable oil": "Oils, Spices & Baking",
  "chili flakes": "Oils, Spices & Baking",
  "dried chili": "Oils, Spices & Baking",
  "dried oregano": "Oils, Spices & Baking",
  "ground cumin": "Oils, Spices & Baking",
  paprika: "Oils, Spices & Baking",
  "sichuan pepper": "Oils, Spices & Baking",
  "star anise": "Oils, Spices & Baking",
  "white pepper": "Oils, Spices & Baking",
  "black pepper": "Oils, Spices & Baking",
  salt: "Oils, Spices & Baking",
};

/** Picks the aisle for an ingredient, upgrading old category names. */
export function aisleFor(name, category) {
  if (CATEGORIES.includes(category)) return category;
  if (category in LEGACY_AISLES) {
    const byName = AISLE_BY_NAME[String(name || "").trim().toLowerCase()];
    return byName ?? LEGACY_AISLES[category];
  }
  return FALLBACK_AISLE;
}

const WEEKDAY_TO_ID = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function todayId(date = new Date()) {
  return WEEKDAY_TO_ID[date.getDay()];
}

export function dayById(id) {
  return DAYS.find((day) => day.id === id) ?? DAYS[0];
}

export function emptyPlan() {
  return {
    mon: [],
    tue: [],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  };
}

export function emptyFilters() {
  return {
    cuisine: new Set(),
    meal: new Set(),
    effort: new Set(),
    frozen: false,
    convenience: false,
    favoritesOnly: false,
  };
}

export function filtersActive(filters) {
  return Boolean(
    filters.cuisine.size ||
      filters.meal.size ||
      filters.effort.size ||
      filters.frozen ||
      filters.convenience
  );
}

export function clearCategoryFilters(filters) {
  return {
    ...emptyFilters(),
    favoritesOnly: Boolean(filters.favoritesOnly),
  };
}

export function toggleFilter(filters, group, value) {
  const next = {
    cuisine: new Set(filters.cuisine),
    meal: new Set(filters.meal),
    effort: new Set(filters.effort),
    frozen: filters.frozen,
    convenience: filters.convenience,
    favoritesOnly: filters.favoritesOnly,
  };

  if (group === "flag") {
    next[value] = !next[value];
    return next;
  }

  if (next[group].has(value)) next[group].delete(value);
  else next[group].add(value);
  return next;
}

export function mealMatches(meal, filters, query) {
  const q = (query ?? "").trim().toLowerCase();
  if (q) {
    const haystack = `${meal.name} ${meal.blurb} ${meal.instructions ?? ""}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filters.favoritesOnly && !meal.favorite) return false;
  if (filters.cuisine.size && !filters.cuisine.has(meal.cuisine)) return false;
  if (filters.meal.size && !meal.meals.some((mealTime) => filters.meal.has(mealTime))) {
    return false;
  }
  if (filters.effort.size && !filters.effort.has(meal.effort)) return false;
  if (filters.frozen && !meal.frozen) return false;
  if (filters.convenience && !meal.convenience) return false;
  return true;
}

export function makeId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addMeal(plan, day, mealId, id = makeId()) {
  return {
    ...plan,
    [day]: [...(plan[day] ?? []), { id, mealId }],
  };
}

export function removeMeal(plan, day, entryId) {
  return {
    ...plan,
    [day]: (plan[day] ?? []).filter((entry) => entry.id !== entryId),
  };
}

export function plannedCount(plan) {
  return DAYS.reduce((total, day) => total + (plan[day.id]?.length ?? 0), 0);
}

export function formatQty(qty, unit) {
  const rounded = Math.round((qty + Number.EPSILON) * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return unit ? `${text} ${unit}` : text;
}

function roundQty(qty) {
  return Math.round((qty + Number.EPSILON) * 100) / 100;
}

function addIngredient(map, ingredient, mealName) {
  const key = `${ingredient.category}||${ingredient.name}||${ingredient.unit}`;
  let row = map.get(key);
  if (!row) {
    row = {
      key,
      name: ingredient.name,
      unit: ingredient.unit,
      category: ingredient.category,
      qty: 0,
      dishes: [],
    };
    map.set(key, row);
  }
  row.qty = roundQty(row.qty + ingredient.qty);
  if (mealName && !row.dishes.includes(mealName)) row.dishes.push(mealName);
  return row;
}

function walkPlan(plan, mealsById, visit) {
  for (const day of DAYS) {
    for (const entry of plan[day.id] ?? []) {
      const meal = mealsById[entry.mealId];
      if (!meal) continue;
      visit(day.id, meal, entry);
    }
  }
}

function groupsFromMap(map) {
  const grouped = new Map();
  for (const row of map.values()) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push(row);
  }

  const ordered = [];
  const seen = new Set();
  for (const category of CATEGORIES) {
    if (!grouped.has(category)) continue;
    seen.add(category);
    ordered.push({
      category,
      items: grouped.get(category).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  for (const [category, items] of grouped) {
    if (seen.has(category)) continue;
    ordered.push({
      category,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return ordered;
}

export function shoppingList(plan, mealsById) {
  const map = new Map();
  walkPlan(plan, mealsById, (_day, meal) => {
    for (const ingredient of meal.ingredients) {
      addIngredient(map, ingredient, meal.name);
    }
  });
  return groupsFromMap(map);
}

export function ingredientsByDish(plan, mealsById) {
  const counts = new Map();
  const dayLists = new Map();
  const order = [];

  walkPlan(plan, mealsById, (day, meal) => {
    if (!counts.has(meal.id)) {
      counts.set(meal.id, 0);
      dayLists.set(meal.id, []);
      order.push(meal.id);
    }
    counts.set(meal.id, counts.get(meal.id) + 1);
    dayLists.get(meal.id).push(day);
  });

  return order.map((id) => {
    const meal = mealsById[id];
    const count = counts.get(id);
    const days = [];
    for (const day of dayLists.get(id)) {
      if (!days.includes(day)) days.push(day);
    }
    return {
      meal,
      count,
      days,
      ingredients: meal.ingredients.map((ingredient) => ({
        ...ingredient,
        qty: roundQty(ingredient.qty * count),
      })),
    };
  });
}

export function ingredientsByDay(plan, mealsById) {
  return DAYS.map((day) => {
    const meals = [];
    const map = new Map();
    for (const entry of plan[day.id] ?? []) {
      const meal = mealsById[entry.mealId];
      if (!meal) continue;
      meals.push({ entryId: entry.id, meal });
      for (const ingredient of meal.ingredients) {
        addIngredient(map, ingredient, meal.name);
      }
    }
    const ingredients = [...map.values()].sort((a, b) => {
      const categoryOrder = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
      if (categoryOrder !== 0) return categoryOrder;
      return a.name.localeCompare(b.name);
    });
    return { day, meals, ingredients };
  });
}

export function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfWeek(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceSaturday = (copy.getDay() + 1) % 7;
  copy.setDate(copy.getDate() - daysSinceSaturday);
  return copy;
}

function addDays(key, days) {
  const date = parseISODate(key);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

function mergeWeekDays(target, source, dayIds) {
  const next = target ?? emptyPlan();
  for (const id of dayIds) {
    next[id] = [...(next[id] ?? []), ...(source[id] ?? [])];
  }
  return next;
}

export function realignMondayWeeks(plans, checks = {}) {
  const nextPlans = {};
  const nextChecks = {};
  const dayIds = DAYS.map((day) => day.id);
  for (const [key, list] of Object.entries(checks ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(list)) continue;
    if (parseISODate(key).getDay() !== 1) nextChecks[key] = list;
  }
  for (const [key, plan] of Object.entries(plans ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (parseISODate(key).getDay() !== 1) {
      nextPlans[key] = mergeWeekDays(nextPlans[key], plan, dayIds);
      continue;
    }
    const early = addDays(key, -2);
    const late = addDays(key, 5);
    nextPlans[early] = mergeWeekDays(nextPlans[early], plan, ["mon", "tue", "wed", "thu", "fri"]);
    nextPlans[late] = mergeWeekDays(nextPlans[late], plan, ["sat", "sun"]);
    const ticks = checks?.[key];
    if (Array.isArray(ticks) && ticks.length) {
      const earlyHas = ["mon", "tue", "wed", "thu", "fri"].some((id) => plan[id]?.length);
      const dest = earlyHas ? early : late;
      nextChecks[dest] = [...(nextChecks[dest] ?? []), ...ticks];
    }
  }
  return { plans: nextPlans, checks: nextChecks };
}

export function weekKeyFromDate(date = new Date()) {
  return formatISODate(startOfWeek(date));
}

export function shiftWeekKey(key, weeks) {
  const date = parseISODate(key);
  date.setDate(date.getDate() + weeks * 7);
  return formatISODate(date);
}

export function formatWeekRange(key) {
  const start = parseISODate(key);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const withYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (start.getFullYear() === end.getFullYear()) {
    return `${monthDay.format(start)} – ${withYear.format(end)}`;
  }
  return `${withYear.format(start)} – ${withYear.format(end)}`;
}

export function weekRelation(key, today = new Date()) {
  const current = weekKeyFromDate(today);
  const diffDays = Math.round((parseISODate(key) - parseISODate(current)) / 86400000);
  const diff = Math.round(diffDays / 7);
  if (diff === 0) return "This week";
  if (diff === -1) return "Last week";
  if (diff === 1) return "Next week";
  if (diff < 0) return `${-diff} weeks ago`;
  return `In ${diff} weeks`;
}

export function clonePlan(plan, idFactory = makeId) {
  const next = emptyPlan();
  for (const day of DAYS) {
    next[day.id] = (plan[day.id] ?? []).map((entry) => ({
      id: idFactory(),
      mealId: entry.mealId,
    }));
  }
  return next;
}

export function normalizePlan(raw) {
  const plan = emptyPlan();
  if (!raw || typeof raw !== "object") return plan;
  for (const day of DAYS) {
    const list = raw[day.id];
    if (!Array.isArray(list)) continue;
    plan[day.id] = list
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.mealId === "string")
      .map((entry) => ({ id: entry.id, mealId: entry.mealId }));
  }
  return plan;
}

export function blankMeal() {
  return {
    id: "",
    name: "",
    blurb: "",
    instructions: "",
    cuisine: "western",
    meals: ["dinner"],
    effort: "moderate",
    minutes: 30,
    frozen: false,
    convenience: false,
    emoji: "🍽️",
    serves: 2,
    ingredients: [{ name: "", qty: 1, unit: "pcs", category: "Produce" }],
    custom: true,
  };
}

export function sanitizeMeal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const meals = Array.isArray(raw.meals)
    ? raw.meals.filter((item) => item === "lunch" || item === "dinner")
    : [];
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map(sanitizeIngredient).filter(Boolean)
    : [];
  if (!ingredients.length || !meals.length) return null;
  const minutes = Number(raw.minutes);
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name,
    blurb: typeof raw.blurb === "string" ? raw.blurb.trim() : "",
    instructions: typeof raw.instructions === "string" ? raw.instructions.trim() : "",
    cuisine: raw.cuisine === "chinese" ? "chinese" : "western",
    meals,
    effort: ["quick", "moderate", "slow"].includes(raw.effort) ? raw.effort : "moderate",
    minutes: Number.isFinite(minutes) ? Math.min(300, Math.max(1, Math.round(minutes))) : 30,
    frozen: Boolean(raw.frozen),
    convenience: Boolean(raw.convenience),
    emoji: typeof raw.emoji === "string" && raw.emoji.trim() ? raw.emoji.trim().slice(0, 8) : "🍽️",
    serves: 2,
    ingredients,
    custom: Boolean(raw.custom),
  };
}

function sanitizeIngredient(raw) {
  if (!raw || typeof raw.name !== "string" || !raw.name.trim()) return null;
  const qty = Number(raw.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const category = aisleFor(raw.name, raw.category);
  const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : "pcs";
  return {
    name: raw.name.trim(),
    qty: Math.round((qty + Number.EPSILON) * 100) / 100,
    unit,
    category,
  };
}

export function shoppingText(groups, checked) {
  if (!groups.length) return "Shopping list\n\nNothing to buy yet.";
  const sections = groups
    .map((group) => ({
      category: group.category,
      items: group.items.filter((item) => !checked?.has(item.key)),
    }))
    .filter((group) => group.items.length);
  if (!sections.length) return "Shopping list\n\nEverything is ticked off.";
  return sections
    .map((group) => {
      const lines = group.items.map(
        (item) => `- ${item.name} — ${formatQty(item.qty, item.unit)}`
      );
      return `${group.category}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
