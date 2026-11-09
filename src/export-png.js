import {
  ingredientsByDay,
  ingredientsByDish,
  shoppingList,
  formatQty,
  dayById,
} from "./logic.js";

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 68;

const VIEW_TITLES = {
  dish: "By dish",
  shopping: "Shopping list",
  day: "By day",
};

export function exportSections(view, plan, mealsById, checked) {
  if (view === "shopping") {
    return shoppingList(plan, mealsById).map((group) => ({
      title: group.category,
      subtitle: "",
      lines: group.items.map((item) => ({
        name: item.name,
        qty: formatQty(item.qty, item.unit),
        note: item.dishes.join(", "),
        checked: checked.has(item.key),
      })),
    }));
  }

  if (view === "day") {
    return ingredientsByDay(plan, mealsById).map((group) => {
      const names = [];
      for (const { meal } of group.meals) {
        const found = names.find((item) => item.name === meal.name);
        if (found) found.count += 1;
        else names.push({ name: meal.name, count: 1 });
      }
      const subtitle = names.length
        ? names.map((item) => (item.count > 1 ? `${item.name} x${item.count}` : item.name)).join(", ")
        : "Nothing planned";
      return {
        title: group.day.label,
        subtitle,
        lines: group.ingredients.map((item) => ({
          name: item.name,
          qty: formatQty(item.qty, item.unit),
          note: "",
          checked: false,
        })),
      };
    });
  }

  return ingredientsByDish(plan, mealsById).map((group) => ({
    title: group.meal.name,
    subtitle:
      group.count === 1
        ? `Planned once · ${group.days.map((id) => dayById(id).label).join(", ")}`
        : `Planned ${group.count} times · ${group.days.map((id) => dayById(id).label).join(", ")}`,
    lines: group.ingredients.map((item) => ({
      name: item.name,
      qty: formatQty(item.qty, item.unit),
      note: "",
      checked: false,
    })),
  }));
}

export function renderIngredientCanvas(model) {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  const options = [
    { font: 22, columns: 1 },
    { font: 20, columns: 1 },
    { font: 18, columns: 1 },
    { font: 18, columns: 2 },
    { font: 16, columns: 2 },
    { font: 15, columns: 2 },
    { font: 14, columns: 2 },
  ];
  let chosen = options[options.length - 1];
  for (const option of options) {
    if (flow(ctx, model, option.font, option.columns, false).ok) {
      chosen = option;
      break;
    }
  }
  flow(ctx, model, chosen.font, chosen.columns, true);
  return canvas;
}

export async function downloadIngredientPng(model) {
  const canvas = renderIngredientCanvas(model);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MealPlan-${model.weekKey}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function flow(ctx, model, fontSize, columns, commit) {
  if (commit) {
    ctx.fillStyle = "#f3fbf6";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 36, 36, PAGE_W - 72, PAGE_H - 72, 28);
    ctx.fill();
  }

  const headerBottom = drawHeader(ctx, model, commit);
  const innerLeft = MARGIN;
  const innerWidth = PAGE_W - MARGIN * 2;
  const gap = 32;
  const columnWidth = columns === 1 ? innerWidth : (innerWidth - gap) / 2;
  const limit = PAGE_H - MARGIN - 8;
  const sections = model.sections.length
    ? model.sections
    : [{ title: "Nothing planned this week", subtitle: "Add meals and export again.", lines: [] }];

  const heights = sections.map((section) => sectionHeight(ctx, section, fontSize, columnWidth));
  const columnsOf = splitColumns(heights, columns, limit - headerBottom);
  if (!columnsOf) return { ok: false };

  if (commit) {
    columnsOf.forEach((indexes, columnIndex) => {
      let y = headerBottom;
      const x = innerLeft + columnIndex * (columnWidth + gap);
      for (const index of indexes) {
        y = drawSection(ctx, sections[index], x, y, fontSize, columnWidth, model.showChecks);
      }
    });
    ctx.fillStyle = "#5d7568";
    ctx.font = "700 16px Segoe UI, sans-serif";
    ctx.fillText("Each recipe serves 2.", MARGIN, PAGE_H - 48);
  }
  return { ok: true };
}

function splitColumns(heights, columns, available) {
  if (columns === 1) {
    const total = heights.reduce((sum, height) => sum + height, 0);
    return total <= available ? [heights.map((_, index) => index)] : null;
  }
  const left = [];
  const right = [];
  let leftHeight = 0;
  let rightHeight = 0;
  let fillingLeft = true;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (height > available) return null;
    if (fillingLeft && leftHeight + height <= available) {
      left.push(index);
      leftHeight += height;
    } else {
      fillingLeft = false;
      if (rightHeight + height > available) return null;
      right.push(index);
      rightHeight += height;
    }
  }
  return [left, right];
}

function drawHeader(ctx, model, commit) {
  let y = 78;
  if (commit) {
    ctx.fillStyle = "#147a49";
    ctx.font = "700 42px Georgia, serif";
    ctx.fillText("MealPlan", MARGIN, y);
  }
  y += 36;
  if (commit) {
    ctx.fillStyle = "#1c3328";
    ctx.font = "700 28px Segoe UI, sans-serif";
    ctx.fillText(VIEW_TITLES[model.view] || "Ingredients", MARGIN, y);
  }
  y += 32;
  if (commit) {
    ctx.fillStyle = "#5d7568";
    ctx.font = "700 22px Segoe UI, sans-serif";
    ctx.fillText(`${model.weekLabel}  ·  ${model.relation}`, MARGIN, y);
  }
  y += 28;
  if (commit) {
    ctx.strokeStyle = "#d7eee2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
  }
  return y + 28;
}

function sectionHeight(ctx, section, fontSize, width) {
  const titleLines = wrap(ctx, section.title, width, `700 ${fontSize + 4}px Segoe UI, sans-serif`);
  const subtitleLines = section.subtitle
    ? wrap(ctx, section.subtitle, width, `700 ${Math.max(13, fontSize - 2)}px Segoe UI, sans-serif`)
    : [];
  let height = 8 + titleLines.length * (fontSize + 10) + subtitleLines.length * (fontSize + 4) + 8;
  for (const line of section.lines) {
    const nameLines = wrap(ctx, line.name, width * 0.62, `700 ${fontSize}px Segoe UI, sans-serif`);
    const noteLines = line.note
      ? wrap(ctx, line.note, width * 0.7, `600 ${Math.max(12, fontSize - 3)}px Segoe UI, sans-serif`)
      : [];
    height += Math.max(1, nameLines.length) * (fontSize + 8) + noteLines.length * (fontSize + 2) + 8;
  }
  return height + 16;
}

function drawSection(ctx, section, x, y, fontSize, width, showChecks) {
  y += 8;
  ctx.fillStyle = "#147a49";
  ctx.font = `700 ${fontSize + 4}px Segoe UI, sans-serif`;
  for (const line of wrap(ctx, section.title, width, ctx.font)) {
    ctx.fillText(line, x, y);
    y += fontSize + 10;
  }
  if (section.subtitle) {
    ctx.fillStyle = "#5d7568";
    ctx.font = `700 ${Math.max(13, fontSize - 2)}px Segoe UI, sans-serif`;
    for (const line of wrap(ctx, section.subtitle, width, ctx.font)) {
      ctx.fillText(line, x, y);
      y += fontSize + 4;
    }
  }
  y += 6;
  for (const line of section.lines) {
    const box = fontSize;
    const textX = showChecks ? x + box + 8 : x;
    if (showChecks) {
      if (line.checked) {
        ctx.fillStyle = "#1f9d62";
        roundRect(ctx, x, y - box + 4, box - 4, box - 4, 3);
        ctx.fill();
      } else {
        ctx.strokeStyle = "#9dccb4";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y - box + 4, box - 4, box - 4, 3);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#1c3328";
    ctx.font = `700 ${fontSize}px Segoe UI, sans-serif`;
    const nameLines = wrap(ctx, line.name, showChecks ? width * 0.62 : width * 0.68, ctx.font);
    nameLines.forEach((nameLine, index) => {
      ctx.fillText(nameLine, textX, y + index * (fontSize + 8));
    });
    ctx.fillStyle = "#147a49";
    ctx.font = `700 ${fontSize}px Segoe UI, sans-serif`;
    const qtyWidth = ctx.measureText(line.qty).width;
    ctx.fillText(line.qty, x + width - qtyWidth, y);
    y += Math.max(1, nameLines.length) * (fontSize + 8);
    if (line.note) {
      ctx.fillStyle = "#5d7568";
      ctx.font = `600 ${Math.max(12, fontSize - 3)}px Segoe UI, sans-serif`;
      for (const noteLine of wrap(ctx, line.note, width * 0.7, ctx.font)) {
        ctx.fillText(noteLine, textX, y);
        y += fontSize + 2;
      }
    }
    y += 8;
  }
  return y + 10;
}

function wrap(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) current = trial;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
