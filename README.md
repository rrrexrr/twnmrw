# 下次见面 · Next Meeting

一个纯静态的倒计时页面：显示从「起点日期」到「下次见面日期」的进度条、百分比和实时倒计时。

- 只用 HTML / CSS / 原生 JavaScript，无框架、无后端、无数据库
- 可直接双击 `index.html` 在本地打开，也可以直接部署到 GitHub Pages
- 使用浏览器的本地时间，每秒自动刷新，不需要手动刷新页面

```
next-meeting/
├── index.html
├── style.css
├── script.js
└── README.md
```

---

## 1. 怎么修改设置

所有可配置项都在 **`script.js` 最上面的「配置区」**，改完保存、刷新页面即可。其余代码不用动。

```js
const START_DATE   = "2026-09-06T00:00:00";
const MEETING_DATE = "2026-12-23T23:59:59";

const PERSON_1 = "洛洛";   // Willow
const PERSON_2 = "Rex";

const LOCATION_1 = "";
const LOCATION_2 = "";
```

### 修改见面日期

改 `MEETING_DATE`，格式固定为 `YYYY-MM-DDTHH:mm:ss`（本地时间，不要加 `Z`）：

```js
const MEETING_DATE = "2027-02-14T18:30:00";   // 2027年2月14日 晚上6点半
```

### 修改起点日期

改 `START_DATE`，进度条就是从这一刻开始算的（通常是上次见面、或者开始倒数的那天）：

```js
const START_DATE = "2026-12-24T00:00:00";
```

> 起点必须早于见面时间，否则页面会提示日期设置有误。

### 修改名字

```js
const PERSON_1 = "Willow";
const PERSON_2 = "Rex";
```

标题会自动变成「距离 Rex 和 Willow 下次见面还有」（英文名两边会自动留空格，中文名不留）。
如果想完全自定义标题，改下面这行就行：

```js
const TITLE_TEXT = `距离${sp(PERSON_2)}和${sp(PERSON_1)}下次见面还有`;
```

### 修改地点

默认不显示地点。填上两个地点后，标题下方会出现一行小字 `Vancouver → 上海`：

```js
const LOCATION_1 = "Vancouver";
const LOCATION_2 = "上海";
```

想隐藏，把它们改回空字符串 `""` 即可。

### 其他可选项

| 常量 | 作用 |
| --- | --- |
| `EYEBROW` | 标题上方的小标签（默认 `Next Meeting`） |
| `ARRIVED_TEXT` | 见面当天显示的文字（默认 `❤️见面就是今天❤️`） |
| `ARRIVED_EYEBROW` / `ARRIVED_TITLE` | 见面当天的小标签和标题（默认 `Today` / `Rex 和洛洛`） |
| `FOOTER_TEXT` | 底部那句话 |
| `PERCENT_DECIMALS` | 百分比小数位数（默认 2） |
| `LABEL_LOCALE` | 时间轴两端日期的语言：`"en-US"` → `September 6`；`"zh-CN"` → `9月6日` |
| `HINT_TEXT` | 进度条下面那句小提示（设成 `""` 就不显示） |
| `PIXEL_COLORS` | 两个像素小人的配色（头发、衣服、皮肤、鞋） |
| `HEART_COLORS` / `HEARTS_PER_TAP` | 点击冒出的爱心颜色和数量 |

### 像素小人

进度条上方那两个手牵手的小人会跟着进度一起往右走，点击（手机上是轻触）页面任意位置，他们头顶会冒爱心。
见面当天他们会自己不停冒爱心。

小人的造型是用字符画定义的，在 `script.js` 里的 `REX_A` / `WILLOW_A`，一个字符就是一个像素点，
`.` 表示透明，其余字母对应 `PIXEL_COLORS` 里的颜色，想改发型或衣服直接改那几行字符即可。

### 字体

标题用的是系统自带的衬线字体（苹果设备上是 New York + 宋体，Windows 上是 Georgia + 宋体），
不需要下载，离线也能正常显示。想换风格的话，改 `style.css` 顶部的 `--font-title` 就行，
注释里给了另外两种现成的搭配（圆润无衬线 / 像素风）。

`NEXT MEETING` 那行小标签用的是像素字体 Press Start 2P，从 Google Fonts 加载；
万一加载不到（比如在国内），会自动退回等宽字体，不影响页面。

### 修改配色

配色集中在 `style.css` 最上方的 `:root` 变量里，例如把主色换掉：

```css
--lavender: #a996e8;        /* 进度条主色 */
--lavender-deep: #8f79e0;   /* 百分比文字、时间轴圆点 */
--heart: #f4718f;           /* 爱心 / 见面当天的强调色 */
```

---

## 2. 关于搜索引擎

`index.html` 里有一行：

```html
<meta name="robots" content="noindex, nofollow" />
```

它会让 Google / Bing 等搜索引擎不收录这个页面——知道网址的人照样能打开，只是搜不到。
想被收录的话，把这一行删掉即可。

> 注意：GitHub Pages 的站点本身永远是公网可访问的，即使仓库设成 private 也一样。所以不要在这个仓库里放任何敏感信息。

## 3. 发布到 GitHub Pages

仓库已经推到 GitHub 的前提下：

1. 打开仓库页面，点 **Settings**
2. 左侧菜单选 **Pages**
3. **Source** 选择 **Deploy from a branch**
4. **Branch** 选择 **main**，文件夹选择 **/ (root)**，点 **Save**
5. 等待 1–2 分钟，页面顶部会出现网址：
   `https://rrrexrr.github.io/twnmrw/`

### 关于目录

- 如果 `index.html` 就在仓库根目录 → 选 `/root`，访问 `https://<用户名>.github.io/<仓库名>/`
- 如果这些文件放在仓库里的 `next-meeting/` 子文件夹 → 同样选 `/root`，访问 `https://<用户名>.github.io/<仓库名>/next-meeting/`
- 也可以把文件夹改名成 `docs/`，然后在 Pages 里把文件夹选成 `/docs`

### 更新内容

改完 `script.js` 之后：

```bash
git add .
git commit -m "update meeting date"
git push
```

推送完等约一分钟，GitHub Pages 会自动重新部署。

---

## 4. 说明

- 时间按访问者设备的本地时间计算，所以两个人在不同时区看到的倒计时会有时差，这是正常的
- 进度百分比被限制在 0%–100% 之间，日期设错也不会出现负数或超过 100%
- 到达见面时间后，倒计时会替换成 `❤️见面就是今天❤️`，进度条停在 100%
- 日期格式写错时，页面会显示一条提示，而不是白屏
