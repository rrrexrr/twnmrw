/* 小工具：选择器、转义、安全的 HTML 模板 */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** 已经是安全 HTML 的字符串，插进 html`` 时不会再被转义 */
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}

/**
 * html`<p>${userText}</p>` —— 插值默认转义，防止用户输入的内容变成代码。
 * 嵌套的 html`` 和数组会原样拼接。
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
export const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** 读写 localStorage，任何异常都吞掉（隐私模式下可能不可用） */
export const saved = {
  get(key, fallback = null) {
    let v = null;
    try { v = localStorage.getItem(key); } catch { return fallback; }
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch { return v; }   // 兼容旧版直接存的字符串
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/** "2026-12-23" → Date（本地时间） */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function formatDay(s) {
  const d = parseDay(s);
  if (!d) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日`
                  : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
