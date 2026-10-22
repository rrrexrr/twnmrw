/* 回忆：照片 + 一句话，按时间排成相册
   - 「那年今天」：往年的今天发生过什么；没有的话随机翻一张
   - 每条回忆最多 6 张照片，上传前在手机上压缩好
   - 点照片看大图，左右滑动切换

   存法（不用改数据库表，只需要运行一次 supabase/memories.sql）：
   - kind = memory：{ date, text, place, photos: [{ id, thumb, w, h }] }，thumb 是很小的缩略图，列表直接用
   - kind = memory_photo：{ src }，压缩后的大图，点开时才按 id 去取 */
import { html, raw, parseDay, formatDay, pick } from "../lib/dom.js";
import { store, NetError } from "../lib/store.js";
import { requireUnlock } from "../lib/auth.js";
import { toast, openSheet, confirmSheet } from "../lib/ui.js";
import { burstFrom, buzz } from "../lib/celebrate.js";

const KIND = "memory";
const PHOTO = "memory_photo";
const MAX_PHOTOS = 6;
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const pad2 = (n) => String(n).padStart(2, "0");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

/* ---------- 图片压缩 ---------- */

async function loadImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

function toJpeg(src, maxSide, quality) {
  const w = src.width, h = src.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height };
}

/** 一张照片 → 大图（≤1600px，约几百 KB）+ 缩略图（≤280px，十几 KB） */
export async function compressPhoto(file) {
  const img = await loadImage(file);
  let big = toJpeg(img, 1600, 0.82);
  if (big.url.length > 1_300_000) big = toJpeg(img, 1280, 0.72);
  if (big.url.length > 1_300_000) big = toJpeg(img, 1024, 0.65);
  const thumb = toJpeg(img, 280, 0.6);
  img.close?.();
  return { src: big.url, thumb: thumb.url, w: big.w, h: big.h };
}

/* ---------- 页面 ---------- */

export default {
  async mount(root) {
    let alive = true;
    const offs = [];

    if (store.isCloud) await requireUnlock(root);
    if (!alive || !root.isConnected) return;

    const state = { items: [], loaded: false, error: "", randomId: null };
    const photoCache = new Map();   // 照片 id → 大图 dataURL

    /* ---------- 渲染 ---------- */

    const sorted = () => [...state.items].sort((a, b) =>
      (b.data.date || "").localeCompare(a.data.date || "") || b.created_at.localeCompare(a.created_at));

    const dateLabel = (d) => {
      const day = parseDay(d);
      return day ? `${formatDay(d)} · ${WEEK[day.getDay()]}` : "";
    };

    const photosHtml = (it, cls = "") => {
      const ps = it.data.photos || [];
      if (!ps.length) return "";
      return html`
        <div class="mem-photos n${Math.min(ps.length, 3)} ${cls}">
          ${ps.map((p, i) => html`
            <button type="button" class="mem-ph" data-act="view" data-i="${i}" aria-label="看大图 ${i + 1}/${ps.length}"
                    style="${ps.length === 1 && p.w && p.h ? `aspect-ratio:${p.w}/${p.h}` : ""}">
              <img src="${p.thumb}" alt="" loading="lazy" decoding="async" />
            </button>`)}
        </div>`;
    };

    const cardHtml = (it) => {
      const d = it.data;
      return html`
        <article class="mem" data-id="${it.id}">
          <header class="mem-head">
            <time class="mem-date">${dateLabel(d.date)}</time>
            ${d.place ? html`<span class="mem-place">📍 ${d.place}</span>` : ""}
            <button type="button" class="icon-btn mem-more" data-act="edit" aria-label="编辑">⋯</button>
          </header>
          ${photosHtml(it)}
          ${d.text ? html`<p class="mem-text">${d.text}</p>` : ""}
        </article>`;
    };

    /** 那年今天：往年同月同日；没有就随机一条 */
    const flashback = () => {
      const t = todayKey();
      const md = t.slice(5);
      const year = +t.slice(0, 4);
      const hits = sorted().filter((it) => it.data.date?.slice(5) === md && +it.data.date.slice(0, 4) < year);
      if (hits.length) {
        const it = hits[0];
        const ago = year - +it.data.date.slice(0, 4);
        return { title: `那年今天 · ${ago} 年前`, it, shuffle: false };
      }
      if (state.items.length < 2) return null;
      let it = state.items.find((x) => x.id === state.randomId);
      if (!it) { it = pick(state.items); state.randomId = it.id; }
      return { title: "随机翻一张", it, shuffle: true };
    };

    const render = () => {
      if (!alive) return;
      const list = sorted();
      const fb = state.loaded ? flashback() : null;

      // 按年月分组
      const groups = [];
      for (const it of list) {
        const ym = (it.data.date || "").slice(0, 7) || "未写日期";
        if (!groups.length || groups.at(-1).ym !== ym) groups.push({ ym, items: [] });
        groups.at(-1).items.push(it);
      }
      const photoCount = list.reduce((n, it) => n + (it.data.photos?.length || 0), 0);

      root.innerHTML = html`
        <header class="page-head">
          <div>
            <h1 class="page-title">回忆</h1>
            <p class="page-sub">${state.loaded && list.length ? `${list.length} 段回忆 · ${photoCount} 张照片` : "我们的每一个瞬间"}</p>
          </div>
          <button type="button" class="btn small primary" data-act="add">＋ 记一笔</button>
        </header>

        ${store.isCloud ? "" : html`<p class="local-note">现在是本地模式：照片只存在这台设备的浏览器里，而且放不了几张。开启云端同步后才能两个人一起看。</p>`}

        ${fb ? html`
          <section class="card mem-flash">
            <div class="card-head">
              <h2 class="card-title">${fb.title}</h2>
              ${fb.shuffle ? html`<button type="button" class="btn small ghost" data-act="shuffle">换一张 🎲</button>` : ""}
            </div>
            <div class="mem" data-id="${fb.it.id}">
              <time class="mem-date">${dateLabel(fb.it.data.date)}${fb.it.data.place ? ` · 📍 ${fb.it.data.place}` : ""}</time>
              ${photosHtml(fb.it, "is-flash")}
              ${fb.it.data.text ? html`<p class="mem-text">${fb.it.data.text}</p>` : ""}
            </div>
          </section>` : ""}

        ${!state.loaded ? html`<section class="card"><p class="empty">加载中…</p></section>` :
          state.error ? html`<section class="card"><div class="empty">${state.error}<br /><button type="button" class="btn small" data-act="reload">再试一次</button></div></section>` :
          !list.length ? html`
            <section class="card mem-empty">
              <div class="mem-empty-art" aria-hidden="true">📷</div>
              <p>还没有回忆。<br />把第一张照片放进来吧。</p>
              <button type="button" class="btn primary" data-act="add">＋ 记下第一段回忆</button>
            </section>` :
          groups.map((g) => html`
            <section class="mem-group">
              <h2 class="mem-ym">${/^\d{4}-\d{2}$/.test(g.ym) ? `${g.ym.slice(0, 4)}年${+g.ym.slice(5)}月` : g.ym}</h2>
              <div class="mem-list">${g.items.map(cardHtml)}</div>
            </section>`)}`;
    };

    /* ---------- 数据 ---------- */

    const load = async () => {
      try {
        state.items = await store.list(KIND);
        state.error = "";
      } catch (e) {
        if (!(e instanceof NetError)) return;
        state.error = "连不上云端，检查一下网络";
      }
      state.loaded = true;
      if (alive && !document.querySelector("dialog[open]")) render();
    };

    const errText = (e) =>
      e?.message === "storage_full" ? "这台设备的浏览器存满了（本地模式放不了太多照片）" :
      e?.message === "too_big" ? "存不进去：多半是数据库还没更新，先在 Supabase 运行一次 supabase/memories.sql" :
      /hq_get|function|schema cache/i.test(e?.message || "") ? "数据库还没更新：先在 Supabase 运行一次 supabase/memories.sql" :
      "没保存成功，网络好像不太好";

    /* ---------- 看大图 ---------- */

    const fullSrc = async (p) => {
      if (photoCache.has(p.id)) return photoCache.get(p.id);
      const item = await store.get(p.id);
      const src = item?.data?.src || null;
      if (src) photoCache.set(p.id, src);
      return src;
    };

    const openViewer = (it, start) => {
      const ps = it.data.photos || [];
      if (!ps.length) return;
      let i = start;
      const dlg = document.createElement("dialog");
      dlg.className = "mem-viewer";
      dlg.innerHTML = html`
        <button type="button" class="mv-close" data-mv="close" aria-label="关闭">✕</button>
        <div class="mv-stage">
          <img class="mv-img" alt="" />
          <span class="mv-loading" hidden>加载中…</span>
        </div>
        ${ps.length > 1 ? raw(`
          <button type="button" class="mv-nav mv-prev" data-mv="prev" aria-label="上一张">‹</button>
          <button type="button" class="mv-nav mv-next" data-mv="next" aria-label="下一张">›</button>`) : ""}
        <footer class="mv-foot">
          <span class="mv-count"></span>
          <span class="mv-cap">${it.data.text || ""}</span>
        </footer>`;
      document.body.append(dlg);
      const img = dlg.querySelector(".mv-img");
      const loading = dlg.querySelector(".mv-loading");
      const count = dlg.querySelector(".mv-count");

      const show = async () => {
        const p = ps[i];
        count.textContent = ps.length > 1 ? `${i + 1} / ${ps.length}` : "";
        img.src = photoCache.get(p.id) || p.thumb;   // 先用缩略图垫着
        img.classList.toggle("is-thumb", !photoCache.has(p.id));
        if (photoCache.has(p.id)) return;
        loading.hidden = false;
        const want = i;
        try {
          const src = await fullSrc(p);
          if (src && want === i && dlg.isConnected) { img.src = src; img.classList.remove("is-thumb"); }
        } catch { /* 留着缩略图 */ }
        if (want === i) loading.hidden = true;
        // 顺手把下一张也取了
        const nxt = ps[(i + 1) % ps.length];
        if (nxt && !photoCache.has(nxt.id)) fullSrc(nxt).catch(() => {});
      };
      const go = (d) => { if (ps.length < 2) return; i = (i + d + ps.length) % ps.length; show(); };
      const close = () => { dlg.close(); dlg.remove(); removeEventListener("keydown", onKey); };
      const onKey = (e) => {
        if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
      };

      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-mv]");
        if (b) { const a = b.dataset.mv; a === "close" ? close() : go(a === "next" ? 1 : -1); return; }
        if (e.target === dlg || e.target.classList.contains("mv-stage")) close();
      });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
      addEventListener("keydown", onKey);

      // 左右滑动切换
      let x0 = null;
      dlg.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      dlg.addEventListener("touchend", (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      });

      dlg.showModal();
      show();
    };

    /* ---------- 添加 / 编辑 ---------- */

    const openEditor = (id) => {
      const it = id ? state.items.find((x) => x.id === id) : null;
      const d = it?.data || { date: todayKey() };
      // 照片列表：已有的 { id, thumb, w, h }；新加的 { file, thumb(预览), pending: true }
      let photos = (d.photos || []).map((p) => ({ ...p }));
      const removed = [];

      openSheet({
        title: it ? "编辑回忆" : "记一笔回忆",
        className: "sheet-memory",
        body: html`
          <form class="mem-form" novalidate>
            <div class="field"><span>照片（最多 ${MAX_PHOTOS} 张）</span>
              <div class="mem-pick"></div>
              <input type="file" accept="image/*" multiple hidden />
            </div>
            <label class="field"><span>一句话</span>
              <textarea class="input" name="text" maxlength="300" rows="3" placeholder="那天发生了什么？">${d.text || ""}</textarea>
            </label>
            <div class="mem-form-row">
              <label class="field"><span>日期</span>
                <input class="input" type="date" name="date" value="${d.date || todayKey()}" max="${todayKey()}" />
              </label>
              <label class="field"><span>地点（可以不填）</span>
                <input class="input" name="place" maxlength="30" placeholder="比如：爱丁堡" value="${d.place || ""}" />
              </label>
            </div>
            <p class="mem-progress" aria-live="polite"></p>
            <div class="sheet-actions">
              ${it ? html`<button type="button" class="btn danger" data-act="delete">删除</button>` : ""}
              <span class="spacer"></span>
              <button type="button" class="btn ghost" data-close>取消</button>
              <button type="submit" class="btn primary">${it ? "保存" : "存进回忆"}</button>
            </div>
          </form>`,
        onMount(el, close) {
          const form = el.querySelector("form");
          const pickBox = el.querySelector(".mem-pick");
          const fileInput = el.querySelector('input[type="file"]');
          const progress = el.querySelector(".mem-progress");
          const submitBtn = form.querySelector('[type="submit"]');
          let busy = false;

          const paintPick = () => {
            pickBox.innerHTML = html`
              ${photos.map((p, i) => html`
                <div class="mem-pick-item">
                  <img src="${p.thumb}" alt="" />
                  <button type="button" class="mem-pick-x" data-x="${i}" aria-label="去掉这张">✕</button>
                </div>`)}
              ${photos.length < MAX_PHOTOS ? html`<button type="button" class="mem-pick-add" data-add>＋<small>添加照片</small></button>` : ""}`;
          };
          paintPick();

          pickBox.addEventListener("click", (e) => {
            if (busy) return;
            const x = e.target.closest("[data-x]");
            if (x) {
              const [p] = photos.splice(+x.dataset.x, 1);
              if (p.id) removed.push(p.id);
              paintPick();
              return;
            }
            if (e.target.closest("[data-add]")) fileInput.click();
          });

          fileInput.addEventListener("change", async () => {
            const files = [...fileInput.files].slice(0, MAX_PHOTOS - photos.length);
            fileInput.value = "";
            if (!files.length) return;
            progress.textContent = "正在处理照片…";
            for (const f of files) {
              try {
                const c = await compressPhoto(f);
                photos.push({ ...c, pending: true });
                paintPick();
              } catch {
                toast("有一张照片打不开（格式不支持），换一张试试", { tone: "bad" });
              }
            }
            progress.textContent = "";
          });

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (busy) return;
            const text = form.elements.text.value.trim();
            const date = form.elements.date.value || todayKey();
            const place = form.elements.place.value.trim();
            if (!text && !photos.length) { toast("放一张照片或者写一句话吧"); return; }

            busy = true;
            submitBtn.disabled = true;
            const created = [];
            try {
              // 1. 先把新照片一张张传上去，拿到 id
              const pending = photos.filter((p) => p.pending);
              let n = 0;
              for (const p of photos) {
                if (!p.pending) continue;
                progress.textContent = `上传照片 ${++n} / ${pending.length}…`;
                const saved = await store.save(PHOTO, { src: p.src });
                created.push(saved.id);
                photoCache.set(saved.id, p.src);
                Object.assign(p, { id: saved.id, pending: false });
                delete p.src;
              }
              // 2. 再存回忆本身
              progress.textContent = "保存中…";
              const data = { ...d, text, date, place, photos: photos.map(({ id, thumb, w, h }) => ({ id, thumb, w, h })) };
              const item = await store.save(KIND, data, it?.id);
              const i = state.items.findIndex((x) => x.id === item.id);
              if (i >= 0) state.items[i] = item; else state.items.push(item);
              // 3. 编辑时去掉的照片，顺手删掉
              for (const pid of removed) store.remove(pid).catch(() => {});

              close();
              render();
              const card = root.querySelector(`.mem[data-id="${item.id}"]`);
              card?.classList.add("is-new");
              card?.scrollIntoView({ block: "center", behavior: "smooth" });
              burstFrom(card || root, { count: 36, power: 0.9 });
              buzz([10, 40, 10]);
              toast(it ? "改好啦" : "存进回忆了 ♡", { tone: "good" });
            } catch (err) {
              // 没存成功：把这次新传的照片删掉，免得占地方
              for (const pid of created) store.remove(pid).catch(() => {});
              photos.forEach((p) => { if (created.includes(p.id)) { p.src = photoCache.get(p.id); p.pending = true; delete p.id; } });
              progress.textContent = "";
              toast(errText(err), { tone: "bad", ms: 3600 });
              busy = false;
              submitBtn.disabled = false;
            }
          });

          el.querySelector('[data-act="delete"]')?.addEventListener("click", async () => {
            if (busy) return;
            if (!(await confirmSheet("删除这段回忆和里面的照片？删除后不能恢复。", { ok: "删除", danger: true }))) return;
            try {
              await store.remove(it.id);
              for (const p of d.photos || []) store.remove(p.id).catch(() => {});
              state.items = state.items.filter((x) => x.id !== it.id);
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
      const card = el.closest(".mem");
      const it = card && state.items.find((x) => x.id === card.dataset.id);
      switch (el.dataset.act) {
        case "add": openEditor(null); break;
        case "edit": if (it) openEditor(it.id); break;
        case "view": if (it) openViewer(it, +el.dataset.i || 0); break;
        case "shuffle": {
          const others = state.items.filter((x) => x.id !== state.randomId);
          if (others.length) { state.randomId = pick(others).id; render(); }
          break;
        }
        case "reload": state.loaded = false; render(); load(); break;
      }
    };
    root.addEventListener("click", onClick);
    offs.push(() => root.removeEventListener("click", onClick));

    // 回忆不常变，切回来时刷新一下就够了；另外每 2 分钟看一眼
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => { if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) load(); }, 120000);
    offs.push(() => { document.removeEventListener("visibilitychange", onVisible); clearInterval(poll); });

    render();
    load();

    return () => { alive = false; offs.forEach((f) => f()); };
  },
};
