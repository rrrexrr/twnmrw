/* 每日签到（放在首页倒计时卡片里）
   - Rex 和 洛洛 每人每天签到一次，显示连续天数
   - 每周一每人送 1 张补签卡，用不完会一直攒着，可以补签之前漏掉的日子
   - 点 📅 打开签到日历：看每天谁签了、补签、撤销

   每次签到存一条记录：kind = checkin，data = { who, day: "2026-10-07", makeup: true/false }
   补签卡不单独存，而是「到今天为止发了几张 − 已经补签了几次」算出来的，所以不会被改乱。 */
import { PERSON_1, PERSON_2, CHECKIN_START, MAKEUP_PER_WEEK } from "../config.js";
import { html, formatDay, parseDay } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, shower, buzz } from "../lib/celebrate.js";

const KIND = "checkin";
const PEOPLE = [PERSON_2, PERSON_1].filter(Boolean);   // 左 Rex，右 洛洛（和小人的位置一致）
const STREAK_PARTY = [3, 7, 14, 21, 30, 50, 100, 200, 365];
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/* ---------- 日期工具（全部用本地日期 "YYYY-MM-DD"） ---------- */

const pad2 = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const addDays = (key, n) => { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
/** 这一天所在那周的周一 */
const mondayOf = (key) => addDays(key, -((parseDay(key).getDay() + 6) % 7));
const START = parseDay(CHECKIN_START) ? CHECKIN_START : dayKey();

/* ---------- 统计（纯函数，方便测试） ---------- */

/** records → { 人名: Map(day → record) }，同一天重复的只算一次 */
export function indexRecords(records) {
  const by = Object.fromEntries(PEOPLE.map((p) => [p, new Map()]));
  const sorted = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of sorted) {
    const { who, day } = r.data || {};
    if (by[who] && parseDay(day) && !by[who].has(day)) by[who].set(day, r);
  }
  return by;
}

/** 到 today 为止一共发了几张补签卡：从 START 那周开始，每周 MAKEUP_PER_WEEK 张 */
export function cardsGranted(today) {
  if (today < START) return 0;
  const weeks = Math.floor(daysBetween(mondayOf(START), mondayOf(today)) / 7) + 1;
  return weeks * MAKEUP_PER_WEEK;
}

export function statsFor(days, today) {
  const signedToday = days.has(today);
  let streak = 0;
  for (let d = signedToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;
  const used = [...days.values()].filter((r) => r.data.makeup).length;
  const cards = Math.max(0, cardsGranted(today) - used);
  return { signedToday, streak, total: days.size, used, cards };
}

/* ---------- 组件 ---------- */

export function mountCheckin(host) {
  let alive = true;
  const state = {
    records: [], loaded: false, error: "", busy: false,
    view: null,          // 日历正在看的月份 { y, m }
    selected: null,      // 日历里选中的那天
  };
  let sheet = null;      // 打开着的日历弹层

  const today = () => dayKey();
  const index = () => indexRecords(state.records);

  /* ---------- 首页上的一行 ---------- */

  const renderRow = () => {
    if (!alive) return;
    if (store.isCloud && !store.hasCode()) {
      host.innerHTML = html`
        <div class="ci-row">
          <button type="button" class="ci-lock" data-ci="unlock">🔒 输入暗号，开始每日签到</button>
        </div>`;
      return;
    }
    const t = today();
    const by = index();
    host.innerHTML = html`
      <div class="ci-row" role="group" aria-label="每日签到">
        ${PEOPLE.map((p, i) => {
          const s = statsFor(by[p], t);
          const label = !state.loaded ? "…" : s.signedToday ? "✓" : "签到";
          return html`
            <button type="button" class="ci-pill ci-p${i} ${s.signedToday ? "is-done" : ""}"
                    data-ci="${s.signedToday ? "open" : "sign"}" data-who="${p}" ${!state.loaded || state.busy ? "disabled" : ""}
                    aria-label="${s.signedToday ? `${p} 今天已签到，连续 ${s.streak} 天` : `${p} 签到`}">
              <span class="ci-dot" aria-hidden="true"></span>
              <span class="ci-name">${p}</span>
              ${s.streak ? html`<span class="ci-streak" title="连续签到">🔥${s.streak}</span>` : ""}
              <span class="ci-act">${label}</span>
            </button>`;
        })}
        <button type="button" class="ci-cal" data-ci="open" aria-label="签到日历和补签">
          📅${state.loaded && PEOPLE.some((p) => statsFor(by[p], t).cards > 0) ? html`<i class="ci-badge" aria-hidden="true"></i>` : ""}
        </button>
      </div>
      ${state.error ? html`<p class="ci-error">${state.error} <button type="button" class="ci-link" data-ci="reload">再试一次</button></p>` : ""}`;
  };

  /* ---------- 日历弹层 ---------- */

  const sheetBody = () => {
    const t = today();
    const by = index();
    const stats = Object.fromEntries(PEOPLE.map((p) => [p, statsFor(by[p], t)]));
    const together = [...by[PEOPLE[0]].keys()].filter((d) => PEOPLE.every((p) => by[p].has(d))).length;

    const { y, m } = state.view;
    const first = dayKey(new Date(y, m, 1));
    const last = dayKey(new Date(y, m + 1, 0));
    const cells = [];
    for (let d = mondayOf(first); d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) cells.push(d);
    const minMonth = parseDay(START), now = new Date();
    const canPrev = y > minMonth.getFullYear() || (y === minMonth.getFullYear() && m > minMonth.getMonth());
    const canNext = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth());

    const sel = state.selected;
    const selInRange = sel >= START && sel <= t;

    return html`
      <div class="ci-stats">
        ${PEOPLE.map((p, i) => html`
          <div class="ci-stat ci-p${i}">
            <div class="ci-stat-name"><span class="ci-dot"></span>${p}</div>
            <div class="ci-stat-big">🔥 ${stats[p].streak}<small> 天连续</small></div>
            <div class="ci-stat-sub">共 ${stats[p].total} 天 · 补签卡 <b>${stats[p].cards}</b> 张</div>
          </div>`)}
      </div>
      <p class="ci-together">♥ 一起签到 <b>${together}</b> 天</p>

      <div class="ci-cal-head">
        <button type="button" class="icon-btn" data-ci="prev" ${canPrev ? "" : "disabled"} aria-label="上个月">‹</button>
        <span class="ci-month">${y}年${m + 1}月</span>
        <button type="button" class="icon-btn" data-ci="next" ${canNext ? "" : "disabled"} aria-label="下个月">›</button>
      </div>
      <div class="ci-grid" role="grid">
        ${WEEKDAYS.map((w) => html`<span class="ci-wd">${w}</span>`)}
        ${cells.map((d) => {
          const cls = [
            d.slice(0, 7) !== first.slice(0, 7) ? "is-out" : "",
            d === t ? "is-today" : "",
            d > t || d < START ? "is-off" : "",
            d === sel ? "is-sel" : "",
          ].join(" ");
          return html`
            <button type="button" class="ci-day ${cls}" data-ci="pick" data-day="${d}" ${d > t || d < START ? "disabled" : ""}
                    aria-label="${formatDay(d)}">
              <span class="ci-num">${parseDay(d).getDate()}</span>
              <span class="ci-dots">${PEOPLE.map((p, i) => {
                const r = by[p].get(d);
                return html`<i class="ci-p${i} ${r ? (r.data.makeup ? "is-makeup" : "is-on") : ""}"></i>`;
              })}</span>
            </button>`;
        })}
      </div>
      <div class="ci-legend" aria-hidden="true"><span><i></i>签到</span><span><i class="is-makeup"></i>补签</span></div>

      ${selInRange ? html`
        <div class="ci-detail">
          <div class="ci-detail-day">${formatDay(sel)}${sel === t ? "（今天）" : ""}</div>
          ${PEOPLE.map((p, i) => {
            const r = by[p].get(sel);
            const s = stats[p];
            let action;
            if (r) action = html`<span class="ci-state">${r.data.makeup ? "✓ 补签" : "✓ 已签到"}</span>
                                 <button type="button" class="ci-link" data-ci="undo" data-id="${r.id}">撤销</button>`;
            else if (sel === t) action = html`<button type="button" class="btn small primary" data-ci="sign" data-who="${p}">签到</button>`;
            else if (s.cards > 0) action = html`<button type="button" class="btn small" data-ci="makeup" data-who="${p}">用补签卡（剩 ${s.cards}）</button>`;
            else action = html`<span class="ci-state is-muted">没签到 · 补签卡用完了</span>`;
            return html`<div class="ci-line ci-p${i}"><span class="ci-dot"></span><span class="ci-line-name">${p}</span><span class="spacer"></span>${action}</div>`;
          })}
        </div>` : ""}

      <p class="ci-rule">每人每天签到一次 · 每周一每人送 ${MAKEUP_PER_WEEK} 张补签卡，用不完会一直攒着</p>`;
  };

  const renderSheet = () => {
    if (!sheet) return;
    const box = sheet.querySelector(".ci-sheet");
    if (box) box.innerHTML = sheetBody();
  };

  const render = () => { renderRow(); renderSheet(); };

  const openCalendar = () => {
    const now = new Date();
    state.view = { y: now.getFullYear(), m: now.getMonth() };
    state.selected = today();
    const s = openSheet({
      title: "签到日历",
      className: "sheet-checkin",
      body: html`<div class="ci-sheet">${sheetBody()}</div>`,
      onMount(el) { el.addEventListener("click", onClick); },
    });
    sheet = s.el;
    // 弹层关掉（被移除）后忘掉它
    const mo = new MutationObserver(() => { if (!sheet?.isConnected) { sheet = null; mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
  };

  /* ---------- 数据 ---------- */

  const load = async () => {
    if (store.isCloud && !store.hasCode()) { renderRow(); return; }
    try {
      state.records = await store.list(KIND);
      state.error = "";
    } catch (e) {
      if (!(e instanceof NetError)) return;   // 暗号失效会自动刷新页面
      state.error = "签到连不上云端";
    }
    state.loaded = true;
    render();
  };

  const save = async (data) => {
    state.busy = true; render();
    try {
      const item = await store.save(KIND, data);
      state.records.push(item);
      return item;
    } catch (e) {
      if (e instanceof NetError) toast("没签上，网络好像不太好", { tone: "bad" });
      throw e;
    } finally {
      state.busy = false;
    }
  };

  /* ---------- 动作 ---------- */

  const sign = async (who, fromEl) => {
    const t = today();
    if (index()[who]?.has(t)) { toast(`${who} 今天已经签过啦`); return; }
    try { await save({ who, day: t, makeup: false }); } catch { render(); return; }
    render();

    const by = index();
    const s = statsFor(by[who], t);
    const both = PEOPLE.every((p) => by[p].has(t));
    burstFrom(fromEl?.isConnected ? fromEl : host.querySelector(`[data-who="${who}"]`) || host, { count: 34, power: 0.9 });
    buzz([10, 40, 10]);
    if (STREAK_PARTY.includes(s.streak)) {
      setTimeout(() => shower(90), 250);
      toast(`${who} 连续签到 ${s.streak} 天！🎉`, { tone: "good", ms: 3200 });
    } else {
      toast(`${who} 签到成功 · 连续 ${s.streak} 天`, { tone: "good" });
    }
    if (both) setTimeout(() => { toast("今天你们俩都签到啦 ♥", { tone: "good" }); shower(50); }, 900);
  };

  const makeup = async (who, day) => {
    const t = today();
    const s = statsFor(index()[who], t);
    if (day >= t || day < START || index()[who].has(day)) return;
    if (s.cards < 1) { toast("补签卡用完啦，下周一会再送一张"); return; }
    const ok = await confirmSheet(`用 1 张补签卡，给 ${who} 补签 ${formatDay(day)}？（还剩 ${s.cards} 张）`, { ok: "补签" });
    if (!ok) return;
    try { await save({ who, day, makeup: true }); } catch { render(); return; }
    render();
    const after = statsFor(index()[who], t);
    buzz([10, 30, 10]);
    toast(`补签成功 · ${who} 现在连续 ${after.streak} 天`, { tone: "good" });
  };

  const undo = async (id) => {
    const r = state.records.find((x) => x.id === id);
    if (!r) return;
    const { who, day, makeup: mk } = r.data;
    const ok = await confirmSheet(`撤销 ${who} ${formatDay(day)} 的${mk ? "补签（补签卡会退回）" : "签到"}？`, { ok: "撤销", danger: true });
    if (!ok) return;
    try {
      // 同一个人同一天如果有重复记录，一起删掉
      const dupes = state.records.filter((x) => x.data.who === who && x.data.day === day);
      for (const x of dupes) await store.remove(x.id);
      state.records = state.records.filter((x) => !dupes.includes(x));
      render();
      toast("已撤销");
    } catch { toast("撤销失败，稍后再试", { tone: "bad" }); }
  };

  const unlock = () => {
    openSheet({
      title: "输入暗号",
      className: "sheet-unlock",
      body: html`<div class="ci-unlock"></div>`,
      onMount(el, close) {
        requireUnlock(el.querySelector(".ci-unlock")).then(() => { close(); load(); });
      },
    });
  };

  /* ---------- 事件 ---------- */

  const onClick = (e) => {
    const el = e.target.closest("[data-ci]");
    if (!el || el.disabled) return;
    switch (el.dataset.ci) {
      case "sign": sign(el.dataset.who, el); break;
      case "open": openCalendar(); break;
      case "unlock": unlock(); break;
      case "reload": load(); break;
      case "pick": state.selected = el.dataset.day; renderSheet(); break;
      case "makeup": makeup(el.dataset.who, state.selected); break;
      case "undo": undo(el.dataset.id); break;
      case "prev": case "next": {
        const d = new Date(state.view.y, state.view.m + (el.dataset.ci === "next" ? 1 : -1), 1);
        state.view = { y: d.getFullYear(), m: d.getMonth() };
        renderSheet();
        break;
      }
    }
  };
  host.addEventListener("click", onClick);

  // 对方签到了，这边过一会儿自动更新；过了零点也会刷新成新的一天
  const poll = setInterval(() => {
    if (document.visibilityState === "visible" && !state.busy && !document.querySelector("dialog.sheet-confirm")) load();
  }, 30000);
  const onVisible = () => { if (document.visibilityState === "visible") load(); };
  document.addEventListener("visibilitychange", onVisible);

  renderRow();
  load();

  return () => {
    alive = false;
    clearInterval(poll);
    host.removeEventListener("click", onClick);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
