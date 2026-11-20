/* 首页的圣诞树进度：树上的小灯从下往上一盏盏点亮，两个小人踩着梯子一路往上挂
   坐标都以「像素格」为单位：整个场景 SCENE_W × SCENE_H 格，树居中 */

export const SCENE_W = 60;
export const SCENE_H = 46;
const CX = 30;               // 树的中心线
const GROUND = 45;           // 最底下一行（雪地）

// 三层树冠：[起始行, 结束行, 顶端半宽, 底部半宽]
const TIERS = [
  [5, 14, 1, 6],
  [12, 24, 3, 10],
  [21, 36, 5, 15],
];
const TRUNK = [37, 40, 2];   // 行范围 + 半宽
const POT = [41, 44, 5];

/** 某一行树冠的半宽（不在树冠里返回 -1） */
export function halfAt(y) {
  let h = -1;
  for (const [y0, y1, a, b] of TIERS) {
    if (y >= y0 && y <= y1) h = Math.max(h, Math.round(a + ((b - a) * (y - y0)) / (y1 - y0)));
  }
  return h;
}

const BULB_COLORS = ["#ff5a6e", "#ffd24a", "#7ec8ff", "#ff9ad5", "#c3b2ff", "#fff6d6"];

/** 小灯的位置：从下往上，同一行从外往里（两个人从两边往中间挂） */
export const BULBS = (() => {
  const out = [];
  let row = 0;
  for (let y = 35; y >= 7; y -= 2, row++) {
    const h = halfAt(y);
    if (h < 2) continue;
    const n = Math.max(1, Math.floor((h * 2 - 1) / 4));
    const step = (h * 2 - 2) / n;
    const shift = row % 2 ? step / 2 : 0;
    for (let k = 0; k < n; k++) {
      const x = Math.round(CX - h + 1 + shift + k * step);
      if (Math.abs(x - CX) <= h - 1) out.push({ x, y });
    }
  }
  out.sort((a, b) => b.y - a.y || Math.abs(b.x - CX) - Math.abs(a.x - CX));
  return out.map((b, i) => ({ ...b, color: BULB_COLORS[(b.x * 7 + b.y * 3) % BULB_COLORS.length], i }));
})();

const rect = (x, y, w, h, fill, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

/** 静态的树（树冠、树干、花盆、雪地、星星、所有小灯），灯的亮灭之后只改 class */
export function treeSvg() {
  let s = "";

  // 雪地
  s += rect(0, GROUND, SCENE_W, 1, "#e6eefb");
  s += rect(6, GROUND - 1, SCENE_W - 12, 1, "#eef4fd");

  // 树冠：左半亮一点、右半暗一点；每层最下面一行带一点雪
  for (let y = 4; y <= 36; y++) {
    const h = halfAt(y);
    if (h < 0) continue;
    s += rect(CX - h, y, h + 1, 1, "#4c8f58");
    s += rect(CX + 1, y, h, 1, "#3c7849");
  }
  for (const [, y1, , b] of TIERS) {
    for (let x = CX - b; x <= CX + b; x += 2) s += rect(x, y1, 1, 1, "#e9f3ee");
  }
  // 一点点纹理
  for (let y = 6; y <= 35; y += 3) {
    const h = halfAt(y);
    if (h > 2) s += rect(CX - Math.floor(h / 2), y, 1, 1, "#5fa36a") + rect(CX + Math.ceil(h / 2), y + 1, 1, 1, "#336b41");
  }

  // 树干 + 花盆
  s += rect(CX - TRUNK[2], TRUNK[0], TRUNK[2] * 2 + 1, TRUNK[1] - TRUNK[0] + 1, "#8a5a3c");
  s += rect(CX - POT[2], POT[0], POT[2] * 2 + 1, POT[1] - POT[0] + 1, "#d9566b");
  s += rect(CX - POT[2] - 1, POT[0], POT[2] * 2 + 3, 1, "#e9707f");
  s += rect(CX - POT[2], POT[0] + 2, POT[2] * 2 + 1, 1, "#ffd24a");

  // 小灯（底下一圈光晕 + 灯泡本身）
  s += `<g class="xt-bulbs">${BULBS.map((b) =>
    `<g class="xt-bulb" data-i="${b.i}" style="--c:${b.color};--d:${((b.i * 0.37) % 2.4).toFixed(2)}s">` +
      `<circle class="xt-glow" cx="${b.x + 0.5}" cy="${b.y + 0.5}" r="1.5" fill="${b.color}"/>` +
      rect(b.x, b.y, 1, 1, "#24503a", ' class="xt-dot"') +
    `</g>`).join("")}</g>`;

  // 顶上的星星
  const star = ["..x..", ".xxx.", "xxxxx", ".xxx.", ".x.x."];
  s += `<g class="xt-star"><circle class="xt-glow" cx="${CX + 0.5}" cy="2.5" r="4" fill="#ffd24a"/>`;
  star.forEach((row, y) => [...row].forEach((c, i) => { if (c === "x") s += rect(CX - 2 + i, y, 1, 1, "currentColor"); }));
  s += `</g>`;

  // 满了以后出现在树下的礼物
  s += `<g class="xt-gifts">` +
    rect(16, 40, 5, 4, "#a996e8") + rect(18, 40, 1, 4, "#ffd24a") + rect(15, 39, 7, 1, "#c3b2ff") + rect(17, 38, 1, 1, "#ffd24a") + rect(19, 38, 1, 1, "#ffd24a") +
    rect(39, 41, 6, 3, "#ff9ad5") + rect(41, 41, 1, 3, "#ffffff") + rect(38, 40, 8, 1, "#ffb3d9") +
  `</g>`;

  return `<svg class="xt-svg" viewBox="0 0 ${SCENE_W} ${SCENE_H}" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}

/** 现在挂到第几盏灯 → 两个小人应该站在哪（左上角坐标，单位：格） */
export function kidsAt(lit) {
  const total = BULBS.length;
  const target = BULBS[Math.min(lit, total - 1)];
  const y = lit >= total ? 6 : target.y;          // 手所在的那一行
  const top = Math.max(0, Math.min(GROUND - 13, y - 6));
  const feet = top + 12;
  const h = Math.max(1, halfAt(Math.min(36, Math.max(5, y))));
  const leftX = Math.max(0, CX - h - 1 - 8);
  const rightX = Math.min(SCENE_W - 8, CX + h + 2);
  return { top, feet, leftX, rightX, ground: GROUND };
}
