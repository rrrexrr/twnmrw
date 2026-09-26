/**
 * 我们的小站 · 邮件提醒（Google Apps Script）
 *
 * 数据库那边一有新点单 / 完成了里程碑 / 新留言，就会 POST 到这里，这里用你的 Gmail 发一封邮件。
 * 怎么装：见 README「邮件提醒」。这个文件整段复制到 script.google.com 的 Code.gs 里。
 *
 * 口令和收件人不写在代码里，放在「项目设置 → 脚本属性」：
 *   TOKEN  必填：notify.sql 运行完显示的那串口令
 *   TO     选填：收件人，多个用英文逗号隔开；不填就发给你自己
 * 改脚本属性不用重新部署；改了这里的代码（包括以后整段换成新版），
 * 要「部署 → 管理部署 → 编辑（铅笔）→ 版本选「新版本」→ 部署」才生效，网址不变。
 */

const SITE = "https://rrrexrr.github.io/twnmrw/";
const SENDER_NAME = "我们的小站";

// 和网站里的等级保持一致（js/blocks/milestones.js 的 LEVELS）
const LEVELS = [
  [0, "刚刚出发"], [1, "初次心动"], [3, "渐入佳境"], [5, "心有灵犀"], [8, "形影不离"],
  [12, "默契满分"], [17, "非你不可"], [23, "天生一对"], [30, "白头偕老"],
];

function doPost(e) {
  let msg;
  try { msg = JSON.parse(e.postData.contents); } catch (err) { return reply({ ok: false, error: "bad_json" }); }

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TOKEN");
  if (!token || msg.token !== token) {
    console.warn("口令不对：检查脚本属性 TOKEN 是否和 notify.sql 显示的一致");
    return reply({ ok: false, error: "bad_token" });
  }

  const mail = compose(msg);
  if (!mail) return reply({ ok: false, error: "unknown_event" });
  console.log("发送：" + mail.subject);

  MailApp.sendEmail({
    to: props.getProperty("TO") || Session.getEffectiveUser().getEmail(),
    subject: mail.subject,
    body: mail.text,
    htmlBody: mail.html,
    name: SENDER_NAME,
  });
  return reply({ ok: true });
}

/** 在编辑器里选这个函数点「运行」，可以先授权 + 看看邮件长什么样 */
function sendTest() {
  const mail = compose({ event: "order", data: { items: [{ name: "番茄炒蛋", qty: 1 }, { name: "可乐鸡翅", qty: 2 }], note: "少放辣" } });
  MailApp.sendEmail({
    to: PropertiesService.getScriptProperties().getProperty("TO") || Session.getEffectiveUser().getEmail(),
    subject: "[测试] " + mail.subject, body: mail.text, htmlBody: mail.html, name: SENDER_NAME,
  });
}

function compose(msg) {
  const d = msg.data || {};

  if (msg.event === "order") {
    const items = (d.items || []).map((i) => i.name + (i.qty > 1 ? " ×" + i.qty : ""));
    const head = items.slice(0, 3).join("、") + (items.length > 3 ? " 等" + items.length + "道" : "");
    return card({
      subject: "🍽️ 我们点菜啦：" + (head || "新点单"),
      emoji: "🍽️",
      title: "我们点菜啦！",
      lines: items,
      note: d.note,
      link: SITE + "#/menu",
      button: "去接单",
    });
  }

  if (msg.event === "milestone") {
    const done = Number(msg.done) || 0, total = Number(msg.total) || 0;
    const lv = levelOf(done), before = levelOf(done - 1);
    const extra = [];
    if (total) extra.push("已经完成 " + done + " / " + total + " 个");
    if (lv.lv > before.lv) extra.push("🏆 升级到 Lv." + lv.lv + "「" + lv.name + "」！");
    else if (lv.next) extra.push("再完成 " + (lv.next[0] - done) + " 个，升级到「" + lv.next[1] + "」");
    return card({
      subject: "🎉 里程碑达成：" + (d.title || ""),
      emoji: "🎉",
      title: "达成「" + (d.title || "") + "」",
      lines: extra,
      note: d.note,
      link: SITE + "#/milestones",
      button: "去看看",
    });
  }

  if (msg.event === "note") {
    const text = String(d.text || "");
    const short = text.replace(/\s+/g, " ").trim();
    const head = short.length > 24 ? short.slice(0, 24) + "…" : short;
    return card({
      subject: "💌 " + (d.sign ? d.sign + " 留言啦" : "新留言") + "：" + head,
      emoji: "💌",
      title: d.sign ? d.sign + " 贴了一张新便签" : "留言板上有一张新便签",
      quote: text,
      sign: d.sign,
      link: SITE + "#/notes",
      button: "去回一张",
    });
  }

  if (msg.event === "test") {
    return card({ subject: "✅ 邮件提醒接通啦", emoji: "✅", title: "邮件提醒接通啦", lines: ["以后点菜、完成里程碑都会收到邮件"], link: SITE, button: "打开小站" });
  }
  return null;
}

function levelOf(n) {
  let i = 0;
  while (i + 1 < LEVELS.length && n >= LEVELS[i + 1][0]) i++;
  return { lv: i, name: LEVELS[i][1], next: LEVELS[i + 1] || null };
}

function card({ subject, emoji, title, lines, note, quote, sign, link, button }) {
  const text = [title].concat(lines || [], quote ? ["", quote, sign ? "—— " + sign : ""] : [], note ? ["备注：" + note] : [], ["", link]).join("\n");
  const html =
    '<div style="background:#f4f1fb;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',sans-serif;">' +
      '<div style="max-width:420px;margin:0 auto;background:#fff;border-radius:22px;padding:26px 24px;color:#26222e;">' +
        '<div style="font-size:34px;line-height:1;">' + emoji + '</div>' +
        '<h1 style="margin:12px 0 14px;font-size:20px;">' + esc(title) + '</h1>' +
        (lines || []).map((l) => '<p style="margin:6px 0;font-size:15px;">' + esc(l) + '</p>').join("") +
        (quote ? '<div style="margin:4px 0 0;padding:16px 16px 12px;border-radius:6px 6px 16px 6px;background:#fff6dc;font-size:15px;line-height:1.7;white-space:pre-wrap;word-break:break-word;">' + esc(quote) +
          (sign ? '<div style="margin-top:8px;text-align:right;color:#6d6779;font-size:14px;">—— ' + esc(sign) + '</div>' : "") + '</div>' : "") +
        (note ? '<p style="margin:14px 0 0;padding:10px 12px;border-radius:12px;background:#f7f3ff;font-size:14px;color:#5b5566;">「' + esc(note) + '」</p>' : "") +
        '<a href="' + link + '" style="display:inline-block;margin-top:20px;padding:10px 22px;border-radius:999px;background:#8f79e0;color:#fff;text-decoration:none;font-size:14px;">' + esc(button) + ' →</a>' +
      '</div>' +
      '<p style="text-align:center;margin:14px 0 0;font-size:12px;color:#9a94a6;">来自我们的小站 ♡</p>' +
    '</div>';
  return { subject, text, html };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
