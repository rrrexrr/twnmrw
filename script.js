/* ==========================================================
   配置区 —— 只需要改这里 / CONFIGURATION — edit only this block
   ========================================================== */

// 起点时间（本地时间，格式：YYYY-MM-DDTHH:mm:ss）
const START_DATE = "2026-09-06T00:00:00";

// 见面时间（本地时间，格式：YYYY-MM-DDTHH:mm:ss）
const MEETING_DATE = "2026-12-23T23:59:59";

// 两个人的名字
const PERSON_1 = "洛洛";   // Willow
const PERSON_2 = "Rex";

// 地点（留空字符串 "" 则不显示这一行）
const LOCATION_1 = "";     // 例如 "Vancouver"
const LOCATION_2 = "";     // 例如 "上海"

// 文案
const EYEBROW      = "Next Meeting";
// 英文名字两边自动加空格，中文名字不加（排版更好看）
const sp = (name) => (/[A-Za-z0-9]/.test(name) ? ` ${name} ` : name);
const TITLE_TEXT   = `距离${sp(PERSON_2)}和${sp(PERSON_1)}下次见面还有`;
const ARRIVED_TEXT = "❤️见面就是今天❤️";

// 见面当天，标题会换成下面这两行
const ARRIVED_EYEBROW = "Today";
const ARRIVED_TITLE   = `${sp(PERSON_2)}和${sp(PERSON_1)}`.trim();
const FOOTER_TEXT  = "一天一天，都在靠近";

// 百分比小数位数
const PERCENT_DECIMALS = 2;

// 时间轴两端日期的显示语言（"en-US" → September 6；"zh-CN" → 9月6日）
const LABEL_LOCALE = "en-US";

/* ==========================================================
   以下是实现代码，一般不需要修改
   Implementation below — no need to edit
   ========================================================== */

const el = (id) => document.getElementById(id);

const escapeHtml = (str) =>
  String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** 把标题里的人名包起来，避免在窄屏上从名字中间断行 */
function titleHtml(text) {
  const names = [PERSON_1, PERSON_2]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => escapeHtml(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const html = escapeHtml(text);
  if (!names.length) return html;
  return html.replace(new RegExp(names.join("|"), "g"), (m) => `<span class="nowrap">${m}</span>`);
}

const ui = {
  eyebrow: el("eyebrow"),
  title: el("title"),
  places: el("places"),
  countdown: el("countdown"),
  days: el("days"),
  hours: el("hours"),
  minutes: el("minutes"),
  seconds: el("seconds"),
  arrival: el("arrival"),
  percent: el("percent"),
  bar: el("bar"),
  fill: el("fill"),
  marker: el("marker"),
  startLabel: el("startLabel"),
  meetLabel: el("meetLabel"),
  footText: el("footText"),
  error: el("error"),
};

/** 把 "2026-09-06T00:00:00" 解析成本地时间，失败返回 null */
function parseLocalDate(value) {
  if (typeof value !== "string") return null;
  const m = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  // 校验（避免 2026-02-31 这类无效日期）
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== +y ||
    date.getMonth() !== +mo - 1 ||
    date.getDate() !== +d
  ) {
    return null;
  }
  return date;
}

function formatDateLabel(date) {
  try {
    return new Intl.DateTimeFormat(LABEL_LOCALE, {
      month: "long",
      day: "numeric",
    }).format(date);
  } catch (e) {
    return date.toDateString();
  }
}

function toDateTimeAttr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function showError(message) {
  ui.error.textContent = message;
  ui.error.hidden = false;
  ui.countdown.classList.add("is-done");
  ui.percent.textContent = "—";
}

/** 渲染静态文案 */
function renderStaticText(start, meeting) {
  document.title = TITLE_TEXT;
  ui.eyebrow.textContent = EYEBROW;
  ui.title.innerHTML = titleHtml(TITLE_TEXT);
  ui.arrival.textContent = ARRIVED_TEXT;
  ui.footText.textContent = FOOTER_TEXT;

  if (LOCATION_1 && LOCATION_2) {
    ui.places.textContent = `${LOCATION_1} → ${LOCATION_2}`;
    ui.places.hidden = false;
  }

  ui.startLabel.textContent = formatDateLabel(start);
  ui.startLabel.dateTime = toDateTimeAttr(start);
  ui.meetLabel.textContent = formatDateLabel(meeting);
  ui.meetLabel.dateTime = toDateTimeAttr(meeting);
}

/** 计算进度百分比，限制在 0–100 之间 */
function computeProgress(now, start, meeting) {
  const span = meeting - start;
  if (span <= 0) return 100;
  const ratio = ((now - start) / span) * 100;
  return Math.min(100, Math.max(0, ratio));
}

/** 把剩余毫秒拆成 天/时/分/秒 */
function splitRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad2 = (n) => String(n).padStart(2, "0");

function tick(start, meeting) {
  const now = new Date();
  const remaining = meeting - now;
  const percent = computeProgress(now, start, meeting);
  const arrived = remaining <= 0;

  // 进度条 + 时间轴标记
  const shown = arrived ? 100 : percent;
  ui.fill.style.width = shown + "%";
  ui.marker.style.setProperty("--p", shown / 100);
  ui.percent.textContent = shown.toFixed(PERCENT_DECIMALS) + "%";
  ui.bar.setAttribute("aria-valuenow", shown.toFixed(PERCENT_DECIMALS));
  ui.fill.classList.toggle("is-full", shown >= 100);
  ui.percent.classList.toggle("is-full", shown >= 100);
  ui.marker.classList.toggle("is-full", shown >= 100);

  // 倒计时 / 见面状态
  if (arrived) {
    ui.countdown.classList.add("is-done");
    ui.arrival.hidden = false;
    ui.eyebrow.textContent = ARRIVED_EYEBROW;
    ui.title.innerHTML = titleHtml(ARRIVED_TITLE);
    return true;
  }

  const t = splitRemaining(remaining);
  ui.days.textContent = String(t.days);
  ui.hours.textContent = pad2(t.hours);
  ui.minutes.textContent = pad2(t.minutes);
  ui.seconds.textContent = pad2(t.seconds);
  return false;
}

function init() {
  const start = parseLocalDate(START_DATE);
  const meeting = parseLocalDate(MEETING_DATE);

  if (!start || !meeting) {
    showError("日期格式有误，请检查 script.js 里的 START_DATE 和 MEETING_DATE（格式：2026-12-23T23:59:59）。");
    return;
  }
  if (meeting <= start) {
    showError("见面时间需要晚于起点时间，请检查 script.js 里的日期设置。");
    return;
  }

  renderStaticText(start, meeting);

  // 首次渲染前先把进度条放在 0，再更新，制造一次入场动画
  requestAnimationFrame(() => {
    const done = tick(start, meeting);
    if (done) return;
    const timer = setInterval(() => {
      if (tick(start, meeting)) clearInterval(timer);
    }, 1000);
  });
}

document.addEventListener("DOMContentLoaded", init);
