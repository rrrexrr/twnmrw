/* 进门：共同暗号（里程碑、点菜不区分是谁，两个人就是一体） */
import { html, raw } from "./dom.js";
import { store } from "./store.js";
import { sticker } from "./pixel.js";
import { burstFrom, buzz } from "./celebrate.js";

const MAX_LEN = 12;

/**
 * 云端模式下还没输入过暗号，就在 root 里显示密码键盘，验证通过后 resolve。
 * 本地模式或已经输过，直接 resolve。
 */
export function requireUnlock(root) {
  if (store.hasCode()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let code = "";
    let busy = false;

    root.innerHTML = html`
      <section class="card lock">
        <div class="lock-art">${raw(sticker(10))}</div>
        <h2 class="lock-title">输入我们的暗号</h2>
        <p class="lock-sub">只有我们俩知道的那串数字</p>
        <div class="lock-dots" aria-hidden="true"></div>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button type="button" class="key" data-key="${n}">${n}</button>`)}
          <button type="button" class="key key-soft" data-key="clear">清空</button>
          <button type="button" class="key" data-key="0">0</button>
          <button type="button" class="key key-soft" data-key="back" aria-label="删除">⌫</button>
        </div>
        <button type="button" class="btn primary lock-go" disabled>进入</button>
        <p class="lock-msg" role="alert"></p>
      </section>`;

    const card = root.querySelector(".lock");
    const dots = root.querySelector(".lock-dots");
    const go   = root.querySelector(".lock-go");
    const msg  = root.querySelector(".lock-msg");

    const paint = () => {
      const slots = Math.max(6, code.length);
      dots.innerHTML = Array.from({ length: slots }, (_, i) =>
        `<span class="dot${i < code.length ? " is-on" : ""}"></span>`).join("");
      go.disabled = code.length < 4 || busy;
    };

    const press = (k) => {
      if (busy) return;
      msg.textContent = "";
      if (k === "back") code = code.slice(0, -1);
      else if (k === "clear") code = "";
      else if (/^\d$/.test(k) && code.length < MAX_LEN) code += k;
      paint();
    };

    const submit = async () => {
      if (busy || code.length < 4) return;
      busy = true; paint();
      go.textContent = "验证中…";
      const res = await store.verify(code);
      busy = false;
      go.textContent = "进入";
      if (res.ok) {
        store.setCode(code);
        window.removeEventListener("keydown", onKey);
        burstFrom(go, { count: 40 });
        buzz([10, 40, 10]);
        resolve(true);
        return;
      }
      msg.textContent =
        res.error === "locked"  ? "试太多次啦，10 分钟后再来" :
        res.error === "network" ? "连不上云端，检查一下网络再试" :
                                  "暗号不对哦，再想想～";
      card.classList.remove("is-shake"); void card.offsetWidth; card.classList.add("is-shake");
      buzz([30, 40, 30]);
      code = ""; paint();
    };

    const onKey = (e) => {
      if (!root.isConnected || !root.contains(card)) { window.removeEventListener("keydown", onKey); return; }
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") submit();
    };

    root.querySelector(".keypad").addEventListener("click", (e) => {
      const k = e.target.closest("[data-key]");
      if (k) press(k.dataset.key);
    });
    go.addEventListener("click", submit);
    window.addEventListener("keydown", onKey);
    paint();
  });
}
