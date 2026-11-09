import { MEALS } from "./meals.js";
import { downloadIngredientPng, exportSections } from "./export-png.js";
import {
  DAYS,
  CATEGORIES,
  todayId,
  dayById,
  emptyPlan,
  emptyFilters,
  filtersActive,
  clearCategoryFilters,
  toggleFilter,
  mealMatches,
  addMeal,
  removeMeal,
  makeId,
  shoppingList,
  ingredientsByDish,
  ingredientsByDay,
  formatQty,
  plannedCount,
  shoppingText,
  weekKeyFromDate,
  parseISODate,
  shiftWeekKey,
  formatWeekRange,
  weekRelation,
  clonePlan,
  normalizePlan,
  blankMeal,
  sanitizeMeal,
} from "./logic.js";

const STORAGE_KEY = "mealplan.v2";
const OLD_STORAGE_KEY = "mealplan.v1";
const TODAY = todayId();

const loaded = loadState();
const state = {
  weekKey: loaded.weekKey,
  selectedDay: loaded.selectedDay,
  ingredientView: loaded.ingredientView,
  plans: loaded.plans,
  plan: loaded.plans[loaded.weekKey],
  checks: loaded.checks,
  checked: new Set(loaded.checks[loaded.weekKey] || []),
  favorites: new Set(loaded.favorites),
  customMeals: loaded.customMeals,
  overrides: loaded.overrides,
  tab: loaded.tab,
  filters: emptyFilters(),
  query: "",
  editor: null,
};

let toastTimer = 0;
let clearTimer = 0;
let clearArmed = false;
let copyTimer = 0;
let copyArmed = false;
let deleteTimer = 0;
let deleteArmed = false;

const els = {
  mealsView: document.querySelector("#meals-view"),
  ingredientsView: document.querySelector("#ingredients-view"),
  tabMeals: document.querySelector("#tab-meals"),
  tabIngredients: document.querySelector("#tab-ingredients"),
  ingCount: document.querySelector("#ing-count"),
  addingHint: document.querySelector("#adding-hint"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
  mealCount: document.querySelector("#meal-count"),
  mealGrid: document.querySelector("#meal-grid"),
  days: document.querySelector("#days"),
  viewButtons: document.querySelectorAll("[data-view]"),
  viewBlurb: document.querySelector("#view-blurb"),
  ingredientBody: document.querySelector("#ingredient-body"),
  copyList: document.querySelector("#copy-list"),
  clearTicks: document.querySelector("#clear-ticks"),
  clearWeek: document.querySelector("#clear-week"),
  copyNext: document.querySelector("#copy-next"),
  weekLabel: document.querySelector("#week-label"),
  weekRelation: document.querySelector("#week-relation"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#meal-dialog"),
  form: document.querySelector("#meal-form"),
  dialogTitle: document.querySelector("#meal-dialog-title"),
  mealName: document.querySelector("#meal-name"),
  mealEmoji: document.querySelector("#meal-emoji"),
  mealCuisine: document.querySelector("#meal-cuisine"),
  mealMinutes: document.querySelector("#meal-minutes"),
  mealLunch: document.querySelector("#meal-lunch"),
  mealDinner: document.querySelector("#meal-dinner"),
  mealEffort: document.querySelector("#meal-effort"),
  mealFrozen: document.querySelector("#meal-frozen"),
  mealConvenience: document.querySelector("#meal-convenience"),
  mealBlurb: document.querySelector("#meal-blurb"),
  mealSteps: document.querySelector("#meal-steps"),
  ingredientRows: document.querySelector("#ingredient-rows"),
  formError: document.querySelector("#form-error"),
  deleteMeal: document.querySelector("#delete-meal"),
  resetMeal: document.querySelector("#reset-meal"),
};

buildDays();
bindEvents();
render();

function loadState() {
  const weekKey = weekKeyFromDate();
  const fallback = {
    weekKey,
    selectedDay: TODAY,
    ingredientView: "dish",
    plans: { [weekKey]: emptyPlan() },
    checks: {},
    favorites: [],
    customMeals: [],
    overrides: {},
    tab: "meals",
  };

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(OLD_STORAGE_KEY);
    const data = saved ? JSON.parse(saved) : legacy ? migrateV1(JSON.parse(legacy), weekKey) : null;
    if (!data) return fallback;
    const plans = {};
    if (data.plans && typeof data.plans === "object") {
      for (const [key, plan] of Object.entries(data.plans)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) plans[key] = normalizePlan(plan);
      }
    }
    const selectedWeek = plans[data.weekKey] ? data.weekKey : weekKey;
    if (!plans[selectedWeek]) plans[selectedWeek] = emptyPlan();
    const checks = {};
    if (data.checks && typeof data.checks === "object") {
      for (const [key, list] of Object.entries(data.checks)) {
        if (Array.isArray(list)) checks[key] = list.filter((item) => typeof item === "string");
      }
    }
    return {
      weekKey: selectedWeek,
      selectedDay: DAYS.some((day) => day.id === data.selectedDay) ? data.selectedDay : TODAY,
      ingredientView: ["dish", "shopping", "day"].includes(data.ingredientView)
        ? data.ingredientView
        : "dish",
      plans,
      checks,
      favorites: Array.isArray(data.favorites)
        ? data.favorites.filter((id) => typeof id === "string")
        : [],
      customMeals: Array.isArray(data.customMeals)
        ? data.customMeals.map(sanitizeMeal).filter(Boolean)
        : [],
      overrides: sanitizeOverrides(data.overrides),
      tab: data.tab === "ingredients" ? "ingredients" : "meals",
    };
  } catch {
    return fallback;
  }
}

function migrateV1(data, weekKey) {
  return {
    weekKey,
    selectedDay: data.selectedDay,
    ingredientView: data.ingredientView,
    plans: { [weekKey]: data.plan },
    checks: { [weekKey]: data.checked || [] },
    favorites: [],
    customMeals: [],
    overrides: {},
    tab: data.tab,
  };
}

function sanitizeOverrides(raw) {
  const overrides = {};
  if (!raw || typeof raw !== "object") return overrides;
  for (const [id, meal] of Object.entries(raw)) {
    const clean = sanitizeMeal({ ...meal, id, custom: false });
    if (clean && MEALS.some((item) => item.id === id)) overrides[id] = clean;
  }
  return overrides;
}

function saveState() {
  state.plans[state.weekKey] = state.plan;
  state.checks[state.weekKey] = [...state.checked];
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      weekKey: state.weekKey,
      selectedDay: state.selectedDay,
      ingredientView: state.ingredientView,
      plans: state.plans,
      checks: state.checks,
      favorites: [...state.favorites],
      customMeals: state.customMeals,
      overrides: state.overrides,
      tab: state.tab,
    })
  );
}

function libraryMeals() {
  const meals = MEALS.map((meal) => {
    const override = state.overrides[meal.id];
    const next = override
      ? { ...override, id: meal.id, custom: false }
      : { ...meal, custom: false };
    next.builtin = true;
    next.favorite = state.favorites.has(meal.id);
    next.edited = Boolean(override);
    return next;
  });
  for (const meal of state.customMeals) {
    meals.push({
      ...meal,
      custom: true,
      builtin: false,
      favorite: state.favorites.has(meal.id),
      edited: false,
    });
  }
  return meals;
}

function mealsById() {
  return Object.fromEntries(libraryMeals().map((meal) => [meal.id, meal]));
}

function bindEvents() {
  document.querySelector(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    setTab(tab.dataset.tab);
  });

  els.mealsView.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear-filters]")) {
      clearFilters();
      return;
    }
    const add = event.target.closest("[data-add]");
    if (add) {
      addMealToSelectedDay(add.dataset.add);
      return;
    }
    const fav = event.target.closest("[data-fav]");
    if (fav) {
      toggleFavorite(fav.dataset.fav);
      return;
    }
    const open = event.target.closest("[data-open]");
    if (open) {
      openEditor(open.dataset.open);
      return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      state.filters = toggleFilter(state.filters, filter.dataset.filter, filter.dataset.value);
      renderMeals();
      return;
    }
    const card = event.target.closest(".meal-card");
    if (card && !event.target.closest("button")) openEditor(card.dataset.mealId);
  });

  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    renderMeals();
  });

  document.querySelector("#new-meal").addEventListener("click", () => openEditor(null));
  document.querySelector("#prev-week").addEventListener("click", () => moveWeek(-1));
  document.querySelector("#next-week").addEventListener("click", () => moveWeek(1));
  els.copyNext.addEventListener("click", copyToNextWeek);

  els.days.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      event.stopPropagation();
      removePlannedMeal(remove.dataset.day, remove.dataset.remove);
      return;
    }
    const select = event.target.closest("[data-select], [data-day]");
    if (!select) return;
    const day = select.dataset.select || select.dataset.day;
    if (day) selectDay(day);
  });

  document.querySelector(".view-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    state.ingredientView = button.dataset.view;
    saveState();
    renderIngredients();
  });

  els.ingredientBody.addEventListener("change", (event) => {
    const input = event.target.closest("[data-check]");
    if (!input) return;
    if (input.checked) state.checked.add(input.dataset.check);
    else state.checked.delete(input.dataset.check);
    saveState();
    renderIngredients();
  });

  els.copyList.addEventListener("click", copyShoppingList);
  els.clearTicks.addEventListener("click", () => {
    state.checked = new Set();
    saveState();
    renderIngredients();
    showToast("Ticks cleared");
  });
  document.querySelector("#export-png").addEventListener("click", exportPng);
  els.clearWeek.addEventListener("click", onClearWeek);

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEditor();
  });
  document.querySelector("#add-ingredient").addEventListener("click", () => {
    const meal = readEditorMeal();
    meal.ingredients.push({ name: "", qty: 1, unit: "pcs", category: "Produce" });
    state.editor.meal = meal;
    renderIngredientEditor(meal.ingredients);
  });
  els.deleteMeal.addEventListener("click", deleteEditorMeal);
  els.resetMeal.addEventListener("click", resetEditorMeal);
  els.dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) closeEditor();
  });
  els.ingredientRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-ing]");
    if (!button) return;
    const meal = readEditorMeal();
    meal.ingredients.splice(Number(button.dataset.removeIng), 1);
    if (!meal.ingredients.length) {
      meal.ingredients.push({ name: "", qty: 1, unit: "pcs", category: "Produce" });
    }
    state.editor.meal = meal;
    renderIngredientEditor(meal.ingredients);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.dialog.hidden) closeEditor();
  });
}

function render() {
  setTab(state.tab, { save: false });
  renderMeals();
  renderDays();
  renderIngredients();
  syncChrome();
}

function setTab(tab, options = {}) {
  state.tab = tab === "ingredients" ? "ingredients" : "meals";
  const mealsOn = state.tab === "meals";
  els.mealsView.hidden = !mealsOn;
  els.ingredientsView.hidden = mealsOn;
  els.tabMeals.setAttribute("aria-selected", String(mealsOn));
  els.tabIngredients.setAttribute("aria-selected", String(!mealsOn));
  els.addingHint.hidden = !mealsOn;
  if (options.save !== false) saveState();
  if (!mealsOn) renderIngredients();
}

function selectDay(dayId) {
  if (!DAYS.some((day) => day.id === dayId)) return;
  state.selectedDay = dayId;
  saveState();
  renderDays();
  renderMeals();
  syncChrome();
}

function moveWeek(delta) {
  state.plans[state.weekKey] = state.plan;
  state.checks[state.weekKey] = [...state.checked];
  state.weekKey = shiftWeekKey(state.weekKey, delta);
  if (!state.plans[state.weekKey]) state.plans[state.weekKey] = emptyPlan();
  state.plan = state.plans[state.weekKey];
  state.checked = new Set(state.checks[state.weekKey] || []);
  saveState();
  renderDays();
  renderIngredients();
  syncChrome();
}

function copyToNextWeek() {
  const nextKey = shiftWeekKey(state.weekKey, 1);
  const existing = state.plans[nextKey] || emptyPlan();
  if (plannedCount(state.plan) === 0) {
    showToast("This week is empty");
    return;
  }
  if (plannedCount(existing) > 0 && !copyArmed) {
    copyArmed = true;
    els.copyNext.textContent = "Click again to replace";
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(resetCopyButton, 2500);
    return;
  }
  resetCopyButton();
  state.plans[state.weekKey] = state.plan;
  state.plans[nextKey] = clonePlan(state.plan);
  state.checks[nextKey] = [];
  moveWeek(1);
  showToast(`Copied to ${formatWeekRange(state.weekKey)}`);
}

function resetCopyButton() {
  copyArmed = false;
  window.clearTimeout(copyTimer);
  els.copyNext.textContent = "Copy to next week";
}

function addMealToSelectedDay(mealId) {
  const meal = mealsById()[mealId];
  if (!meal) return;
  state.plan = addMeal(state.plan, state.selectedDay, mealId, makeId());
  state.plans[state.weekKey] = state.plan;
  saveState();
  renderDays();
  renderIngredients();
  syncChrome();
  flashDay(state.selectedDay);
  showToast(`Added ${meal.name} to ${dayById(state.selectedDay).label}`);
}

function removePlannedMeal(dayId, entryId) {
  const entry = (state.plan[dayId] ?? []).find((item) => item.id === entryId);
  const meal = entry ? mealsById()[entry.mealId] : null;
  state.plan = removeMeal(state.plan, dayId, entryId);
  state.plans[state.weekKey] = state.plan;
  saveState();
  renderDays();
  renderIngredients();
  syncChrome();
  if (meal) showToast(`Removed ${meal.name} from ${dayById(dayId).label}`);
}

function toggleFavorite(mealId) {
  if (state.favorites.has(mealId)) state.favorites.delete(mealId);
  else state.favorites.add(mealId);
  saveState();
  renderMeals();
  const meal = mealsById()[mealId];
  showToast(
    state.favorites.has(mealId)
      ? `Saved ${meal?.name ?? "meal"} to favorites`
      : `Removed ${meal?.name ?? "meal"} from favorites`
  );
}

function clearFilters() {
  state.filters = clearCategoryFilters(state.filters);
  state.query = "";
  els.search.value = "";
  renderMeals();
}

function onClearWeek() {
  if (plannedCount(state.plan) === 0) {
    showToast("The week is already empty");
    return;
  }
  if (!clearArmed) {
    clearArmed = true;
    els.clearWeek.textContent = "Click again to clear";
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(resetClearButton, 2500);
    return;
  }
  resetClearButton();
  state.plan = emptyPlan();
  state.plans[state.weekKey] = state.plan;
  state.checked = new Set();
  saveState();
  renderDays();
  renderIngredients();
  syncChrome();
  showToast("Week cleared");
}

function resetClearButton() {
  clearArmed = false;
  window.clearTimeout(clearTimer);
  els.clearWeek.textContent = "Clear week";
}

function syncChrome() {
  const count = plannedCount(state.plan);
  els.ingCount.textContent = String(count);
  const day = dayById(state.selectedDay);
  els.addingHint.replaceChildren();
  els.addingHint.append("Adding to ");
  const strong = document.createElement("strong");
  strong.textContent = day.label;
  els.addingHint.append(strong);
  els.weekLabel.textContent = formatWeekRange(state.weekKey);
  els.weekRelation.textContent = weekRelation(state.weekKey);
}

function renderMeals() {
  const scroll = els.mealsView;
  const scrollTop = scroll.scrollTop;
  const dayLabel = dayById(state.selectedDay).label;
  const visible = libraryMeals().filter((meal) => mealMatches(meal, state.filters, state.query));

  for (const button of els.filters.querySelectorAll("[data-filter]")) {
    const group = button.dataset.filter;
    const value = button.dataset.value;
    const pressed = group === "flag" ? state.filters[value] : state.filters[group].has(value);
    button.setAttribute("aria-pressed", String(Boolean(pressed)));
  }
  const allButton = els.filters.querySelector("[data-clear-filters]");
  allButton.setAttribute(
    "aria-pressed",
    String(!filtersActive(state.filters) && !state.query.trim())
  );

  els.mealCount.textContent = visible.length === 1 ? "1 meal" : `${visible.length} meals`;

  if (!visible.length) {
    const onlyFavorites =
      state.filters.favoritesOnly && !filtersActive(state.filters) && !state.query.trim();
    els.mealGrid.innerHTML = onlyFavorites
      ? `<div class="empty-note">
          <span class="empty-emoji" aria-hidden="true">💚</span>
          <p>No favorite meals yet.</p>
          <p>Tap the heart on a meal.</p>
        </div>`
      : `<div class="empty-note">
          <span class="empty-emoji" aria-hidden="true">🍽️</span>
          <p>No meals match.</p>
          <button type="button" data-clear-filters>Clear filters</button>
        </div>`;
  } else {
    els.mealGrid.innerHTML = visible.map((meal) => mealCard(meal, dayLabel)).join("");
  }
  scroll.scrollTop = scrollTop;
}

function mealCard(meal, dayLabel) {
  const tags = [
    { label: meal.cuisine === "chinese" ? "Chinese" : "Western", kind: meal.cuisine },
    ...meal.meals.map((mealTime) => ({
      label: mealTime === "lunch" ? "Lunch" : "Dinner",
      kind: mealTime,
    })),
  ];
  if (meal.effort === "quick") tags.push({ label: "Quick", kind: "quick" });
  if (meal.effort === "slow") tags.push({ label: "Takes time", kind: "slow" });
  if (meal.frozen) tags.push({ label: "Frozen", kind: "frozen" });
  if (meal.convenience) tags.push({ label: "Convenience", kind: "convenience" });
  if (meal.custom) tags.push({ label: "Yours", kind: "yours" });
  if (meal.edited) tags.push({ label: "Edited", kind: "edited" });

  const ingredients = meal.ingredients
    .map((item) => `${item.name} ${formatQty(item.qty, item.unit)}`)
    .join(" · ");
  const steps = meal.instructions || meal.blurb;

  return `
    <article class="meal-card" data-meal-id="${esc(meal.id)}" data-cuisine="${esc(meal.cuisine)}" data-frozen="${meal.frozen}" data-convenience="${meal.convenience}" data-effort="${esc(meal.effort)}" data-meals="${esc(meal.meals.join(" "))}" data-favorite="${meal.favorite}">
      <div class="meal-top">
        <span class="emoji" aria-hidden="true">${meal.emoji}</span>
        <div class="meal-id">
          <h3>${esc(meal.name)}</h3>
          <div class="meta-row">
            <p class="meta">${meal.minutes} min</p>
            <div class="card-tools">
              <button type="button" class="heart" data-fav="${esc(meal.id)}" aria-pressed="${meal.favorite}" aria-label="${meal.favorite ? `Remove ${esc(meal.name)} from favorites` : `Save ${esc(meal.name)} to favorites`}">&#9829;</button>
              <button type="button" class="card-edit" data-open="${esc(meal.id)}" aria-label="Edit ${esc(meal.name)}">Edit</button>
              <button type="button" class="plus" data-add="${esc(meal.id)}" aria-label="Add ${esc(meal.name)} to ${esc(dayLabel)}">+</button>
            </div>
          </div>
        </div>
      </div>
      <p class="blurb">${esc(meal.blurb)}</p>
      <div class="instruction">
        <p class="instruction-label">Instructions</p>
        <p class="steps ingredients">${esc(ingredients)}</p>
        <p class="steps">${esc(steps)}</p>
      </div>
      <div class="tags">${tags
        .map((tag) => `<span class="tag ${esc(tag.kind)}">${esc(tag.label)}</span>`)
        .join("")}</div>
    </article>`;
}

function buildDays() {
  els.days.innerHTML = DAYS.map(
    (day) => `
      <article class="day" data-day="${day.id}">
        <button type="button" class="day-select" data-select="${day.id}" aria-label="Select ${day.label}">
          <span class="dow">${day.short}</span>
          <span class="date-num"></span>
          <span class="full">${day.label}</span>
          <span class="today-pill" hidden>Today</span>
        </button>
        <div class="day-meals"></div>
      </article>`
  ).join("");
}

function renderDays() {
  const showToday = state.weekKey === weekKeyFromDate();
  const weekStart = parseISODate(state.weekKey);
  const byId = mealsById();
  DAYS.forEach((day, index) => {
    const card = els.days.querySelector(`[data-day="${day.id}"]`);
    const selected = state.selectedDay === day.id;
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    card.classList.toggle("selected", selected);
    card.classList.toggle("today", showToday && day.id === TODAY);
    card.querySelector("[data-select]").setAttribute("aria-pressed", String(selected));
    card.querySelector(".date-num").textContent = String(date.getDate());
    card.querySelector(".today-pill").hidden = !(showToday && day.id === TODAY);
    const mealsBox = card.querySelector(".day-meals");
    const entries = state.plan[day.id] ?? [];
    mealsBox.classList.toggle("has-meals", entries.length > 0);
    if (!entries.length) {
      mealsBox.innerHTML = selected
        ? `<p class="day-empty">Add a meal from the right</p>`
        : "";
      return;
    }
    mealsBox.innerHTML = entries
      .map((entry) => {
        const meal = byId[entry.mealId];
        if (!meal) return "";
        return `
          <div class="planned">
            <span class="planned-emoji" aria-hidden="true">${meal.emoji}</span>
            <span class="planned-name">${esc(meal.name)}</span>
            <button type="button" class="remove" data-remove="${esc(entry.id)}" data-day="${day.id}" aria-label="Remove ${esc(meal.name)} from ${esc(day.label)}">×</button>
          </div>`;
      })
      .join("");
  });
}

function renderIngredients() {
  const scrollTop = els.ingredientsView.scrollTop;
  for (const button of els.viewButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.ingredientView));
  }

  const byId = mealsById();
  const count = plannedCount(state.plan);
  const view = state.ingredientView;
  els.copyList.hidden = view !== "shopping" || count === 0;
  els.clearTicks.hidden = view !== "shopping" || state.checked.size === 0;

  if (view === "dish") {
    els.viewBlurb.textContent = "One recipe at a time. Repeats multiply the amounts.";
    renderDishView(byId);
  } else if (view === "shopping") {
    renderShoppingView(byId);
  } else {
    els.viewBlurb.textContent = "Kept separate for each day.";
    renderDayView(byId);
  }
  els.ingredientsView.scrollTop = scrollTop;
}

function renderDishView(byId) {
  const groups = ingredientsByDish(state.plan, byId);
  if (!groups.length) {
    els.ingredientBody.innerHTML = emptyIngredients(
      "No dishes yet",
      "Add meals to the week and each recipe will list its ingredients here."
    );
    return;
  }
  els.ingredientBody.innerHTML = groups
    .map((group) => {
      const dayLabels = group.days.map((id) => dayById(id).label).join(", ");
      const times = group.count === 1 ? "Planned once" : `Planned ${group.count} times`;
      return `
        <section class="block">
          <header class="block-head">
            <h3><span aria-hidden="true">${group.meal.emoji}</span> ${esc(group.meal.name)}</h3>
            <p>${times} · ${esc(dayLabels)}</p>
          </header>
          <ul class="ing-list">
            ${group.ingredients
              .map(
                (item) =>
                  `<li><span>${esc(item.name)}</span><span class="qty">${esc(formatQty(item.qty, item.unit))}</span></li>`
              )
              .join("")}
          </ul>
        </section>`;
    })
    .join("");
}

function renderShoppingView(byId) {
  const groups = shoppingList(state.plan, byId);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const ticked = groups.reduce(
    (sum, group) => sum + group.items.filter((item) => state.checked.has(item.key)).length,
    0
  );
  els.viewBlurb.textContent = total
    ? `Combined by aisle. ${ticked} of ${total} ticked off.`
    : "Combined and sorted by aisle.";

  if (!total) {
    els.ingredientBody.innerHTML = emptyIngredients(
      "Nothing to buy yet",
      "Add meals to the week and a combined shopping list will show up here."
    );
    return;
  }

  els.ingredientBody.innerHTML = groups
    .map(
      (group) => `
      <section class="block">
        <h3 class="aisle ${categoryClass(group.category)}">${esc(group.category)}</h3>
        <div class="shop-list">
          ${group.items
            .map((item) => {
              const done = state.checked.has(item.key);
              return `
                <label class="shop-row${done ? " done" : ""}">
                  <input type="checkbox" data-check="${esc(item.key)}" ${done ? "checked" : ""}>
                  <span class="shop-name">${esc(item.name)}</span>
                  <span class="shop-qty">${esc(formatQty(item.qty, item.unit))}</span>
                  <span class="shop-dishes">${esc(item.dishes.join(", "))}</span>
                </label>`;
            })
            .join("")}
        </div>
      </section>`
    )
    .join("");
}

function renderDayView(byId) {
  const days = ingredientsByDay(state.plan, byId);
  const showToday = state.weekKey === weekKeyFromDate();
  els.ingredientBody.innerHTML = days
    .map((group) => {
      const names = nameCounts(group.meals)
        .map((item) => (item.count > 1 ? `${item.name} ×${item.count}` : item.name))
        .join(", ");
      const today =
        showToday && group.day.id === TODAY ? `<span class="today-pill">Today</span>` : "";
      const body = group.meals.length
        ? `<p class="day-dish-names">${esc(names)}</p>
           <ul class="ing-list">
             ${group.ingredients
               .map(
                 (item) =>
                   `<li><span>${esc(item.name)}</span><span class="qty">${esc(formatQty(item.qty, item.unit))}</span></li>`
               )
               .join("")}
           </ul>`
        : `<p class="quiet-line">Nothing planned</p>`;
      return `
        <section class="block${group.meals.length ? "" : " quiet"}">
          <header class="block-head">
            <h3>${esc(group.day.label)} ${today}</h3>
          </header>
          ${body}
        </section>`;
    })
    .join("");
}

function openEditor(mealId) {
  resetDeleteButton();
  const existing = mealId ? mealsById()[mealId] : null;
  const meal = existing ? structuredClone(existing) : blankMeal();
  state.editor = {
    meal,
    custom: Boolean(meal.custom),
    builtin: Boolean(existing?.builtin),
    edited: Boolean(existing?.edited),
  };
  els.dialogTitle.textContent = existing ? "Edit meal" : "New meal";
  els.mealName.value = meal.name;
  els.mealEmoji.value = meal.emoji || "";
  els.mealCuisine.value = meal.cuisine;
  els.mealMinutes.value = String(meal.minutes || 30);
  els.mealLunch.checked = meal.meals.includes("lunch");
  els.mealDinner.checked = meal.meals.includes("dinner");
  els.mealEffort.value = meal.effort || "moderate";
  els.mealFrozen.checked = Boolean(meal.frozen);
  els.mealConvenience.checked = Boolean(meal.convenience);
  els.mealBlurb.value = meal.blurb || "";
  els.mealSteps.value = meal.instructions || "";
  els.formError.textContent = "";
  els.deleteMeal.hidden = !meal.custom || !meal.id;
  els.resetMeal.hidden = !existing?.builtin || !existing?.edited;
  renderIngredientEditor(meal.ingredients);
  els.dialog.hidden = false;
  els.mealName.focus();
}

function renderIngredientEditor(ingredients) {
  els.ingredientRows.innerHTML = ingredients
    .map(
      (item, index) => `
      <div class="ing-row">
        <input data-field="name" type="text" placeholder="Ingredient" value="${esc(item.name)}" />
        <input data-field="qty" type="number" min="0.25" step="0.25" value="${esc(item.qty)}" />
        <input data-field="unit" type="text" placeholder="g" value="${esc(item.unit)}" />
        <select data-field="category">
          ${CATEGORIES.map(
            (category) =>
              `<option value="${esc(category)}"${category === item.category ? " selected" : ""}>${esc(category)}</option>`
          ).join("")}
        </select>
        <button type="button" data-remove-ing="${index}" aria-label="Remove ingredient">×</button>
      </div>`
    )
    .join("");
}

function readEditorMeal() {
  const source = state.editor.meal;
  const meals = [];
  if (els.mealLunch.checked) meals.push("lunch");
  if (els.mealDinner.checked) meals.push("dinner");
  const ingredients = [...els.ingredientRows.querySelectorAll(".ing-row")].map((row) => ({
    name: row.querySelector("[data-field=name]").value.trim(),
    qty: Number(row.querySelector("[data-field=qty]").value),
    unit: row.querySelector("[data-field=unit]").value.trim() || "pcs",
    category: row.querySelector("[data-field=category]").value,
  }));
  return {
    ...source,
    name: els.mealName.value.trim(),
    emoji: els.mealEmoji.value.trim() || "🍽️",
    cuisine: els.mealCuisine.value,
    minutes: Number(els.mealMinutes.value) || 30,
    meals,
    effort: els.mealEffort.value,
    frozen: els.mealFrozen.checked,
    convenience: els.mealConvenience.checked,
    blurb: els.mealBlurb.value.trim(),
    instructions: els.mealSteps.value.trim(),
    ingredients,
    custom: state.editor.custom,
  };
}

function saveEditor() {
  const draft = readEditorMeal();
  if (!draft.id) draft.id = `custom_${makeId()}`;
  const clean = sanitizeMeal(draft);
  if (!clean) {
    els.formError.textContent = "Add a name, at least one meal time, and one ingredient with an amount.";
    return;
  }
  clean.custom = draft.custom;
  if (clean.custom) {
    const index = state.customMeals.findIndex((meal) => meal.id === clean.id);
    if (index === -1) state.customMeals.push(clean);
    else state.customMeals[index] = clean;
  } else {
    state.overrides[clean.id] = { ...clean, custom: false };
  }
  saveState();
  closeEditor();
  renderMeals();
  renderDays();
  renderIngredients();
  showToast("Meal saved");
}

function deleteEditorMeal() {
  if (!deleteArmed) {
    deleteArmed = true;
    els.deleteMeal.textContent = "Click again to delete";
    window.clearTimeout(deleteTimer);
    deleteTimer = window.setTimeout(resetDeleteButton, 2500);
    return;
  }
  const id = state.editor.meal.id;
  state.customMeals = state.customMeals.filter((meal) => meal.id !== id);
  state.favorites.delete(id);
  for (const plan of Object.values(state.plans)) {
    for (const day of DAYS) {
      plan[day.id] = (plan[day.id] ?? []).filter((entry) => entry.mealId !== id);
    }
  }
  state.plan = state.plans[state.weekKey];
  saveState();
  closeEditor();
  renderMeals();
  renderDays();
  renderIngredients();
  syncChrome();
  showToast("Meal deleted");
}

function resetDeleteButton() {
  deleteArmed = false;
  window.clearTimeout(deleteTimer);
  els.deleteMeal.textContent = "Delete meal";
}

function resetEditorMeal() {
  const id = state.editor.meal.id;
  delete state.overrides[id];
  saveState();
  closeEditor();
  renderMeals();
  renderDays();
  renderIngredients();
  showToast("Restored the original recipe");
}

function closeEditor() {
  state.editor = null;
  els.dialog.hidden = true;
  resetDeleteButton();
}

function nameCounts(meals) {
  const list = [];
  for (const { meal } of meals) {
    const found = list.find((item) => item.id === meal.id);
    if (found) found.count += 1;
    else list.push({ id: meal.id, name: meal.name, count: 1 });
  }
  return list;
}

function emptyIngredients(title, copy) {
  return `
    <div class="empty-note">
      <span class="empty-emoji" aria-hidden="true">🧺</span>
      <p>${esc(title)}</p>
      <p>${esc(copy)}</p>
    </div>`;
}

async function exportPng() {
  try {
    const byId = mealsById();
    await downloadIngredientPng({
      weekKey: state.weekKey,
      weekLabel: formatWeekRange(state.weekKey),
      relation: weekRelation(state.weekKey),
      view: state.ingredientView,
      showChecks: state.ingredientView === "shopping",
      sections: exportSections(state.ingredientView, state.plan, byId, state.checked),
    });
    showToast("Ingredient list exported");
  } catch {
    showToast("Could not export the PNG");
  }
}

async function copyShoppingList() {
  const groups = shoppingList(state.plan, mealsById());
  const text = shoppingText(groups, state.checked);
  try {
    await copyText(text);
    showToast("Shopping list copied");
  } catch {
    showToast("Could not copy. Try again after clicking the page.");
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Electron can block the async clipboard. Fall through to the older path.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

function flashDay(dayId) {
  const card = els.days.querySelector(`[data-day="${dayId}"]`);
  if (!card) return;
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function categoryClass(category) {
  return category.toLowerCase().replace(/[^a-z]+/g, "-");
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
