import { formatQty } from "./logic.js";

// A4 portrait at 300 dpi, laid out on a 1240 x 1754 grid and scaled 2x.
const SCALE = 2;
const W = 1240;
const H = 1754;
const MARGIN = 64;
const GAP = 44;
const COL_W = (W - MARGIN * 2 - GAP) / 2;
const TOP_FIRST = 250;
const TOP_NEXT = 170;
const BOTTOM = H - MARGIN - 34;

const SANS = 'Nunito, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF = 'Fraunces, Georgia, "Times New Roman", serif';
const INK = "#1c3328";
const MUTED = "#5d7568";
const GREEN = "#147a49";
const LINE = "#d7eee2";

const AISLE_COLORS = {
  Produce: "#3cb371",
  "Meat & Seafood": "#e25b3c",
  "Dairy, Eggs & Tofu": "#e0ac2b",
  Bakery: "#d08a4a",
  "Rice, Pasta & Noodles": "#b8964a",
  "Canned & Dry Goods": "#8f7a66",
  "Sauces & Condiments": "#d65d8c",
  "Oils, Spices & Baking": "#9b6bd1",
  Frozen: "#3aa0c8",
};

const AISLE_H = 54;
const NAME_SIZE = 21;
const DISH_SIZE = 14;

/**
 * groups: shopping groups ({ category, items }) with only the items still to buy.
 * Returns one canvas per A4 page.
 */
export function renderGroceryPages(model) {
  // Show which dish each item is for, unless dropping those lines saves a page.
  let withDishes = true;
  let pages = paginate(model.groups, true);
  if (pages.length > 1) {
    const compact = paginate(model.groups, false);
    if (compact.length < pages.length) {
      pages = compact;
      withDishes = false;
    }
  }
  return pages.map((page, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    drawHeader(ctx, model, index === 0);
    for (const block of page) {
      if (block.type === "aisle") drawAisle(ctx, block);
      else drawItem(ctx, block, withDishes);
    }
    if (index === 0 && !model.groups.length) drawEmpty(ctx, model);
    drawFooter(ctx, model, index, pages.length);
    return canvas;
  });
}

function rowHeight(item, withDishes) {
  return withDishes && item.dishes?.length ? 58 : 42;
}

function paginate(groups, withDishes) {
  const pages = [[]];
  let page = 0;
  let col = 0;
  let y = TOP_FIRST;
  const top = () => (page === 0 ? TOP_FIRST : TOP_NEXT);
  const nextColumn = () => {
    col += 1;
    if (col > 1) {
      col = 0;
      page += 1;
      pages.push([]);
    }
    y = top();
  };

  for (const group of groups) {
    const first = rowHeight(group.items[0], withDishes);
    if (y !== top() && y + AISLE_H + first > BOTTOM) nextColumn();
    pages[page].push({ type: "aisle", col, y, group, cont: false });
    y += AISLE_H;
    group.items.forEach((item, index) => {
      const height = rowHeight(item, withDishes);
      if (y + height > BOTTOM) {
        nextColumn();
        pages[page].push({ type: "aisle", col, y, group, cont: true });
        y += AISLE_H;
      }
      pages[page].push({ type: "item", col, y, item, last: index === group.items.length - 1 });
      y += height;
    });
    y += 22;
  }
  return pages;
}

const colX = (col) => MARGIN + col * (COL_W + GAP);

function drawHeader(ctx, model, full) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GREEN;
  ctx.font = `680 24px ${SERIF}`;
  ctx.fillText("MealPlan", MARGIN, MARGIN + 22);
  ctx.fillStyle = MUTED;
  ctx.font = `800 18px ${SANS}`;
  const right = model.weekLabel.toUpperCase();
  ctx.fillText(right, W - MARGIN - ctx.measureText(right).width, MARGIN + 20);

  if (!full) {
    ctx.fillStyle = INK;
    ctx.font = `680 30px ${SERIF}`;
    ctx.fillText("Grocery list (continued)", MARGIN, MARGIN + 64);
    rule(ctx, TOP_NEXT - 28);
    return;
  }

  ctx.fillStyle = INK;
  ctx.font = `680 56px ${SERIF}`;
  ctx.fillText("Grocery list", MARGIN, MARGIN + 94);

  const toBuy = model.groups.reduce((sum, group) => sum + group.items.length, 0);
  const parts = [`${toBuy} ${toBuy === 1 ? "item" : "items"} to buy`, "sorted by aisle"];
  if (model.skipped) parts.push(`${model.skipped} already ticked off and left out`);
  ctx.fillStyle = MUTED;
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText(parts.join(" · "), MARGIN, MARGIN + 132);
  rule(ctx, TOP_FIRST - 32);
}

function rule(ctx, y) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(W - MARGIN, y);
  ctx.stroke();
}

function drawAisle(ctx, { col, y, group, cont }) {
  const x = colX(col);
  const color = AISLE_COLORS[group.category] ?? GREEN;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 8, y + 22, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.font = `680 25px ${SERIF}`;
  const label = cont ? `${group.category} (cont.)` : group.category;
  ctx.fillText(fit(ctx, label, COL_W - 70), x + 26, y + 31);

  ctx.fillStyle = MUTED;
  ctx.font = `800 16px ${SANS}`;
  const count = String(group.items.length);
  ctx.fillText(count, x + COL_W - ctx.measureText(count).width, y + 30);

  ctx.fillStyle = color;
  ctx.fillRect(x, y + 44, COL_W, 2.5);
}

function drawItem(ctx, { col, y, item, last }, withDishes) {
  const x = colX(col);
  const height = rowHeight(item, withDishes);

  // Checkbox to tick off in the store
  ctx.strokeStyle = "#8aa898";
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 10, 20, 20, 4);
  ctx.stroke();

  const qty = formatQty(item.qty, item.unit);
  ctx.font = `800 19px ${SANS}`;
  const qtyW = ctx.measureText(qty).width;
  ctx.fillStyle = GREEN;
  ctx.fillText(qty, x + COL_W - qtyW, y + 27);

  ctx.fillStyle = INK;
  ctx.font = `800 ${NAME_SIZE}px ${SANS}`;
  ctx.fillText(fit(ctx, item.name, COL_W - 40 - qtyW - 14), x + 34, y + 28);

  if (withDishes && item.dishes?.length) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 ${DISH_SIZE}px ${SANS}`;
    ctx.fillText(fit(ctx, `for ${item.dishes.join(", ")}`, COL_W - 34), x + 34, y + 48);
  }

  if (!last) {
    ctx.strokeStyle = "#eef6f1";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 34, y + height - 1);
    ctx.lineTo(x + COL_W, y + height - 1);
    ctx.stroke();
  }
}

function drawEmpty(ctx, model) {
  ctx.fillStyle = MUTED;
  ctx.font = `700 26px ${SANS}`;
  const text = model.skipped ? "Everything is ticked off. Nothing left to buy." : "No meals planned this week yet.";
  ctx.fillText(text, MARGIN, TOP_FIRST + 30);
}

function drawFooter(ctx, model, index, count) {
  ctx.fillStyle = "#8aa898";
  ctx.font = `700 15px ${SANS}`;
  ctx.fillText(`Printed from MealPlan · week of ${model.weekKey}`, MARGIN, H - MARGIN + 8);
  if (count > 1) {
    const label = `Page ${index + 1} of ${count}`;
    ctx.fillText(label, W - MARGIN - ctx.measureText(label).width, H - MARGIN + 8);
  }
}

// Shortens text with an ellipsis so it stays on one line.
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("").trimEnd()}…`;
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
