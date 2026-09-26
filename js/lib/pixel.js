/* 像素画：字符地图 → SVG。每个字符是一个像素，"." 是透明。 */

/**
 * @param {string[]} rows    每行一串字符
 * @param {object}   colors  字符 → 颜色；颜色写 "currentColor" 会跟随文字颜色
 * @param {object}   opts    { cls, dim }：dim 里列出的字符画成半透明
 */
export function pixelSvg(rows, colors, { cls = "", dim = "" } = {}) {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  let rects = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || ch === " ") { x++; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      const op = dim.includes(ch) ? ' opacity=".42"' : "";
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[ch] || "currentColor"}"${op}/>`;
      x += run;
    }
  });
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/* ---------- 底部导航图标（跟随文字颜色） ---------- */

const ICON_ROWS = {
  home: [
    "............", ".....xx.....", "....xxxx....", "...xxxxxx...",
    "..xxxxxxxx..", ".xxxxxxxxxx.", "..xoooooox..", "..xoooooox..",
    "..xooxxoox..", "..xooxxoox..", "..xxxxxxxx..", "............",
  ],
  milestones: [
    "............", "..xx........", "..xxxxxxx...", "..xxxxxxxxx.",
    "..xxxxxxxx..", "..xxxxx.....", "..xx........", "..xx........",
    "..xx........", "..xx........", ".xxxx.......", "............",
  ],
  menu: [
    "............", "...o..o..o..", "..o..o..o...", "............",
    "xxxxxxxxxxxx", ".xxxxxxxxxx.", ".xxxxxxxxxx.", "..xxxxxxxx..",
    "...xxxxxx...", "....xxxx....", "...xxxxxx...", "............",
  ],
  dates: [
    "............", "..x....x....", ".xxxxxxxxxx.", ".xxxxxxxxxx.",
    ".xoooooooox.", ".xoxoxoxoox.", ".xoooooooox.", ".xoxoxoooox.",
    ".xoooooooox.", ".xxxxxxxxxx.", "............", "............",
  ],
  memories: [
    "............", "............", ".xxxxxxxxxx.", ".xoooooooox.",
    ".xoooooxoox.", ".xoooooooox.", ".xoooxoooox.", ".xooxxxoxox.",
    ".xoxxxxxxxx.", ".xxxxxxxxxx.", "............", "............",
  ],
  notes: [
    "............", ".xxxxxxxxxx.", ".xoooooooox.", ".xoxxxxxxox.",
    ".xoooooooox.", ".xoxxxxooox.", ".xoooooooox.", ".xxxxxxxxxx.",
    "..xxx.......", "..xx........", "..x.........", "............",
  ],
  games: [
    "............", "............", "............", "..xxxxxxxx..",
    ".xxxxxxxxxx.", "xxxoxxxxxoxx", "xxoooxxxoxox", "xxxoxxxxxoxx",
    "xxxxxxxxxxxx", "xxx......xxx", "............", "............",
  ],
};

export const icon = (name) => pixelSvg(ICON_ROWS[name], {}, { cls: "px-icon", dim: "o" });

/* ---------- 牵手的小人 ---------- */

export const REX = [
  "..hhhh..", ".hhhhhh.", ".hssssh.", ".hseses.", "..ssss..", ".aaaaaa.",
  ".aaaaaas", ".aaaaaa.", ".aaaaaa.", "..llll..", "..l..l..", "..l..l..", "..o..o..",
];
export const WILLOW = [
  "..HHHH..", ".HHHHHH.", ".HssssH.", ".HseseH.", ".HssssH.", ".bbbbbb.",
  "sbbbbbb.", ".bbbbbb.", ".bbbbbb.", "bbbbbbbb", "..l..l..", "..l..l..", "..o..o..",
];

/** 第二帧只换腿的姿势，两帧交替就是走路 */
export const stepFrame = (rows) =>
  rows.map((row, i) => (i >= 10 ? row.replace("l..l", ".ll.").replace("o..o", ".oo.") : row));

/** 两个小人并排，中间那格画成牵着的手 */
export const joinSprites = (left, right, gap = 2, handRow = 6) =>
  left.map((row, i) => row + (i === handRow ? "s".repeat(gap) : ".".repeat(gap)) + right[i]);

export const HEART = [".hh.hh.", "hhhhhhh", "hhhhhhh", ".hhhhh.", "..hhh..", "...h..."];

/* ---------- 里程碑奖励：像素贴纸 ---------- */

export const STICKERS = [
  { name: "小心心", rows: [".xxx..xxx.", "xwwxxxxxxx", "xwxxxxxxxx", "xxxxxxxxxx", ".xxxxxxxx.", "..xxxxxx..", "...xxxx...", "....xx...."],
    colors: { x: "#f4718f", w: "#ffd0dc" } },
  { name: "小星星", rows: ["....xx....", "....xx....", "...xxxx...", "xxxxwxxxxx", ".xxxxxxxx.", "..xxxxxx..", "..xxxxxx..", ".xxx..xxx.", ".xx....xx."],
    colors: { x: "#ffc94d", w: "#fff1b8" } },
  { name: "郁金香", rows: ["..x.xx.x..", "..xxxxxx..", "..xxwxxx..", "...xxxx...", "....gg....", ".gg.gg....", "..gggg....", "....gg.gg.", "....gggg..", "....gg...."],
    colors: { x: "#ff8fb1", w: "#ffd0dc", g: "#7cbb73" } },
  { name: "小太阳", rows: ["y...yy...y", ".y..yy..y.", "...yyyy...", ".yyyyyyyy.", "yyyywwyyyy", "yyyywwyyyy", ".yyyyyyyy.", "...yyyy...", ".y..yy..y.", "y...yy...y"],
    colors: { y: "#ffc24b", w: "#ffe7a3" } },
  { name: "弯月亮", rows: ["....mmmm..", "..mmmm....", ".mmm......", ".mmm......", ".mmm......", ".mmmm.....", "..mmmmm...", "...mmmmmm.", "....mmmm.."],
    colors: { m: "#b9a6ef" } },
  { name: "小飞机", rows: ["....pp....", "....pp....", "...pppp...", "pppppppppp", "pppppppppp", "....pp....", "....pp....", "...pppp...", "..pppppp.."],
    colors: { p: "#8f79e0" } },
  { name: "情书", rows: ["dddddddddd", "ddwwwwwwdd", "dwdwwwwdwd", "dwwdwwdwwd", "dwwwrrwwwd", "dwwwrrwwwd", "dwwwwwwwwd", "dddddddddd"],
    colors: { d: "#e0a36b", w: "#fff4e0", r: "#f4718f" } },
  { name: "小礼物", rows: ["..r....r..", "...r..r...", "rrrrrrrrrr", "ggggrrgggg", "ggggrrgggg", ".gggrrggg.", ".gggrrggg.", ".gggrrggg.", ".gggrrggg."],
    colors: { r: "#ff8fb1", g: "#a996e8" } },
  { name: "小蛋糕", rows: ["....f.....", "....c.....", ".wwwwwwww.", ".pwpwpwpw.", ".pppppppp.", ".bbbbbbbb.", ".pppppppp.", "dddddddddd"],
    colors: { f: "#ffb14a", c: "#ffffff", w: "#fffaf2", p: "#f4a6bb", b: "#d9a36f", d: "#c9b8f2" } },
  { name: "钻戒", rows: ["...dddd...", "..dwdddd..", "...dddd...", "..gggggg..", ".gg....gg.", ".g......g.", ".g......g.", ".gg....gg.", "..gggggg.."],
    colors: { d: "#9fd6f5", w: "#ffffff", g: "#f2c14e" } },
  { name: "钥匙", rows: ["..kkk.....", ".k...k....", ".k...k....", "..kkkkkkkk", "......k.k.", "......k.k."],
    colors: { k: "#f2c14e" } },
  { name: "小猫咪", rows: ["c........c", "cc......cc", "cccccccccc", "cceccccecc", "cccccpcccc", "ccccpcpccc", ".cccccccc."],
    colors: { c: "#f0a860", e: "#3a3444", p: "#f4718f" } },
];

export const TROPHY = {
  rows: ["y.yyyyyy.y", "yyyywyyyyy", ".yyywyyyy.", "..yyyyyy..", "...yyyy...", "....yy....", "....yy....", "..bbbbbb.."],
  colors: { y: "#ffcf5a", w: "#fff1b8", b: "#a8825f" },
};

export const sticker = (i, cls = "") => {
  const s = STICKERS[i % STICKERS.length];
  return pixelSvg(s.rows, s.colors, { cls: `px-sticker ${cls}` });
};
