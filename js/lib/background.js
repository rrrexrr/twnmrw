/* 背景：地球航线 ⇄ 像素画，记住每个人自己的选择 */
import { DEFAULT_BG } from "../config.js";
import { $, saved } from "./dom.js";

const ORDER = ["globe", "scene"];
const KEY = "next-meeting-bg";

function apply(name) {
  document.documentElement.dataset.bg = name;
  saved.set(KEY, name);
}

export function initBackground() {
  const savedBg = saved.get(KEY);
  apply(ORDER.includes(savedBg) ? savedBg : DEFAULT_BG);

  $("#bgSwitch")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const current = document.documentElement.dataset.bg;
    apply(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
  });
}
