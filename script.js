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

// 像素小人的配色（左边是 PERSON_2 / Rex，右边是 PERSON_1 / 洛洛）
const PIXEL_COLORS = {
  h: "#4a4250",  // Rex 头发
  H: "#5a3f3a",  // 洛洛 头发
  s: "#f8d8c0",  // 皮肤
  e: "#3a3444",  // 眼睛
  a: "#a996e8",  // Rex 衣服
  b: "#f4a6bb",  // 洛洛 裙子
  l: "#6f6880",  // 腿
  o: "#4a4455",  // 鞋
};

// 点击冒出的爱心颜色 / 每次冒几颗
const HEART_COLORS = ["#f4718f", "#ff93ad", "#e8709a", "#a996e8"];
const HEARTS_PER_TAP = 5;

// 提示文字（设成 "" 则不显示）
const HINT_TEXT = "轻点一下 ♡";

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

/* ---------- 像素小人 ---------- */

// 每格一个字符：. = 透明，其余对应 PIXEL_COLORS 里的颜色
const REX_A = [
  "..hhhh..",
  ".hhhhhh.",
  ".hssssh.",
  ".hseses.",
  "..ssss..",
  ".aaaaaa.",
  ".aaaaaas",
  ".aaaaaa.",
  ".aaaaaa.",
  "..llll..",
  "..l..l..",
  "..l..l..",
  "..o..o..",
];

const WILLOW_A = [
  "..HHHH..",
  ".HHHHHH.",
  ".HssssH.",
  ".HseseH.",
  ".HssssH.",
  ".bbbbbb.",
  "sbbbbbb.",
  ".bbbbbb.",
  ".bbbbbb.",
  "bbbbbbbb",
  "..l..l..",
  "..l..l..",
  "..o..o..",
];

// 第二帧只换腿的姿势，两帧交替就是走路
const stepFrame = (rows) =>
  rows.map((row, i) => (i >= 10 ? row.replace("l..l", ".ll.").replace("o..o", ".oo.") : row));

const HEART = [
  ".hh.hh.",
  "hhhhhhh",
  "hhhhhhh",
  ".hhhhh.",
  "..hhh..",
  "...h...",
];

/** 把两个小人并排拼起来，中间那格画成牵着的手 */
function joinSprites(left, right, gap = 2, handRow = 6) {
  return left.map((row, i) => row + (i === handRow ? "s".repeat(gap) : ".".repeat(gap)) + right[i]);
}

/** 把字符地图转成 <svg>，同一行连续同色的格子会合并成一个矩形 */
function spriteSvg(rows, colors, attrs = "") {
  const w = rows[0].length;
  const h = rows.length;
  let rects = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      if (ch === ".") { x++; continue; }
      let run = 1;
      while (x + run < w && row[x + run] === ch) run++;
      const color = colors[ch] || "#000";
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${color}"/>`;
      x += run;
    }
  });
  return `<svg viewBox="0 0 ${w} ${h}" ${attrs}>${rects}</svg>`;
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
  couple: el("couple"),
  hint: el("hint"),
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

/** 画出两个手牵手的小人（两帧）+ 一个装爱心的图层 */
function buildCouple() {
  const frameA = joinSprites(REX_A, WILLOW_A);
  const frameB = joinSprites(stepFrame(REX_A), stepFrame(WILLOW_A));
  ui.couple.innerHTML =
    spriteSvg(frameA, PIXEL_COLORS, 'class="px-frame-a"') +
    spriteSvg(frameB, PIXEL_COLORS, 'class="px-frame-b"') +
    '<div class="px-hearts" id="hearts"></div>';
  ui.couple.classList.add("is-walking");
  ui.hearts = el("hearts");
}

const rand = (min, max) => min + Math.random() * (max - min);

/** 在两人头顶冒爱心 */
function spawnHearts(count = HEARTS_PER_TAP) {
  if (!ui.hearts || ui.hearts.childElementCount > 40) return;
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    const color = HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
    const size = rand(9, 16);
    heart.className = "px-heart";
    heart.style.width = size + "px";
    heart.style.height = size * 6 / 7 + "px";
    heart.style.setProperty("--x0", rand(-10, 10).toFixed(1) + "px");
    heart.style.setProperty("--x1", rand(-26, 26).toFixed(1) + "px");
    heart.style.setProperty("--dur", rand(1.1, 1.9).toFixed(2) + "s");
    heart.style.animationDelay = rand(0, 0.25).toFixed(2) + "s";
    heart.innerHTML = spriteSvg(HEART, { h: color });
    heart.addEventListener("animationend", () => heart.remove());
    ui.hearts.appendChild(heart);
  }
}

/** 点击 / 触摸页面任意位置都会冒爱心 */
function bindTapHearts() {
  document.addEventListener("pointerdown", () => {
    spawnHearts();
    if (ui.hint && !ui.hint.classList.contains("is-gone")) {
      ui.hint.classList.add("is-gone");
    }
  });
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

  if (HINT_TEXT) {
    ui.hint.textContent = HINT_TEXT;
  } else {
    ui.hint.hidden = true;
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
  ui.couple.style.setProperty("--p", shown / 100);
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
  buildCouple();
  bindTapHearts();

  // 首次渲染前先把进度条放在 0，再更新，制造一次入场动画
  requestAnimationFrame(() => {
    const done = tick(start, meeting);
    if (done) {
      // 见面当天：自己也会不停冒爱心
      spawnHearts(6);
      setInterval(() => spawnHearts(3), 2600);
      return;
    }
    const timer = setInterval(() => {
      if (tick(start, meeting)) clearInterval(timer);
    }, 1000);
  });
}

document.addEventListener("DOMContentLoaded", init);
