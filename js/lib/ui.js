/* 通用界面组件：提示条、底部弹层、确认框 */
import { html, raw } from "./dom.js";

/* ---------- 提示条 ---------- */

let toastHost = null;

export function toast(message, { icon = "", tone = "", ms = 2400 } = {}) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.append(toastHost);
  }
  const t = document.createElement("div");
  t.className = `toast ${tone}`;
  t.innerHTML = html`${icon ? raw(`<span class="toast-ico">${icon}</span>`) : ""}<span>${message}</span>`;
  toastHost.append(t);
  const remove = () => t.remove();
  setTimeout(() => {
    t.classList.add("is-out");
    t.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 700);
  }, ms);
}

/* ---------- 弹层（手机上从底部弹出，电脑上居中） ---------- */

export function openSheet({ title = "", body = "", onMount, className = "" }) {
  const dlg = document.createElement("dialog");
  dlg.className = `sheet ${className}`;
  dlg.innerHTML = html`
    <div class="sheet-inner">
      <header class="sheet-head">
        <h3>${title}</h3>
        <button class="icon-btn" type="button" data-close aria-label="关闭">✕</button>
      </header>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.append(dlg);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dlg.classList.add("is-closing");
    setTimeout(() => { try { dlg.close(); } catch { /* ignore */ } dlg.remove(); }, 180);
  };

  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) close();
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });

  dlg.showModal();
  onMount?.(dlg, close);
  return { el: dlg, close };
}

/** 确认框，返回 Promise<boolean> */
export function confirmSheet(text, { ok = "确定", danger = false, title = "确认一下" } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { el, close } = openSheet({
      title,
      className: "sheet-confirm",
      body: html`
        <p class="confirm-text">${text}</p>
        <div class="sheet-actions">
          <button class="btn ghost" type="button" data-answer="no">再想想</button>
          <button class="btn ${danger ? "danger" : "primary"}" type="button" data-answer="yes">${ok}</button>
        </div>`,
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-answer]");
      if (!b) return;
      answered = true;
      resolve(b.dataset.answer === "yes");
      close();
    });
    el.addEventListener("close", () => { if (!answered) resolve(false); });
    // 点背景关掉时也要有结果
    const obs = new MutationObserver(() => {
      if (!el.isConnected) { obs.disconnect(); if (!answered) resolve(false); }
    });
    obs.observe(document.body, { childList: true });
  });
}
