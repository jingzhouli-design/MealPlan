import { DAYS, parseISODate, formatQty } from "./logic.js";

// A4 portrait at 300 dpi. Layout is drawn on a 1240 x 1754 grid (150 dpi)
// and scaled 2x so the printed page stays sharp.
const SCALE = 2;
const W = 1240;
const H = 1754;
const MARGIN = 64;

const SANS = 'Nunito, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF = 'Fraunces, Georgia, "Times New Roman", serif';

const INK = "#1c3328";
const MUTED = "#5d7568";
const GREEN = "#147a49";
const GREEN_SOFT = "#1f9d62";
const LINE = "#d7eee2";
const TINT = "#f3fbf6";

export const PAGE_SIZE = { width: W * SCALE, height: H * SCALE };

/**
 * Turns the plan into one entry per day, in the app's day order.
 * mealsById maps meal ids to meal objects (with name, emoji, minutes, ingredients).
 */
export function weekSections(weekKey, plan, mealsById) {
  const start = parseISODate(weekKey);
  return DAYS.map((day, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const meals = (plan[day.id] ?? [])
      .map((entry) => mealsById[entry.mealId])
      .filter(Boolean)
      .map((meal) => ({
        name: meal.name,
        emoji: meal.emoji || "",
        minutes: meal.minutes,
        ingredients: meal.ingredients
          .map((item) => `${item.name} ${formatQty(item.qty, item.unit)}`)
          .join(" · "),
      }));
    return {
      id: day.id,
      label: day.label,
      short: day.short.toUpperCase(),
      dateNum: String(date.getDate()),
      month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      meals,
    };
  });
}

export function renderWeekCanvas(model) {
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  // Pick the roomiest type size that still fits all seven days on one page.
  const options = [
    { font: 24, details: true },
    { font: 22, details: true },
    { font: 20, details: true },
    { font: 18, details: true },
    { font: 22, details: false },
    { font: 19, details: false },
    { font: 17, details: false },
    { font: 15, details: false },
  ];
  let chosen = options[options.length - 1];
  for (const option of options) {
    if (layout(ctx, model, option).fits) {
      chosen = option;
      break;
    }
  }
  draw(ctx, model, layout(ctx, model, chosen), chosen);
  return canvas;
}

export async function downloadWeekPng(model) {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Fall back to system fonts.
    }
  }
  const canvas = renderWeekCanvas(model);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("export failed");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MealPlan-week-${model.weekKey}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const HEADER_BOTTOM = 236;
const FOOTER_TOP = H - MARGIN - 20;
const DATE_COL = 132;
const ROW_GAP = 12;
const ROW_PAD = 18;

function layout(ctx, model, option) {
  const textX = MARGIN + DATE_COL + 20;
  const textW = W - MARGIN - ROW_PAD - textX;
  const minRow = Math.max(96, option.font * 4.2);
  const rows = model.days.map((day) => {
    const blocks = day.meals.map((meal) => mealBlock(ctx, meal, option, textW));
    const content = day.meals.length
      ? blocks.reduce((sum, block) => sum + block.height, 0) + (blocks.length - 1) * 10
      : option.font + 8;
    return { day, blocks, height: Math.max(minRow, content + ROW_PAD * 2) };
  });
  const available = FOOTER_TOP - 18 - HEADER_BOTTOM - ROW_GAP * (rows.length - 1);
  const used = rows.reduce((sum, row) => sum + row.height, 0);
  if (used > available) return { fits: false, rows, textX, textW };
  // Hand out leftover space evenly so the page is filled and there is room to scribble.
  const extra = (available - used) / rows.length;
  for (const row of rows) row.height += extra;
  return { fits: true, rows, textX, textW };
}

function mealBlock(ctx, meal, option, width) {
  const nameFont = `800 ${option.font}px ${SANS}`;
  const detailFont = `700 ${Math.round(option.font * 0.68)}px ${SANS}`;
  const emojiW = meal.emoji ? option.font * 1.5 : 0;
  const minutes = meal.minutes ? `${meal.minutes} min` : "";
  ctx.font = `800 ${Math.round(option.font * 0.72)}px ${SANS}`;
  const minutesW = minutes ? ctx.measureText(minutes).width + 16 : 0;
  const nameLines = wrap(ctx, meal.name, width - emojiW - minutesW, nameFont);
  const detailLines =
    option.details && meal.ingredients
      ? wrap(ctx, meal.ingredients, width - emojiW, detailFont).slice(0, 2)
      : [];
  const nameLH = option.font * 1.25;
  const detailLH = option.font * 0.68 * 1.35;
  return {
    meal,
    nameLines,
    detailLines,
    nameFont,
    detailFont,
    emojiW,
    minutes,
    nameLH,
    detailLH,
    height: nameLines.length * nameLH + (detailLines.length ? 4 + detailLines.length * detailLH : 0),
  };
}

function draw(ctx, model, plan, option) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Header
  ctx.fillStyle = GREEN;
  ctx.font = `680 24px ${SERIF}`;
  ctx.fillText("MealPlan", MARGIN, MARGIN + 22);
  ctx.fillStyle = MUTED;
  ctx.font = `800 18px ${SANS}`;
  const relation = model.relation.toUpperCase();
  ctx.fillText(relation, W - MARGIN - ctx.measureText(relation).width, MARGIN + 20);

  ctx.fillStyle = INK;
  ctx.font = `680 52px ${SERIF}`;
  ctx.fillText(model.weekLabel, MARGIN, MARGIN + 92);
  ctx.fillStyle = MUTED;
  ctx.font = `700 20px ${SANS}`;
  const total = model.days.reduce((sum, day) => sum + day.meals.length, 0);
  ctx.fillText(
    total === 1 ? "1 meal planned · each recipe serves 2" : `${total} meals planned · each recipe serves 2`,
    MARGIN,
    MARGIN + 128
  );
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, HEADER_BOTTOM - 22);
  ctx.lineTo(W - MARGIN, HEADER_BOTTOM - 22);
  ctx.stroke();

  // Days
  let y = HEADER_BOTTOM;
  for (const row of plan.rows) {
    drawRow(ctx, row, y, plan, option);
    y += row.height + ROW_GAP;
  }

  // Footer
  ctx.fillStyle = "#8aa898";
  ctx.font = `700 15px ${SANS}`;
  ctx.fillText(`Printed from MealPlan · week of ${model.weekKey}`, MARGIN, H - MARGIN + 8);
}

function drawRow(ctx, row, top, plan, option) {
  const { day, blocks, height } = row;
  const x = MARGIN;
  const width = W - MARGIN * 2;
  const empty = !day.meals.length;

  ctx.fillStyle = empty ? "#fbfdfc" : "#ffffff";
  roundRect(ctx, x, top, width, height, 18);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Date column
  ctx.save();
  roundRect(ctx, x, top, width, height, 18);
  ctx.clip();
  ctx.fillStyle = TINT;
  ctx.fillRect(x, top, DATE_COL, height);
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(x + DATE_COL, top);
  ctx.lineTo(x + DATE_COL, top + height);
  ctx.stroke();

  const mid = top + height / 2;
  const cx = x + DATE_COL / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = GREEN;
  ctx.font = `800 17px ${SANS}`;
  ctx.fillText(day.short, cx, mid - 22);
  ctx.fillStyle = INK;
  ctx.font = `680 42px ${SERIF}`;
  ctx.fillText(day.dateNum, cx, mid + 18);
  ctx.fillStyle = MUTED;
  ctx.font = `700 15px ${SANS}`;
  ctx.fillText(day.month, cx, mid + 40);
  ctx.textAlign = "left";

  if (empty) {
    ctx.fillStyle = "#a7bdb1";
    ctx.font = `700 ${Math.round(option.font * 0.8)}px ${SANS}`;
    ctx.fillText("Nothing planned", plan.textX, mid + option.font * 0.28);
    return;
  }

  const contentH =
    blocks.reduce((sum, block) => sum + block.height, 0) + (blocks.length - 1) * 10;
  let y = top + Math.max(ROW_PAD, (height - contentH) / 2);
  blocks.forEach((block, index) => {
    if (index > 0) {
      ctx.strokeStyle = "#eef6f1";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(plan.textX, y - 5);
      ctx.lineTo(plan.textX + plan.textW, y - 5);
      ctx.stroke();
    }
    drawMeal(ctx, block, plan.textX, y, plan.textW, option);
    y += block.height + 10;
  });
}

function drawMeal(ctx, block, x, top, width, option) {
  const base = top + block.nameLH * 0.8;
  if (block.meal.emoji) {
    ctx.font = `${option.font}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillStyle = INK;
    ctx.fillText(block.meal.emoji, x, base);
  }
  const textX = x + block.emojiW;
  ctx.fillStyle = INK;
  ctx.font = block.nameFont;
  block.nameLines.forEach((line, index) => {
    ctx.fillText(line, textX, base + index * block.nameLH);
  });
  if (block.minutes) {
    ctx.fillStyle = GREEN_SOFT;
    ctx.font = `800 ${Math.round(option.font * 0.72)}px ${SANS}`;
    const w = ctx.measureText(block.minutes).width;
    ctx.fillText(block.minutes, x + width - w, base);
  }
  if (block.detailLines.length) {
    ctx.fillStyle = MUTED;
    ctx.font = block.detailFont;
    let y = top + block.nameLines.length * block.nameLH + 4 + block.detailLH * 0.78;
    for (const line of block.detailLines) {
      ctx.fillText(line, textX, y);
      y += block.detailLH;
    }
  }
}

// Wraps on spaces, and breaks long words or CJK text by character.
function wrap(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  const push = (word) => {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      return;
    }
    if (current) lines.push(current);
    current = "";
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      return;
    }
    let chunk = "";
    for (const char of word) {
      if (ctx.measureText(chunk + char).width > maxWidth && chunk) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  };
  words.forEach(push);
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
