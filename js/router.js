/* 底部导航 + 页面切换（#/home、#/milestones ……）
   加新功能：在 TABS 里加一行，再写一个 blocks/xxx.js 就行 */
import { $, html, raw } from "./lib/dom.js";
import { icon } from "./lib/pixel.js";

export const TABS = [
  { id: "home",       label: "首页",   icon: "home",       load: () => import("./blocks/home.js") },
  { id: "milestones", label: "里程碑", icon: "milestones", load: () => import("./blocks/milestones.js") },
  { id: "menu",       label: "点菜",   icon: "menu",       load: () => import("./blocks/menu.js") },
  { id: "dates",      label: "约会",   icon: "dates",      load: () => import("./blocks/placeholder.js") },
  { id: "memories",   label: "回忆",   icon: "memories",   load: () => import("./blocks/placeholder.js") },
  { id: "games",      label: "小游戏", icon: "games",      load: () => import("./blocks/placeholder.js") },
];

const SITE_TITLE = "我们的小站";

let current = null;   // 当前页面的清理函数
let token = 0;        // 防止快速切换时旧页面晚到

function renderTabbar() {
  const bar = $("#tabbar");
  bar.innerHTML = html`${TABS.map((t) => html`
    <a class="tab" href="#/${t.id}" data-tab="${t.id}">
      ${raw(icon(t.icon))}
      <span class="tab-label">${t.label}</span>
    </a>`)}`;
}

function markActive(id) {
  document.querySelectorAll(".tab").forEach((a) => {
    const on = a.dataset.tab === id;
    a.classList.toggle("is-active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

async function route() {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  const my = ++token;

  try { current?.(); } catch { /* ignore */ }
  current = null;

  markActive(tab.id);
  document.documentElement.dataset.view = tab.id;
  const view = $("#view");
  view.className = `view view-${tab.id}`;
  view.innerHTML = "";

  let block;
  try {
    block = (await tab.load()).default;
  } catch (err) {
    console.error(err);
    view.innerHTML = html`<section class="card"><p>页面加载失败了，刷新试试 🙏</p></section>`;
    return;
  }
  if (my !== token) return;

  document.title = tab.id === "home" ? SITE_TITLE : `${tab.label} · ${SITE_TITLE}`;
  view.classList.remove("is-entering"); void view.offsetWidth; view.classList.add("is-entering");
  if (tab.id !== "home") window.scrollTo({ top: 0 });

  const cleanup = await block.mount(view, { tab });
  if (my !== token) { try { cleanup?.(); } catch { /* ignore */ } return; }
  current = cleanup || null;
}

export function startRouter() {
  renderTabbar();
  addEventListener("hashchange", route);
  // 暗号失效（被改了）时，重新进当前页，会自动弹出密码键盘
  addEventListener("hq:locked", route);
  route();
}
