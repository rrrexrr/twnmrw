/* 留言板
   - 写一张小便签：可以选颜色、选署名（Rex / 洛洛 / 不署名，会记住上次的选择）
   - 所有留言按时间倒序排成一面墙，点 ♡ 可以给对方的留言加爱心
   - 云端模式下开了邮件提醒的话，新留言会发邮件给你们 */
import { PERSON_1, PERSON_2 } from "../config.js";
import { html, saved, pick, timeAgo } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, buzz } from "../lib/celebrate.js";

const KIND = "note";
const SIGN_KEY = "hq:sign";
const DRAFT_KEY = "hq:note-draft";
const MAX_LEN = 500;
const PAGE = 30;

export const COLORS = [
  { id: "lavender", label: "薰衣草" },
  { id: "pink",     label: "樱花" },
  { id: "yellow",   label: "奶油" },
  { id: "mint",     label: "薄荷" },
  { id: "blue",     label: "天空" },
];
const colorOf = (id) => (COLORS.some((c) => c.id === id) ? id : "lavender");

export default {
  async mount(root) {
    let alive = true;
    const offs = [];

    if (store.isCloud) await requireUnlock(root);
    if (!alive || !root.isConnected) return;

    const people = [PERSON_2, PERSON_1].filter(Boolean);
    const state = {
      items: [], loaded: false, error: "", shown: PAGE,
      sign: people.includes(saved.get(SIGN_KEY, "")) ? saved.get(SIGN_KEY, "") : "",
      color: pick(COLORS).id,
      sending: false,
      justAdded: null,
    };
    // 点爱心先攒着，停手一会儿再一起保存
    const pendingHearts = new Map();   // id → 还没保存的次数
    const heartTimers = new Map();

    /* ---------- 渲染 ---------- */

    const composer = () => html`
      <section class="card note-compose note-${state.color}">
        <textarea class="note-input" name="text" maxlength="${MAX_LEN}" rows="3"
                  placeholder="想说的话，写在这里…" aria-label="留言内容"></textarea>
        <div class="note-opts">
          <div class="note-colors" role="radiogroup" aria-label="便签颜色">
            ${COLORS.map((c) => html`
              <button type="button" class="note-dot note-${c.id} ${state.color === c.id ? "is-on" : ""}"
                      data-act="color" data-color="${c.id}" role="radio"
                      aria-checked="${state.color === c.id ? "true" : "false"}" aria-label="${c.label}"></button>`)}
          </div>
          <span class="note-len" aria-hidden="true"></span>
        </div>
        <div class="note-foot">
          <div class="note-sign" role="radiogroup" aria-label="署名">
            <span class="note-sign-label">署名</span>
            ${[...people, ""].map((p) => html`
              <button type="button" class="chip note-sign-chip ${state.sign === p ? "is-on" : ""}"
                      data-act="sign" data-sign="${p}" role="radio"
                      aria-checked="${state.sign === p ? "true" : "false"}">${p || "不署名"}</button>`)}
          </div>
          <button type="button" class="btn primary note-send" data-act="send" ${state.sending ? "disabled" : ""}>贴上去 ✉︎</button>
        </div>
      </section>`;

    const wall = () => {
      if (!state.loaded) return html`<p class="empty">加载中…</p>`;
      if (state.error) return html`<div class="empty">${state.error}<br /><button type="button" class="btn small" data-act="reload">再试一次</button></div>`;
      if (!state.items.length) return html`<p class="empty note-empty">还没有留言。<br />写下第一张便签吧 ♡</p>`;

      const list = [...state.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const more = list.length - state.shown;
      return html`
        <ol class="note-wall">
          ${list.slice(0, state.shown).map((it, i) => {
            const d = it.data;
            const hearts = (d.hearts || 0) + (pendingHearts.get(it.id) || 0);
            return html`
              <li class="note note-${colorOf(d.color)} ${it.id === state.justAdded ? "is-new" : ""}"
                  data-id="${it.id}" style="--tilt:${i % 2 ? 0.6 : -0.6}deg">
                <p class="note-text">${d.text}</p>
                <div class="note-meta">
                  <span class="note-by">${d.sign ? `— ${d.sign}` : ""}</span>
                  <span class="note-time" title="${new Date(it.created_at).toLocaleString()}">${timeAgo(it.created_at)}</span>
                  <button type="button" class="note-heart ${hearts ? "has" : ""}" data-act="heart"
                          aria-label="送一颗爱心，现在有 ${hearts} 颗">${hearts ? `♥ ${hearts}` : "♡"}</button>
                  <button type="button" class="icon-btn note-more" data-act="more" aria-label="更多">⋯</button>
                </div>
              </li>`;
          })}
        </ol>
        ${more > 0 ? html`<div class="note-older"><button type="button" class="btn small ghost" data-act="older">再看更早的 ${Math.min(more, PAGE)} 条</button></div>` : ""}`;
    };

    const renderWall = () => {
      const host = root.querySelector(".note-wall-host");
      if (host) host.innerHTML = wall();
      const count = root.querySelector(".note-count");
      if (count) count.textContent = state.items.length ? String(state.items.length) : "";
    };

    // 输入框只渲染一次，之后只刷新留言墙，打字不会被打断
    const renderAll = () => {
      root.innerHTML = html`
        <header class="page-head">
          <div>
            <h1 class="page-title">留言板</h1>
            <p class="page-sub">想说的话，贴在这里</p>
          </div>
        </header>

        ${store.isCloud ? "" : html`<p class="local-note">现在是本地模式：留言只存在这台设备上。开启云端同步后，两个人才能看到彼此的留言。</p>`}

        ${composer()}

        <section class="card note-board">
          <div class="card-head"><h2 class="card-title">我们的留言墙 <span class="count note-count"></span></h2></div>
          <div class="note-wall-host"></div>
        </section>`;

      const input = root.querySelector(".note-input");
      input.value = saved.get(DRAFT_KEY, "");
      const onInput = () => {
        saved.set(DRAFT_KEY, input.value);
        autosize();
        updateLen();
      };
      input.addEventListener("input", onInput);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
      });
      autosize();
      updateLen();
      renderWall();
    };

    const autosize = () => {
      const input = root.querySelector(".note-input");
      if (!input) return;
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 320)}px`;
    };

    const updateLen = () => {
      const input = root.querySelector(".note-input");
      const len = root.querySelector(".note-len");
      if (!input || !len) return;
      const n = input.value.length;
      len.textContent = n > MAX_LEN - 80 ? `${n}/${MAX_LEN}` : "";
    };

    const repaintComposerOpts = () => {
      const box = root.querySelector(".note-compose");
      if (!box) return;
      box.className = `card note-compose note-${state.color}`;
      box.querySelectorAll("[data-act=color]").forEach((b) => {
        const on = b.dataset.color === state.color;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
      box.querySelectorAll("[data-act=sign]").forEach((b) => {
        const on = b.dataset.sign === state.sign;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
    };

    /* ---------- 数据 ---------- */

    const load = async () => {
      try {
        state.items = await store.list(KIND);
        state.error = "";
      } catch (e) {
        if (!(e instanceof NetError)) return;   // 暗号失效会自动回到密码页
        state.error = "连不上云端，检查一下网络";
      }
      state.loaded = true;
      if (alive) renderWall();
    };

    const upsertLocal = (item) => {
      const i = state.items.findIndex((x) => x.id === item.id);
      if (i >= 0) state.items[i] = item; else state.items.push(item);
    };

    /* ---------- 发留言 ---------- */

    const send = async () => {
      if (state.sending) return;
      const input = root.querySelector(".note-input");
      const text = input.value.trim();
      if (!text) { input.focus(); toast("先写点什么吧"); return; }

      state.sending = true;
      const btn = root.querySelector(".note-send");
      btn.disabled = true;
      try {
        const item = await store.save(KIND, { text, sign: state.sign, color: state.color, hearts: 0 });
        upsertLocal(item);
        state.justAdded = item.id;
        input.value = "";
        saved.remove(DRAFT_KEY);
        autosize(); updateLen();
        state.color = pick(COLORS.filter((c) => c.id !== state.color)).id;   // 下一张换个颜色
        repaintComposerOpts();
        renderWall();
        burstFrom(root.querySelector(".note.is-new") || btn, { count: 36, power: 0.9 });
        buzz([10, 40, 10]);
        toast(store.isCloud ? "贴上去啦 ✉︎" : "贴上去啦", { tone: "good" });
      } catch (e) {
        if (e instanceof NetError) toast("没发出去，网络好像不太好", { tone: "bad" });
      } finally {
        state.sending = false;
        if (btn.isConnected) btn.disabled = false;
      }
    };

    /* ---------- 爱心 ---------- */

    const heart = (id, el) => {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      pendingHearts.set(id, (pendingHearts.get(id) || 0) + 1);
      const hearts = (it.data.hearts || 0) + pendingHearts.get(id);
      el.textContent = `♥ ${hearts}`;
      el.classList.add("has");
      el.classList.remove("is-pop"); void el.offsetWidth; el.classList.add("is-pop");
      burstFrom(el, { count: 10, power: 0.45 });
      buzz([6]);

      clearTimeout(heartTimers.get(id));
      heartTimers.set(id, setTimeout(() => flushHearts(id), 700));
    };

    const flushHearts = async (id) => {
      heartTimers.delete(id);
      const add = pendingHearts.get(id) || 0;
      const it = state.items.find((x) => x.id === id);
      if (!add || !it) { pendingHearts.delete(id); return; }
      pendingHearts.delete(id);
      const data = { ...it.data, hearts: (it.data.hearts || 0) + add };
      it.data = data;
      try { upsertLocal(await store.save(KIND, data, id)); }
      catch (e) {
        it.data = { ...data, hearts: data.hearts - add };
        if (e instanceof NetError) toast("爱心没送出去，网络好像不太好", { tone: "bad" });
        if (alive) renderWall();
      }
    };

    /* ---------- 更多：复制 / 删除 ---------- */

    const more = (id) => {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      openSheet({
        title: "这张便签",
        body: html`
          <div class="sheet-list">
            <button type="button" class="btn block" data-act="n-copy">复制文字</button>
            <button type="button" class="btn block danger" data-act="n-delete">删除这张便签</button>
          </div>`,
        onMount(el, close) {
          el.querySelector('[data-act="n-copy"]').addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(it.data.text); toast("复制好了"); close(); }
            catch { toast("复制不了，长按文字手动复制吧"); }
          });
          el.querySelector('[data-act="n-delete"]').addEventListener("click", async () => {
            if (!(await confirmSheet("删除这张便签？删除后不能恢复。", { ok: "删除", danger: true }))) return;
            try {
              await store.remove(id);
              state.items = state.items.filter((x) => x.id !== id);
              close(); renderWall(); toast("已删除");
            } catch { toast("删除失败，稍后再试", { tone: "bad" }); }
          });
        },
      });
    };

    /* ---------- 事件 ---------- */

    const onClick = (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const id = el.closest(".note")?.dataset.id;
      switch (el.dataset.act) {
        case "send": send(); break;
        case "color": state.color = el.dataset.color; repaintComposerOpts(); break;
        case "sign":
          state.sign = el.dataset.sign;
          saved.set(SIGN_KEY, state.sign);
          repaintComposerOpts();
          break;
        case "heart": heart(id, el); break;
        case "more": more(id); break;
        case "older": state.shown += PAGE; renderWall(); break;
        case "reload": state.loaded = false; renderWall(); load(); break;
      }
    };
    root.addEventListener("click", onClick);
    offs.push(() => root.removeEventListener("click", onClick));

    // 对方写了新留言，这边过一会儿自动出现（正在点爱心时先不刷新）
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]") && !pendingHearts.size) load();
    }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible" && !pendingHearts.size) load(); };
    document.addEventListener("visibilitychange", onVisible);
    offs.push(() => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); });

    renderAll();
    load();

    return () => {
      alive = false;
      offs.forEach((f) => f());
      // 离开页面前，把还没保存的爱心存掉
      for (const [id, t] of heartTimers) { clearTimeout(t); flushHearts(id); }
    };
  },
};
