/* 还没做好的页面：先放个预告 */
import { html, raw } from "../lib/dom.js";
import { icon } from "../lib/pixel.js";

const PLANS = {
  dates:    { title: "约会", lines: ["提议一个约会：时间、地点、想做的事", "对方一键答应 / 改个时间", "到点了提醒，结束后顺手存进回忆"] },
  memories: { title: "回忆", lines: ["照片 + 一句话，按时间排成相册", "那年今天：翻出以前的今天", "登录后才能看，不会公开"] },
  games:    { title: "小游戏", lines: ["默契问答：同一题，看看答案一不一样", "每日签到：连续见面天数攒小星星", "抽签：今天谁洗碗"] },
};

export default {
  mount(root, { tab }) {
    const plan = PLANS[tab.id] || { title: tab.label, lines: [] };
    root.innerHTML = html`
      <section class="card soon">
        <div class="soon-icon">${raw(icon(tab.icon))}</div>
        <h2 class="soon-title">${plan.title}</h2>
        <p class="soon-sub">正在施工中，很快就来 🚧</p>
        <ul class="soon-list">${plan.lines.map((l) => html`<li>${l}</li>`)}</ul>
      </section>`;
  },
};
