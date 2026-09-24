/* 首页：见面倒计时 */
import * as C from "../config.js";
import { html, raw, esc, rand } from "../lib/dom.js";
import { pixelSvg, REX, WILLOW, HEART, stepFrame, joinSprites } from "../lib/pixel.js";

/* ---------- 日期工具 ---------- */

function parseLocalDate(value) {
  const m = String(value || "").trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  const valid = !isNaN(date) && date.getFullYear() === +y && date.getMonth() === +mo - 1 && date.getDate() === +d;
  return valid ? date : null;
}

function formatLabel(date) {
  try { return new Intl.DateTimeFormat(C.LABEL_LOCALE, { month: "long", day: "numeric" }).format(date); }
  catch { return date.toDateString(); }
}

const pad2 = (n) => String(n).padStart(2, "0");

function splitRemaining(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/** 把标题里的人名包起来，窄屏上不会从名字中间断行 */
function titleHtml(text) {
  const names = [C.PERSON_1, C.PERSON_2].filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const safe = esc(text);
  return names.length ? safe.replace(new RegExp(names.join("|"), "g"), (m) => `<span class="nowrap">${m}</span>`) : safe;
}

/* ---------- 页面 ---------- */

function template() {
  return html`
  <section class="card home-card">
    <header class="head">
      <p class="eyebrow" data-ref="eyebrow" hidden></p>
      <h1 class="title" data-ref="title">${raw(titleHtml(C.TITLE_TEXT))}</h1>
      <p class="places" data-ref="places" hidden></p>
    </header>

    <section class="countdown" data-ref="countdown" aria-live="polite" aria-label="倒计时">
      ${[["d", "天"], ["h", "时"], ["m", "分"], ["s", "秒"]].map(([k, label], i) => html`
        ${i ? raw('<div class="sep" aria-hidden="true"></div>') : ""}
        <div class="unit"><span class="num" data-ref="${k}">--</span><span class="lbl">${label}</span></div>`)}
    </section>

    <p class="arrival" data-ref="arrival" hidden></p>

    <section class="progress" aria-label="进度">
      <div class="progress-meta">
        <span class="progress-label">已走过</span>
        <span class="progress-value" data-ref="percent">--</span>
      </div>
      <div class="walk"><div class="couple" data-ref="couple" aria-hidden="true"></div></div>
      <div class="bar" data-ref="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="fill" data-ref="fill">
          <span class="fill-flow" aria-hidden="true"></span>
          <span class="fill-sheen" aria-hidden="true"></span>
        </div>
      </div>
      <div class="timeline">
        <time class="tl-date" data-ref="startLabel">—</time>
        <div class="tl-track">
          <span class="tl-line" aria-hidden="true"></span>
          <span class="tl-dot" data-ref="marker" aria-hidden="true"></span>
        </div>
        <time class="tl-date" data-ref="meetLabel">—</time>
      </div>
      <p class="hint" data-ref="hint"></p>
    </section>

    <footer class="foot">
      <span class="heart" aria-hidden="true">♥</span>
      <span class="foot-text">${C.FOOTER_TEXT}</span>
    </footer>

    <p class="error" data-ref="error" hidden role="alert"></p>
  </section>`;
}

export default {
  mount(root) {
    root.innerHTML = template();
    const ref = Object.fromEntries([...root.querySelectorAll("[data-ref]")].map((n) => [n.dataset.ref, n]));
    const timers = [];
    const offs = [];

    /* 静态文案 */
    ref.eyebrow.textContent = C.EYEBROW;
    ref.eyebrow.hidden = !C.EYEBROW;
    if (C.LOCATION_1 && C.LOCATION_2) {
      ref.places.textContent = `${C.LOCATION_1} → ${C.LOCATION_2}`;
      ref.places.hidden = false;
    }
    ref.hint.textContent = C.HINT_TEXT;
    ref.hint.hidden = !C.HINT_TEXT;

    /* 牵手的小人 */
    const frameA = joinSprites(REX, WILLOW);
    const frameB = joinSprites(stepFrame(REX), stepFrame(WILLOW));
    ref.couple.innerHTML =
      pixelSvg(frameA, C.PIXEL_COLORS, { cls: "px-frame-a" }) +
      pixelSvg(frameB, C.PIXEL_COLORS, { cls: "px-frame-b" }) +
      '<div class="px-hearts"></div>';
    ref.couple.classList.add("is-walking");
    const heartsLayer = ref.couple.querySelector(".px-hearts");

    const spawnHearts = (count = C.HEARTS_PER_TAP) => {
      if (heartsLayer.childElementCount > 40) return;
      for (let i = 0; i < count; i++) {
        const h = document.createElement("span");
        const size = rand(9, 16);
        h.className = "px-heart";
        h.style.width = `${size}px`;
        h.style.height = `${(size * 6) / 7}px`;
        h.style.setProperty("--x0", `${rand(-10, 10).toFixed(1)}px`);
        h.style.setProperty("--x1", `${rand(-26, 26).toFixed(1)}px`);
        h.style.setProperty("--dur", `${rand(1.1, 1.9).toFixed(2)}s`);
        h.style.animationDelay = `${rand(0, 0.25).toFixed(2)}s`;
        const color = C.HEART_COLORS[Math.floor(Math.random() * C.HEART_COLORS.length)];
        h.innerHTML = pixelSvg(HEART, { h: color });
        h.addEventListener("animationend", () => h.remove());
        heartsLayer.append(h);
      }
    };

    /* 点屏幕冒爱心（点导航和按钮时不算） */
    const onTap = (e) => {
      if (e.target.closest?.(".tabbar, .bg-switch, dialog, a, button")) return;
      spawnHearts();
      ref.hint.classList.add("is-gone");
    };
    addEventListener("pointerdown", onTap);
    offs.push(() => removeEventListener("pointerdown", onTap));

    /* 日期 */
    const start = parseLocalDate(C.START_DATE);
    const meeting = parseLocalDate(C.MEETING_DATE);
    const showError = (msg) => {
      ref.error.textContent = msg;
      ref.error.hidden = false;
      ref.countdown.classList.add("is-done");
      ref.percent.textContent = "—";
    };
    if (!start || !meeting) {
      showError("日期格式有误，请检查 js/config.js 里的 START_DATE 和 MEETING_DATE（格式：2026-12-23T23:59:59）。");
      return () => offs.forEach((f) => f());
    }
    if (meeting <= start) {
      showError("见面时间需要晚于起点时间，请检查 js/config.js 里的日期设置。");
      return () => offs.forEach((f) => f());
    }
    ref.startLabel.textContent = formatLabel(start);
    ref.meetLabel.textContent = formatLabel(meeting);

    const tick = () => {
      const now = new Date();
      const remaining = meeting - now;
      const arrived = remaining <= 0;
      const pct = arrived ? 100 : Math.min(100, Math.max(0, ((now - start) / (meeting - start)) * 100));

      ref.fill.style.width = `${pct}%`;
      ref.marker.style.setProperty("--p", pct / 100);
      ref.couple.style.setProperty("--p", pct / 100);
      ref.percent.textContent = `${pct.toFixed(C.PERCENT_DECIMALS)}%`;
      ref.bar.setAttribute("aria-valuenow", pct.toFixed(C.PERCENT_DECIMALS));
      const full = pct >= 100;
      ref.fill.classList.toggle("is-full", full);
      ref.percent.classList.toggle("is-full", full);
      ref.marker.classList.toggle("is-full", full);

      if (arrived) {
        ref.countdown.classList.add("is-done");
        ref.arrival.textContent = C.ARRIVED_TEXT;
        ref.arrival.hidden = false;
        ref.eyebrow.textContent = C.ARRIVED_EYEBROW;
        ref.eyebrow.hidden = !C.ARRIVED_EYEBROW;
        ref.title.innerHTML = titleHtml(C.ARRIVED_TITLE);
        return true;
      }
      const t = splitRemaining(remaining);
      ref.d.textContent = String(t.d);
      ref.h.textContent = pad2(t.h);
      ref.m.textContent = pad2(t.m);
      ref.s.textContent = pad2(t.s);
      return false;
    };

    requestAnimationFrame(() => {
      if (tick()) {
        spawnHearts(6);
        timers.push(setInterval(() => spawnHearts(3), 2600));
        return;
      }
      const id = setInterval(() => { if (tick()) clearInterval(id); }, 1000);
      timers.push(id);
    });

    return () => {
      timers.forEach(clearInterval);
      offs.forEach((f) => f());
    };
  },
};
