/* 庆祝特效：像素彩纸 + 小心心，从某个位置炸开 */
import { rand, pick, reducedMotion } from "./dom.js";

const COLORS = ["#f4718f", "#ff93ad", "#a996e8", "#8f79e0", "#ffc94d", "#7cbb73", "#9fd6f5"];
const HEART = [".hh.hh.", "hhhhhhh", "hhhhhhh", ".hhhhh.", "..hhh..", "...h..."];
const STAR  = ["...h...", "...h...", "hhhhhhh", ".hhhhh.", "..hhh..", ".hh.hh."];

let canvas = null;
let ctx = null;
let parts = [];
let raf = 0;
let dpr = 1;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "fx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  ctx = canvas.getContext("2d");
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener("resize", resize);
}

function drawShape(rows, x, y, px, color) {
  ctx.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== ".") ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), px, px);
    }
  });
}

function step() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.max);
  for (const p of parts) {
    p.vx *= 0.985;
    p.vy += p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.life++;
    ctx.globalAlpha = Math.max(0, 1 - (p.life / p.max) ** 2);
    if (p.shape) drawShape(p.shape, p.x, p.y, p.px, p.color);
    else { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
  }
  ctx.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(step);
  else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}

/** 在屏幕坐标 (x, y) 炸开 */
export function burst(x, y, { count = 36, power = 1, spread = 1 } = {}) {
  if (reducedMotion()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    parts.push({
      x, y,
      vx: rand(-3.4, 3.4) * spread * power,
      vy: rand(-7.5, -2.5) * power,
      g: 0.24,
      life: 0,
      max: rand(50, 90),
      size: Math.round(rand(3, 6)),
      shape: r < 0.28 ? HEART : r < 0.42 ? STAR : null,
      px: Math.round(rand(2, 3)),
      color: pick(COLORS),
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

/** 从某个元素的中心炸开 */
export function burstFrom(el, opts) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/** 满屏从上往下撒（升级时用） */
export function shower(count = 90) {
  if (reducedMotion()) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    parts.push({
      x: rand(0, innerWidth), y: rand(-120, -10),
      vx: rand(-1, 1), vy: rand(1, 3.5), g: 0.06,
      life: 0, max: rand(110, 170),
      size: Math.round(rand(3, 6)),
      shape: r < 0.35 ? HEART : r < 0.5 ? STAR : null,
      px: Math.round(rand(2, 3)),
      color: pick(COLORS),
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

/** 手机震一下（支持的设备才有效，iPhone 的浏览器不支持） */
export const buzz = (pattern = [14]) => { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } };
