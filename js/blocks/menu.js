/* 点菜
   ① 本地玩：菜单 + 「今天吃什么」随机抽
   ② 发到聊天：选好的菜生成一段消息，用系统分享发到微信 / iMessage
   ③ 一起用：提交点单，两个人都能看到，一步步推进「接单 → 在做 → 开饭」
   不区分是谁点的 —— 两个人就是一体 */
import { SITE_URL } from "../config.js";
import { html, raw, saved, pick, timeAgo } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, buzz } from "../lib/celebrate.js";

const DISH = "dish";
const ORDER = "order";
const CART_KEY = "hq:cart";

export const TAGS = [
  { id: "main",    label: "主菜", color: "#f4718f" },
  { id: "veg",     label: "素菜", color: "#7cbb73" },
  { id: "soup",    label: "汤",   color: "#e0a36b" },
  { id: "staple",  label: "主食", color: "#ffc94d" },
  { id: "dessert", label: "甜品", color: "#a996e8" },
];
const tagOf = (id) => TAGS.find((t) => t.id === id) || TAGS[0];

export const STATUSES = [
  { id: "pending",  label: "待接单", verb: "下单了" },
  { id: "accepted", label: "接单啦", verb: "接单啦" },
  { id: "cooking",  label: "在做啦", verb: "开始做啦" },
  { id: "served",   label: "开饭啦", verb: "开饭啦" },
];
const statusIndex = (id) => Math.max(0, STATUSES.findIndex((s) => s.id === id));

const HOME_DISHES = [
  ["番茄炒蛋", "veg"], ["可乐鸡翅", "main"], ["红烧肉", "main"], ["麻婆豆腐", "main"],
  ["酸辣土豆丝", "veg"], ["蒜蓉西兰花", "veg"], ["紫菜蛋花汤", "soup"], ["玉米排骨汤", "soup"],
  ["咖喱饭", "staple"], ["葱油拌面", "staple"], ["双皮奶", "dessert"], ["水果捞", "dessert"],
];

/** 把点单整理成一段话 */
export function orderMessage({ items, note }) {
  const lines = items.map((i) => `· ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}`);
  return [
    "🍽️ 我们点菜啦！",
    ...lines,
    note ? `备注：${note}` : "",
    `—— 来自我们的小站 ${SITE_URL}#/menu`,
  ].filter(Boolean).join("\n");
}

/** 系统分享 → 复制 → 手动复制，逐级退回 */
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(text); return "copied"; }
  catch { /* 继续退回 */ }
  openSheet({
    title: "复制这段话发到聊天里",
    body: html`<textarea class="input share-text" readonly>${text}</textarea>
      <div class="sheet-actions"><button type="button" class="btn primary" data-close>好了</button></div>`,
    onMount(el) { const t = el.querySelector("textarea"); t.focus(); t.select(); },
  });
  return "manual";
}

export default {
  async mount(root) {
    let alive = true;
    const offs = [];

    if (store.isCloud) await requireUnlock(root);
    if (!root.isConnected) return;

    const state = {
      dishes: [], orders: [], loaded: false, error: "",
      filter: "all", editing: false,
      cart: saved.get(CART_KEY, {}),      // { 菜名: 数量 }
      rolled: null, rolling: false,
    };

    const saveCart = () => saved.set(CART_KEY, state.cart);
    const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);
    const cartItems = () => Object.entries(state.cart).filter(([, q]) => q > 0).map(([name, qty]) => ({ name, qty }));

    /* ---------- 渲染 ---------- */

    const render = () => {
      const dishes = [...state.dishes].sort((a, b) =>
        TAGS.indexOf(tagOf(a.data.tag)) - TAGS.indexOf(tagOf(b.data.tag)) || a.created_at.localeCompare(b.created_at));
      const shown = state.filter === "all" ? dishes : dishes.filter((d) => tagOf(d.data.tag).id === state.filter);
      const orders = [...state.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20);
      const count = cartCount();

      root.innerHTML = html`
        <header class="page-head">
          <div>
            <h1 class="page-title">点菜</h1>
            <p class="page-sub">今天想吃什么，一起定</p>
          </div>
        </header>

        ${store.isCloud ? "" : html`<p class="local-note">现在是本地模式：菜单和点单只存在这台设备上。开启云端同步后，点的菜对方马上能看到。</p>`}

        <section class="card menu-roll">
          <div class="roll-title">今天吃什么？</div>
          <div class="roll-slot ${state.rolled && !state.rolling ? "is-landed" : ""}" aria-live="polite">
            <span class="roll-text">${state.rolled ? state.rolled : "交给骰子决定"}</span>
          </div>
          <div class="roll-actions">
            <button type="button" class="btn primary" data-act="roll" ${state.rolling ? "disabled" : ""}>🎲 ${state.rolled ? "再抽一次" : "帮我选"}</button>
            ${state.rolled && !state.rolling ? html`<button type="button" class="btn" data-act="roll-add">加进点单</button>` : ""}
          </div>
          ${state.filter !== "all" ? html`<p class="roll-hint">只在「${tagOf(state.filter).label}」里抽</p>` : ""}
        </section>

        <section class="card menu-list">
          <div class="card-head">
            <h2 class="card-title">菜单 <span class="count">${dishes.length}</span></h2>
            <div class="head-btns">
              ${dishes.length ? html`<button type="button" class="btn small ghost" data-act="toggle-edit">${state.editing ? "完成" : "编辑"}</button>` : ""}
              <button type="button" class="btn small primary" data-act="add-dish">＋ 加菜</button>
            </div>
          </div>

          ${dishes.length ? html`
            <div class="chips" role="tablist">
              ${[{ id: "all", label: "全部" }, ...TAGS].map((t) => html`
                <button type="button" class="chip filter ${state.filter === t.id ? "is-on" : ""}" data-act="filter" data-tag="${t.id}">${t.label}</button>`)}
            </div>` : ""}

          ${!state.loaded ? html`<p class="empty">加载中…</p>` :
            state.error ? html`<div class="empty">${state.error}<br /><button type="button" class="btn small" data-act="reload">再试一次</button></div>` :
            !dishes.length ? html`
              <div class="empty">菜单还是空的。
                <div><button type="button" class="btn small" data-act="seed">放一些家常菜进来</button></div>
              </div>` :
            html`<div class="dish-grid ${state.editing ? "is-editing" : ""}">
              ${shown.map((d) => {
                const t = tagOf(d.data.tag);
                const q = state.cart[d.data.name] || 0;
                return html`
                  <button type="button" class="dish ${q ? "in-cart" : ""}" data-act="dish" data-id="${d.id}" style="--tag:${t.color}">
                    <span class="dish-name">${d.data.name}</span>
                    <span class="dish-tag">${t.label}</span>
                    ${q ? html`<span class="dish-q">${q}</span>` : ""}
                    ${state.editing ? html`<span class="dish-edit">✎</span>` : ""}
                  </button>`;
              })}
              ${!shown.length ? html`<p class="empty">这个分类还没有菜</p>` : ""}
            </div>`}
        </section>

        <section class="card menu-orders">
          <div class="card-head"><h2 class="card-title">我们的点单</h2></div>
          ${!orders.length ? html`<p class="empty">还没有点单。选几道菜，点下面的「去下单」吧。</p>` :
            html`<ol class="order-list">${orders.map((o) => {
              const d = o.data;
              const si = statusIndex(d.status);
              const next = STATUSES[si + 1];
              return html`
                <li class="order ${si === STATUSES.length - 1 ? "is-served" : ""}" data-id="${o.id}">
                  <div class="order-top">
                    <span class="order-by">🍽️ 点单</span>
                    <span class="order-time">${timeAgo(o.created_at)}</span>
                    <button type="button" class="icon-btn" data-act="order-more" aria-label="更多">⋯</button>
                  </div>
                  <div class="order-items">${(d.items || []).map((i) => html`<span class="chip">${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}</span>`)}</div>
                  ${d.note ? html`<p class="order-note">「${d.note}」</p>` : ""}
                  <div class="order-steps" aria-label="进度：${STATUSES[si].label}">
                    ${STATUSES.map((s, i) => html`<span class="step ${i <= si ? "is-on" : ""}"><i></i>${s.label}</span>`)}
                  </div>
                  ${next ? html`<button type="button" class="btn small primary order-next" data-act="advance">${next.label.replace("啦", "")} →</button>`
                         : html`<p class="order-done">🍽️ 开饭啦，好好吃饭～</p>`}
                </li>`;
            })}</ol>`}
        </section>

        ${count ? html`
          <div class="cart-bar" role="region" aria-label="已选的菜">
            <span class="cart-count">已选 <b>${count}</b> 道</span>
            <button type="button" class="btn small ghost" data-act="cart-clear">清空</button>
            <button type="button" class="btn small primary" data-act="checkout">去下单 →</button>
          </div>` : ""}`;

      root.classList.toggle("has-cart", Boolean(count));
    };

    /* ---------- 数据 ---------- */

    const load = async () => {
      try {
        const [dishes, orders] = await Promise.all([store.list(DISH), store.list(ORDER)]);
        state.dishes = dishes;
        state.orders = orders;
        state.error = "";
      } catch (e) {
        if (!(e instanceof NetError)) return;
        state.error = "连不上云端，检查一下网络";
      }
      state.loaded = true;
      if (alive && !state.rolling) render();
    };

    const upsertLocal = (list, item) => {
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = item; else list.push(item);
    };

    const save = async (kind, data, id) => {
      try {
        const item = await store.save(kind, data, id);
        upsertLocal(kind === DISH ? state.dishes : state.orders, item);
        return item;
      } catch (e) {
        if (e instanceof NetError) toast("没保存成功，网络好像不太好", { tone: "bad" });
        throw e;
      }
    };

    /* ---------- 今天吃什么 ---------- */

    const roll = () => {
      const pool = state.dishes.filter((d) => state.filter === "all" || tagOf(d.data.tag).id === state.filter);
      if (!pool.length) { toast("菜单是空的，先加几道菜吧"); return; }
      state.rolling = true;
      render();
      const text = root.querySelector(".roll-text");
      const slot = root.querySelector(".roll-slot");
      const final = pick(pool).data.name;
      let delay = 55;
      const spin = () => {
        if (!alive) return;
        text.textContent = pick(pool).data.name;
        delay *= 1.14;
        if (delay < 230) setTimeout(spin, delay);
        else {
          state.rolled = final;
          state.rolling = false;
          render();
          burstFrom(root.querySelector(".roll-slot"), { count: 26, power: 0.8 });
          buzz([10, 30, 10]);
        }
      };
      slot.classList.add("is-spinning");
      spin();
    };

    const addToCart = (name, el) => {
      state.cart[name] = (state.cart[name] || 0) + 1;
      saveCart();
      render();
      const target = el?.dataset.id ? root.querySelector(`.dish[data-id="${el.dataset.id}"]`) : root.querySelector(".cart-bar");
      target?.classList.add("is-bump");
      buzz([8]);
    };

    /* ---------- 菜单：加 / 改 / 删 ---------- */

    const openDishEditor = (id) => {
      const it = id ? state.dishes.find((x) => x.id === id) : null;
      const d = it?.data || { tag: state.filter !== "all" ? state.filter : "main" };
      openSheet({
        title: it ? "编辑这道菜" : "加一道菜",
        body: html`
          <form class="dish-form" novalidate>
            <label class="field"><span>菜名</span>
              <input class="input" name="name" maxlength="20" required placeholder="比如：糖醋排骨" value="${d.name || ""}" />
            </label>
            <div class="field"><span>分类</span>
              <div class="chips">
                ${TAGS.map((t) => html`
                  <label class="chip radio" style="--tag:${t.color}">
                    <input type="radio" name="tag" value="${t.id}" ${tagOf(d.tag).id === t.id ? "checked" : ""} />${t.label}
                  </label>`)}
              </div>
            </div>
            <div class="sheet-actions">
              ${it ? html`<button type="button" class="btn danger" data-act="delete">删除</button>` : ""}
              <span class="spacer"></span>
              <button type="button" class="btn ghost" data-close>取消</button>
              <button type="submit" class="btn primary">${it ? "保存" : "加上"}</button>
            </div>
          </form>`,
        onMount(el, close) {
          const form = el.querySelector("form");
          const nameInput = form.elements.name;
          if (!it) setTimeout(() => nameInput.focus(), 60);
          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = nameInput.value.trim();
            if (!name) { nameInput.classList.add("is-invalid"); nameInput.focus(); return; }
            if (state.dishes.some((x) => x.data.name === name && x.id !== it?.id)) {
              toast("菜单里已经有这道菜啦"); nameInput.focus(); return;
            }
            const data = { name, tag: form.elements.tag.value || "main" };
            try {
              await save(DISH, data, it?.id);
              // 改名的话，购物车里的旧名字也跟着改
              if (it && it.data.name !== name && state.cart[it.data.name]) {
                state.cart[name] = state.cart[it.data.name];
                delete state.cart[it.data.name];
                saveCart();
              }
              close(); render();
              toast(it ? "改好啦" : `「${name}」上菜单了`, { tone: "good" });
            } catch { /* 已提示 */ }
          });
          el.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
            if (!(await confirmSheet(`从菜单里删掉「${d.name}」？`, { ok: "删除", danger: true }))) return;
            try {
              await store.remove(it.id);
              state.dishes = state.dishes.filter((x) => x.id !== it.id);
              delete state.cart[d.name]; saveCart();
              close(); render(); toast("已删除");
            } catch { toast("删除失败，稍后再试", { tone: "bad" }); }
          });
        },
      });
    };

    const seed = async () => {
      for (const [name, tag] of HOME_DISHES) {
        if (state.dishes.some((d) => d.data.name === name)) continue;
        try { await save(DISH, { name, tag }); } catch { break; }
      }
      render();
      toast("菜单准备好了，点菜名就能加进点单", { tone: "good" });
    };

    /* ---------- 下单 ---------- */

    const openCheckout = () => {
      const render2 = (el) => {
        const items = cartItems();
        el.querySelector(".co-list").innerHTML = html`${items.map((i) => html`
          <li class="co-item" data-name="${i.name}">
            <span class="co-name">${i.name}</span>
            <span class="stepper">
              <button type="button" class="icon-btn" data-q="-1" aria-label="少一份">−</button>
              <b>${i.qty}</b>
              <button type="button" class="icon-btn" data-q="1" aria-label="多一份">＋</button>
            </span>
          </li>`)}`;
        if (!items.length) setTimeout(() => el.querySelector("[data-close]")?.click(), 0);
      };

      openSheet({
        title: "下单",
        body: html`
          <ul class="co-list"></ul>
          <label class="field"><span>备注（可以不填）</span>
            <input class="input" name="note" maxlength="60" placeholder="比如：少放辣 / 想吃软一点的" />
          </label>
          <div class="co-actions">
            <button type="button" class="btn" data-act="co-share">💬 发到聊天里</button>
            <button type="button" class="btn primary" data-act="co-submit">✓ 提交点单</button>
          </div>
          <p class="co-tip">「提交点单」会出现在下面的点单列表里，打开网站就能看到、一步步推进；
            「发到聊天里」是把菜单整理成一段话，发到微信 / iMessage。</p>`,
        onMount(el, close) {
          render2(el);
          const note = () => el.querySelector('input[name="note"]').value.trim();

          el.querySelector(".co-list").addEventListener("click", (e) => {
            const b = e.target.closest("[data-q]");
            if (!b) return;
            const name = b.closest(".co-item").dataset.name;
            state.cart[name] = Math.max(0, (state.cart[name] || 0) + Number(b.dataset.q));
            if (!state.cart[name]) delete state.cart[name];
            saveCart(); render(); render2(el);
          });

          el.querySelector('[data-act="co-share"]').addEventListener("click", async () => {
            const how = await shareText(orderMessage({ items: cartItems(), note: note() }));
            if (how === "copied") toast("复制好了，去聊天里粘贴吧", { tone: "good" });
          });

          el.querySelector('[data-act="co-submit"]').addEventListener("click", async (e) => {
            const btn = e.currentTarget;
            const items = cartItems();
            if (!items.length) return;
            btn.disabled = true;
            try {
              const now = new Date().toISOString();
              await save(ORDER, { items, note: note(), status: "pending", statusAt: now });
              burstFrom(btn, { count: 40 });
              buzz([12, 40, 12]);
              state.cart = {}; saveCart();
              close(); render();
              toast("下单成功！", { tone: "good" });
            } catch { btn.disabled = false; }
          });
        },
      });
    };

    const advance = async (id) => {
      const o = state.orders.find((x) => x.id === id);
      if (!o) return;
      const before = { ...o.data };
      const next = STATUSES[statusIndex(before.status) + 1];
      if (!next) return;
      o.data = { ...before, status: next.id, statusAt: new Date().toISOString() };
      render();
      const li = root.querySelector(`.order[data-id="${id}"]`);
      li?.classList.add("is-bump");
      if (next.id === "served") {
        burstFrom(li, { count: 60, power: 1.1 });
        buzz([15, 50, 15, 50, 25]);
        toast("开饭啦！🍽️", { tone: "good" });
      } else {
        burstFrom(li?.querySelector(".order-steps"), { count: 14, power: 0.6 });
        toast(next.verb);
      }
      try { await save(ORDER, o.data, id); }
      catch { o.data = before; render(); }
    };

    const orderMore = (id) => {
      const o = state.orders.find((x) => x.id === id);
      if (!o) return;
      openSheet({
        title: "这张点单",
        body: html`
          <div class="sheet-list">
            <button type="button" class="btn block" data-act="o-share">💬 整理成消息发到聊天里</button>
            <button type="button" class="btn block" data-act="o-again">🔁 再点一次同样的</button>
            <button type="button" class="btn block danger" data-act="o-delete">删除这张点单</button>
          </div>`,
        onMount(el, close) {
          el.querySelector('[data-act="o-share"]').addEventListener("click", async () => {
            const how = await shareText(orderMessage(o.data));
            if (how === "copied") toast("复制好了，去聊天里粘贴吧", { tone: "good" });
          });
          el.querySelector('[data-act="o-again"]').addEventListener("click", () => {
            for (const i of o.data.items || []) state.cart[i.name] = (state.cart[i.name] || 0) + i.qty;
            saveCart(); close(); render(); toast("加进点单了");
          });
          el.querySelector('[data-act="o-delete"]').addEventListener("click", async () => {
            if (!(await confirmSheet("删除这张点单？", { ok: "删除", danger: true }))) return;
            try {
              await store.remove(id);
              state.orders = state.orders.filter((x) => x.id !== id);
              close(); render(); toast("已删除");
            } catch { toast("删除失败，稍后再试", { tone: "bad" }); }
          });
        },
      });
    };

    /* ---------- 事件 ---------- */

    const onClick = (e) => {
      const el = e.target.closest("[data-act]");
      if (!el) return;
      const orderId = el.closest(".order")?.dataset.id;
      switch (el.dataset.act) {
        case "roll": roll(); break;
        case "roll-add": if (state.rolled) addToCart(state.rolled); break;
        case "filter": state.filter = el.dataset.tag; render(); break;
        case "toggle-edit": state.editing = !state.editing; render(); break;
        case "add-dish": openDishEditor(null); break;
        case "dish": {
          const d = state.dishes.find((x) => x.id === el.dataset.id);
          if (!d) break;
          if (state.editing) openDishEditor(d.id); else addToCart(d.data.name, el);
          break;
        }
        case "seed": seed(); break;
        case "cart-clear": state.cart = {}; saveCart(); render(); break;
        case "checkout": openCheckout(); break;
        case "advance": advance(orderId); break;
        case "order-more": orderMore(orderId); break;
        case "reload": state.loaded = false; render(); load(); break;
      }
    };
    root.addEventListener("click", onClick);
    offs.push(() => { root.removeEventListener("click", onClick); root.classList.remove("has-cart"); });

    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]") && !state.rolling) load();
    }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    offs.push(() => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); });

    render();
    load();

    return () => { alive = false; offs.forEach((f) => f()); };
  },
};
