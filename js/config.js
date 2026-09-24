/* ==========================================================
   配置 —— 日常只需要改这个文件
   ========================================================== */

/* ---------- 倒计时 ---------- */

// 起点时间 / 见面时间（本地时间，格式：YYYY-MM-DDTHH:mm:ss）
export const START_DATE   = "2026-09-06T00:00:00";
export const MEETING_DATE = "2026-12-23T23:59:59";

// 两个人的名字
export const PERSON_1 = "洛洛";   // Willow
export const PERSON_2 = "Rex";

// 地点（两个都填才显示；留空 "" 不显示）
export const LOCATION_1 = "";
export const LOCATION_2 = "";

// 英文名两边自动加空格，中文名不加
const sp = (name) => (/[A-Za-z0-9]/.test(name) ? ` ${name} ` : name);

// 文案
export const EYEBROW         = "";   // 标题上方的小标签，留空不显示
export const TITLE_TEXT      = `距离${sp(PERSON_2)}和${sp(PERSON_1)}下次见面还有`;
export const ARRIVED_TEXT    = "❤️见面就是今天❤️";
export const ARRIVED_EYEBROW = "";
export const ARRIVED_TITLE   = `${sp(PERSON_2)}和${sp(PERSON_1)}`.trim();
export const FOOTER_TEXT     = "相思病犯的时候 就来看一眼吧～";
export const HINT_TEXT       = "轻点一下 ♡";

export const PERCENT_DECIMALS = 2;
export const LABEL_LOCALE     = "en-US";   // 时间轴日期："en-US" → September 6；"zh-CN" → 9月6日

/* ---------- 外观 ---------- */

// 第一次打开时的背景："globe"（地球航线）或 "scene"（像素画）
export const DEFAULT_BG = "globe";

// 像素小人配色（左 Rex，右 洛洛）
export const PIXEL_COLORS = {
  h: "#4a4250", H: "#5a3f3a", s: "#f8d8c0", e: "#3a3444",
  a: "#a996e8", b: "#f4a6bb", l: "#6f6880", o: "#4a4455",
};

// 点击冒出的爱心
export const HEART_COLORS   = ["#f4718f", "#ff93ad", "#e8709a", "#a996e8"];
export const HEARTS_PER_TAP = 5;

/* ---------- 云端同步（Supabase） ----------
   两个都留空 = 本地模式：数据只存在当前这台设备的浏览器里。
   填好以后两个人看到的是同一份数据，需要输入共同的暗号才能进入。
   设置方法见 README「开启云端同步」。 */
export const SUPABASE_URL = "https://fzibkxqrskhppqdigvhv.supabase.co";   // 例如 "https://abcdefgh.supabase.co"
export const SUPABASE_KEY = "sb_publishable_zZnTJoYUehTL7BAgb8_lvA_-oAo1ID0";   // Publishable key（sb_publishable_...）或旧版 anon key

// 发消息给对方时附带的网址
export const SITE_URL = "https://rrrexrr.github.io/twnmrw/";
