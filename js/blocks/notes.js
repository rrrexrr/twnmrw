/* 留言板
   - 写一张小便签：可以选颜色、选署名（Rex / 洛洛 / 不署名，会记住上次的选择）
   - 所有留言按时间倒序排成一面墙，点 ♡ 可以给对方的留言加爱心
   - 每张便签下面可以回复，回复按时间顺序排在便签底下
   - 云端模式下开了邮件提醒的话，新留言 / 新回复都会发邮件给你们

   回复单独存一条记录（kind = note_reply，data.noteId 指向便签），
   这样两个人同时回复也不会互相覆盖。 */
import { PERSON_1, PERSON_2 } from "../config.js";
import { html, saved, pick, timeAgo } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, buzz } from "../lib/celebrate.js";

const KIND = "note";
const REPLY = "note_reply";
const REPLY_MAX = 300;
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
      items: [], replies: [], loaded: false, error: "", shown: PAGE,
      sign: people.includes(saved.get(SIGN_KEY, "")) ? saved.get(SIGN_KEY, "") : "",
      color: pick(COLORS).id,
      sending: false,
      justAdded: null,
      replyingTo: null,     // 正在回复哪张便签
      replyDraft: "",
      replySending: false,
      justReplied: null,
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
          ${signChips()}
          <button type="button" class="btn primary note-send" data-act="send" ${state.sending ? "disabled" : ""}>贴上去 ✉︎</button>
        </div>
      </section>`;

    const wall = () => {
      if (!state.loaded) return html`<p class="empty">加载中…</p>`;
      if (state.error) return html`<div class="empty">${state.error}<br /><button type="button" class="btn small" data-act="reload">再试一次</button></div>`;
      if (!state.items.length) return html`<p class="empty note-empty">还没有留言。<br />写下第一张便签吧 ♡</p>`;

      const list = [...state.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const repliesOf = groupReplies();
      const more = list.length - state.shown;
      return html`
        <ol class="note-wall">
          ${list.slice(0, state.shown).map((it, i) => {
            const d = it.data;
            const hearts = (d.hearts || 0) + (pendingHearts.get(it.id) || 0);
            const replies = repliesOf.get(it.id) || [];
            const open = state.replyingTo === it.id;
            return html`
              <li class="note note-${colorOf(d.color)} ${it.id === state.justAdded ? "is-new" : ""}"
                  data-id="${it.id}" style="--tilt:${i % 2 ? 0.6 : -0.6}deg">
                <p class="note-text">${d.text}</p>
                <div class="note-meta">
                  <span class="note-by">${d.sign ? `— ${d.sign}` : ""}</span>
                  <span class="note-time" title="${new Date(it.created_at).toLocaleString()}">${timeAgo(it.created_at)}</span>
                  <button type="button" class="note-heart ${hearts ? "has" : ""}" data-act="heart"
                          aria-label="送一颗爱心，现在有 ${hearts} 颗">${hearts ? `♥ ${hearts}` : "♡"}</button>
                  <button type="button" class="note-reply-btn ${open ? "is-on" : ""}" data-act="reply"
                          aria-expanded="${open ? "true" : "false"}">回复${replies.length ? ` ${replies.length}` : ""}</button>
                  <button type="button" class="icon-btn note-more" data-act="more" aria-label="更多">⋯</button>
                </div>
                ${replies.length ? html`
                  <ul class="reply-list">
                    ${replies.map((r) => html`
                      <li class="reply ${r.id === state.justReplied ? "is-new" : ""}" data-reply-id="${r.id}">
                        <p class="reply-text">${r.data.sign ? html`<b class="reply-by">${r.data.sign}：</b>` : ""}${r.data.text}</p>
                        <div class="reply-meta">
                          <span>${timeAgo(r.created_at)}</span>
                          <button type="button" class="reply-del" data-act="reply-more" aria-label="更多">⋯</button>
                        </div>
                      </li>`)}
                  </ul>` : ""}
                ${open ? replyBox() : ""}
              </li>`;
          })}
        </ol>
        ${more > 0 ? html`<div class="note-older"><button type="button" class="btn small ghost" data-act="older">再看更早的 ${Math.min(more, PAGE)} 条</button></div>` : ""}`;
    };

    const groupReplies = () => {
      const map = new Map();
      for (const r of [...state.replies].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        const k = r.data.noteId;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      }
      return map;
    };

    const signChips = (cls = "") => html`
      <div class="note-sign ${cls}" role="radiogroup" aria-label="署名">
        <span class="note-sign-label">署名</span>
        ${[...people, ""].map((p) => html`
          <button type="button" class="chip note-sign-chip ${state.sign === p ? "is-on" : ""}"
                  data-act="sign" data-sign="${p}" role="radio"
                  aria-checked="${state.sign === p ? "true" : "false"}">${p || "不署名"}</button>`)}
      </div>`;

    const replyBox = () => html`
      <div class="reply-box">
        <textarea class="reply-input" maxlength="${REPLY_MAX}" rows="2" placeholder="回复这张便签…" aria-label="回复内容"></textarea>
        <div class="reply-foot">
          ${signChips("is-compact")}
          <span class="reply-actions">
            <button type="button" class="btn small ghost" data-act="reply-cancel">取消</button>
            <button type="button" class="btn small primary" data-act="reply-send" ${state.replySending ? "disabled" : ""}>回复</button>
          </span>
        </div>
      </div>`;

    const renderWall = () => {
      const host = root.querySelector(".note-wall-host");
      const hadFocus = document.activeElement?.classList.contains("reply-input");
      if (host) host.innerHTML = wall();
      // 重新渲染后把回复框里写了一半的字放回去
      const box = root.querySelector(".reply-input");
      if (box) {
        box.value = state.replyDraft;
        autosizeEl(box, 200);
        if (hadFocus) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }
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

    const autosizeEl = (el, max) => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    };
    const autosize = () => {
      const input = root.querySelector(".note-input");
      if (input) autosizeEl(input, 320);
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
      root.querySelectorAll("[data-act=sign]").forEach((b) => {
        const on = b.dataset.sign === state.sign;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", String(on));
      });
    };

    /* ---------- 数据 ---------- */

    const load = async () => {
      try {
        const [items, replies] = await Promise.all([store.list(KIND), store.list(REPLY)]);
        state.items = items;
        state.replies = replies;
        state.error = "";
      } catch (e) {
        if (!(e instanceof NetError)) return;   // 暗号失效会自动回到密码页
        state.error = "连不上云端，检查一下网络";
      }
      state.loaded = true;
      if (alive) renderWall();
    };

    const upsertLocal = (item, list = state.items) => {
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = item; else list.push(item);
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

    /* ---------- 回复 ---------- */

    const busyTyping = () => Boolean(state.replyingTo && state.replyDraft.trim());

    const toggleReply = (id) => {
      if (state.replyingTo === id) { state.replyingTo = null; state.replyDraft = ""; renderWall(); return; }
      state.replyingTo = id;
      state.replyDraft = "";
      renderWall();
      const box = root.querySelector(".reply-input");
      box?.focus();
      box?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    const sendReply = async () => {
      const noteId = state.replyingTo;
      if (!noteId || state.replySending) return;
      const text = state.replyDraft.trim();
      const box = root.querySelector(".reply-input");
      if (!text) { box?.focus(); toast("先写点什么吧"); return; }

      state.replySending = true;
      const btn = root.querySelector('[data-act="reply-send"]');
      if (btn) btn.disabled = true;
      try {
        const item = await store.save(REPLY, { noteId, text, sign: state.sign });
        upsertLocal(item, state.replies);
        state.justReplied = item.id;
        state.replyingTo = null;
        state.replyDraft = "";
        renderWall();
        burstFrom(root.querySelector(".reply.is-new"), { count: 18, power: 0.6 });
        buzz([8, 30, 8]);
        toast("回复好啦", { tone: "good" });
      } catch (e) {
        if (e instanceof NetError) toast("没回复成功，网络好像不太好", { tone: "bad" });
      } finally {
        state.replySending = false;
        const b = root.querySelector('[data-act="reply-send"]');
        if (b) b.disabled = false;
      }
    };

    const replyMore = (rid) => {
      const r = state.replies.find((x) => x.id === rid);
      if (!r) return;
      openSheet({
        title: "这条回复",
        body: html`
          <div class="sheet-list">
            <button type="button" class="btn block" data-act="r-copy">复制文字</button>
            <button type="button" class="btn block danger" data-act="r-delete">删除这条回复</button>
          </div>`,
        onMount(el, close) {
          el.querySelector('[data-act="r-copy"]').addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(r.data.text); toast("复制好了"); close(); }
            catch { toast("复制不了，长按文字手动复制吧"); }
          });
          el.querySelector('[data-act="r-delete"]').addEventListener("click", async () => {
            if (!(await confirmSheet("删除这条回复？", { ok: "删除", danger: true }))) return;
            try {
              await store.remove(rid);
              state.replies = state.replies.filter((x) => x.id !== rid);
              close(); renderWall(); toast("已删除");
            } catch { toast("删除失败，稍后再试", { tone: "bad" }); }
          });
        },
      });
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
            const n = state.replies.filter((r) => r.data.noteId === id).length;
            if (!(await confirmSheet(`删除这张便签${n ? `和下面的 ${n} 条回复` : ""}？删除后不能恢复。`, { ok: "删除", danger: true }))) return;
            try {
              await store.remove(id);
              state.items = state.items.filter((x) => x.id !== id);
              // 便签下面的回复一起删掉
              const mine = state.replies.filter((r) => r.data.noteId === id);
              state.replies = state.replies.filter((r) => r.data.noteId !== id);
              if (state.replyingTo === id) { state.replyingTo = null; state.replyDraft = ""; }
              close(); renderWall(); toast("已删除");
              for (const r of mine) store.remove(r.id).catch(() => {});
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
        case "reply": toggleReply(id); break;
        case "reply-cancel": state.replyingTo = null; state.replyDraft = ""; renderWall(); break;
        case "reply-send": sendReply(); break;
        case "reply-more": replyMore(el.closest(".reply")?.dataset.replyId); break;
        case "more": more(id); break;
        case "older": state.shown += PAGE; renderWall(); break;
        case "reload": state.loaded = false; renderWall(); load(); break;
      }
    };
    root.addEventListener("click", onClick);
    const onInput = (e) => {
      if (!e.target.classList?.contains("reply-input")) return;
      state.replyDraft = e.target.value;
      autosizeEl(e.target, 200);
    };
    const onKey = (e) => {
      if (e.target.classList?.contains("reply-input") && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); sendReply();
      }
    };
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKey);
    offs.push(() => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("keydown", onKey);
    });

    // 对方写了新留言，这边过一会儿自动出现（正在点爱心时先不刷新）
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]") && !pendingHearts.size && !busyTyping()) load();
    }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible" && !pendingHearts.size && !busyTyping()) load(); };
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
