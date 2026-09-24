/* 里程碑：一起完成的每一步
   - 时间线 + 总进度条，完成一步就往前推一格
   - 完成时：彩纸炸开、解锁一张像素贴纸、攒够数量升级
   - 可以随时添加 / 编辑 / 删除 */
import { MEETING_DATE } from "../config.js";
import { html, raw, parseDay, formatDay, timeAgo } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, shower, buzz } from "../lib/celebrate.js";
import { STICKERS, TROPHY, pixelSvg, sticker } from "../lib/pixel.js";

const KIND = "milestone";

export const LEVELS = [
  { at: 0,  name: "刚刚出发" },
  { at: 1,  name: "初次心动" },
  { at: 3,  name: "渐入佳境" },
  { at: 5,  name: "心有灵犀" },
  { at: 8,  name: "形影不离" },
  { at: 12, name: "默契满分" },
  { at: 17, name: "非你不可" },
  { at: 23, name: "天生一对" },
  { at: 30, name: "白头偕老" },
];

export function levelOf(doneCount) {
  let i = 0;
  while (i + 1 < LEVELS.length && doneCount >= LEVELS[i + 1].at) i++;
  return { lv: i, ...LEVELS[i], next: LEVELS[i + 1] || null };
}

const EXAMPLES = [
  { title: "第一次见面", note: "那天的天气还记得吗？" },
  { title: "确定关系" },
  { title: "第一次视频聊到天亮" },
  { title: "一起过一个生日" },
  { title: "下次见面", date: String(MEETING_DATE).slice(0, 10), note: "倒计时里那一天" },
  { title: "一起去旅行" },
];

/* 排序：有日期的按日期，没日期的排后面，再按创建时间 */
function sortItems(items) {
  return [...items].sort((a, b) => {
    const da = a.data.date || "9999", db = b.data.date || "9999";
    return da === db ? a.created_at.localeCompare(b.created_at) : da.localeCompare(db);
  });
}

/* 每个已完成的里程碑按完成先后拿到一张贴纸 */
function stickerRanks(items) {
  const done = items.filter((i) => i.data.done)
    .sort((a, b) => (a.data.doneAt || a.updated_at).localeCompare(b.data.doneAt || b.updated_at));
  return new Map(done.map((it, idx) => [it.id, idx]));
}

export default {
  async mount(root) {
    let alive = true;
    const offs = [];

    if (store.isCloud) await requireUnlock(root);
    if (!alive || !root.isConnected) return;

    const state = { items: [], loaded: false, error: "", lastPct: 0, justDone: null };

    /* ---------- 渲染 ---------- */

    const render = () => {
      const items = sortItems(state.items);
      const total = items.length;
      const doneCount = items.filter((i) => i.data.done).length;
      const pct = total ? Math.round((doneCount / total) * 100) : 0;
      const level = levelOf(doneCount);
      const ranks = stickerRanks(items);
      const unlocked = Math.min(doneCount, STICKERS.length);

      root.innerHTML = html`
        <header class="page-head">
          <div>
            <h1 class="page-title">里程碑</h1>
            <p class="page-sub">一起完成的每一步，都会被记住</p>
          </div>
        </header>

        ${store.isCloud ? "" : html`<p class="local-note">现在是本地模式：数据只存在这台设备上。开启云端同步后，两个人就能看到同一份了（见 README）。</p>`}

        <section class="card ms-summary">
          <div class="ms-level">
            <div class="ms-badge">${raw(pixelSvg(TROPHY.rows, TROPHY.colors, { cls: "ms-trophy" }))}<span class="ms-lv">Lv.${level.lv}</span></div>
            <div class="ms-level-text">
              <div class="ms-level-name">${level.name}</div>
              <div class="ms-level-next">${level.next
                ? `再完成 ${level.next.at - doneCount} 个，升级到「${level.next.name}」`
                : "已经是最高等级啦 ♡"}</div>
            </div>
          </div>

          <div class="ms-progress">
            <div class="ms-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
              <div class="ms-fill" style="width:${state.lastPct}%"><span class="ms-fill-sheen"></span></div>
            </div>
            <div class="ms-count"><b>${doneCount}</b> / ${total}</div>
          </div>

          <button type="button" class="ms-stickers" data-act="stickers">
            <span class="ms-sticker-row">
              ${STICKERS.slice(0, 6).map((_, i) => html`<span class="ms-mini ${i < unlocked ? "" : "is-locked"}">${raw(sticker(i))}</span>`)}
            </span>
            <span class="ms-stickers-label">贴纸收集册 <b>${unlocked}</b>/${STICKERS.length} ›</span>
          </button>
        </section>

        <section class="card ms-timeline">
          <div class="card-head">
            <h2 class="card-title">我们的时间线</h2>
            <button type="button" class="btn small primary" data-act="add">＋ 添加</button>
          </div>

          ${!state.loaded ? html`<p class="empty">加载中…</p>` :
            state.error ? html`<div class="empty">${state.error}<br /><button type="button" class="btn small" data-act="reload">再试一次</button></div>` :
            !total ? html`
              <div class="empty">
                还没有里程碑。<br />把想一起完成的事一件件写下来吧。
                <div><button type="button" class="btn small" data-act="seed">放几个示例进来</button></div>
              </div>` :
            html`<ol class="ms-list">${items.map((it) => {
              const d = it.data;
              const rank = ranks.get(it.id);
              const cls = [d.done ? "is-done" : "", it.id === state.justDone ? "just-done" : ""].join(" ");
              return html`
                <li class="ms-item ${cls}" data-id="${it.id}">
                  <button type="button" class="ms-node" data-act="toggle" aria-pressed="${d.done ? "true" : "false"}"
                          aria-label="${d.done ? "取消完成" : "标记完成"}：${d.title}">
                    ${d.done ? raw(sticker(rank ?? 0, "ms-node-sticker")) : raw('<span class="ms-node-ring"></span>')}
                  </button>
                  <div class="ms-body" data-act="edit">
                    <div class="ms-title">${d.title}</div>
                    <div class="ms-meta">
                      ${d.date ? html`<span>${formatDay(d.date)}</span>` : ""}
                      ${d.done
                        ? html`<span class="ms-tag done">✓ ${timeAgo(d.doneAt)}完成</span>`
                        : d.date && parseDay(d.date) < new Date(new Date().toDateString())
                          ? html`<span class="ms-tag late">日子过啦，完成了吗？</span>` : ""}
                    </div>
                    ${d.note ? html`<div class="ms-note">${d.note}</div>` : ""}
                  </div>
                  <button type="button" class="icon-btn ms-more" data-act="edit" aria-label="编辑">⋯</button>
                </li>`;
            })}</ol>`}
        </section>`;

      // 进度条从上一次的位置推到新位置，才看得出「推进」
      const fill = root.querySelector(".ms-fill");
      if (fill) {
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
        if (pct > state.lastPct) fill.classList.add("is-bump");
        state.lastPct = pct;
      }
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
      if (alive) render();
    };

    const replaceLocal = (item) => {
      const i = state.items.findIndex((x) => x.id === item.id);
      if (i >= 0) state.items[i] = item; else state.items.push(item);
    };

    const save = async (data, id) => {
      try {
        const item = await store.save(KIND, data, id);
        replaceLocal(item);
        return item;
      } catch (e) {
        if (e instanceof NetError) toast("没保存成功，网络好像不太好", { tone: "bad" });
        throw e;
      }
    };

    /* ---------- 完成 / 取消完成 ---------- */

    const toggle = async (id) => {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      const before = { ...it.data };
      const beforeDone = state.items.filter((x) => x.data.done).length;
      const nowDone = !before.done;

      it.data = nowDone
        ? { ...before, done: true, doneAt: new Date().toISOString() }
        : { ...before, done: false, doneAt: null };
      state.justDone = nowDone ? id : null;
      render();

      if (nowDone) {
        const node = root.querySelector(`.ms-item[data-id="${id}"] .ms-node`);
        burstFrom(node, { count: 48, power: 1.05 });
        buzz([12, 40, 18]);
        const rank = stickerRanks(state.items).get(id) ?? 0;
        const s = STICKERS[rank % STICKERS.length];
        toast(rank < STICKERS.length ? `达成「${before.title}」！解锁贴纸「${s.name}」` : `达成「${before.title}」！`,
              { tone: "good", icon: sticker(rank) });

        const lvBefore = levelOf(beforeDone).lv;
        const after = levelOf(beforeDone + 1);
        if (after.lv > lvBefore) setTimeout(() => alive && showLevelUp(after), 900);
      } else {
        toast(`已取消完成「${before.title}」`);
      }

      try { await save(it.data, id); }
      catch { it.data = before; state.justDone = null; render(); }
    };

    const showLevelUp = (level) => {
      shower(110);
      buzz([20, 60, 20, 60, 30]);
      openSheet({
        title: "升级啦！",
        className: "sheet-levelup",
        body: html`
          <div class="lvup">
            <div class="lvup-trophy">${raw(pixelSvg(TROPHY.rows, TROPHY.colors))}</div>
            <div class="lvup-lv">Lv.${level.lv}</div>
            <div class="lvup-name">${level.name}</div>
            <p class="lvup-next">${level.next ? `下一级「${level.next.name}」：一共完成 ${level.next.at} 个` : "满级了！你们就是天生一对 ♡"}</p>
            <button type="button" class="btn primary block" data-close>太棒了</button>
          </div>`,
      });
    };

    /* ---------- 贴纸收集册 ---------- */

    const showStickers = () => {
      const unlocked = Math.min(state.items.filter((x) => x.data.done).length, STICKERS.length);
      openSheet({
        title: `贴纸收集册 ${unlocked}/${STICKERS.length}`,
        body: html`
          <p class="sheet-tip">每完成一个里程碑，解锁一张。集齐它们吧～</p>
          <div class="stk-grid">
            ${STICKERS.map((s, i) => html`
              <div class="stk ${i < unlocked ? "" : "is-locked"}">
                <div class="stk-art">${raw(sticker(i))}</div>
                <div class="stk-name">${i < unlocked ? s.name : "？？？"}</div>
              </div>`)}
          </div>`,
      });
    };

    /* ---------- 添加 / 编辑 ---------- */

    const openEditor = (id) => {
      const it = id ? state.items.find((x) => x.id === id) : null;
      const d = it?.data || {};
      openSheet({
        title: it ? "编辑里程碑" : "添加里程碑",
        body: html`
          <form class="ms-form" novalidate>
            <label class="field"><span>要一起完成的事</span>
              <input class="input" name="title" maxlength="40" required placeholder="比如：一起看一次极光" value="${d.title || ""}" />
            </label>
            <label class="field"><span>日期（可以不填）</span>
              <input class="input" name="date" type="date" value="${d.date || ""}" />
            </label>
            <label class="field"><span>备注（可以不填）</span>
              <textarea class="input" name="note" maxlength="140" placeholder="想对这一步说点什么">${d.note || ""}</textarea>
            </label>
            <div class="sheet-actions">
              ${it ? html`<button type="button" class="btn danger" data-act="delete">删除</button>` : ""}
              <span class="spacer"></span>
              <button type="button" class="btn ghost" data-close>取消</button>
              <button type="submit" class="btn primary">${it ? "保存" : "添加"}</button>
            </div>
          </form>`,
        onMount(el, close) {
          const form = el.querySelector("form");
          const titleInput = form.elements.title;
          if (!it) setTimeout(() => titleInput.focus(), 60);

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = titleInput.value.trim();
            if (!title) { titleInput.focus(); titleInput.classList.add("is-invalid"); return; }
            const data = { ...d, title, date: form.elements.date.value || "", note: form.elements.note.value.trim() };
            if (!it) data.done = false;
            const btn = form.querySelector('[type="submit"]');
            btn.disabled = true;
            try {
              await save(data, it?.id);
              close();
              render();
              toast(it ? "改好啦" : "加上了，一起加油 ♡", { tone: "good" });
            } catch { btn.disabled = false; }
          });

          el.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
            const ok = await confirmSheet(`确定删除「${d.title}」吗？删除后不能恢复。`, { ok: "删除", danger: true });
            if (!ok) return;
            try {
              await store.remove(it.id);
              state.items = state.items.filter((x) => x.id !== it.id);
              close();
              render();
              toast("已删除");
            } catch { toast("删除失败，稍后再试", { tone: "bad" }); }
          });
        },
      });
    };

    const seed = async () => {
      for (const ex of EXAMPLES) {
        try { await save({ title: ex.title, date: ex.date || "", note: ex.note || "", done: false }); }
        catch { break; }
      }
      render();
      toast("放好了，点左边的小圆圈试试完成一个 ✨", { tone: "good" });
    };

    /* ---------- 事件 ---------- */

    const onClick = (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const id = el.closest(".ms-item")?.dataset.id;
      switch (el.dataset.act) {
        case "toggle": toggle(id); break;
        case "edit": openEditor(id); break;
        case "add": openEditor(null); break;
        case "seed": seed(); break;
        case "stickers": showStickers(); break;
        case "reload": state.loaded = false; render(); load(); break;
      }
    };
    root.addEventListener("click", onClick);
    offs.push(() => root.removeEventListener("click", onClick));

    // 对方改了东西，这边过一会儿自动刷新
    const poll = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) load(); }, 25000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    offs.push(() => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); });

    render();
    load();

    return () => { alive = false; offs.forEach((f) => f()); };
  },
};
