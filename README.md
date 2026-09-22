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

### 换背景

右上角那个小按钮可以在两张背景之间切换，按钮上显示的是「下一张」背景的图标：

- **地球航线**（`globe`）：爱丁堡 ⇄ 温哥华，有飞机来回飞
- **柳树小恐龙**（`scene`）：铺满整屏的像素画，一只小恐龙坐在山坡上的柳树下

选择会记在浏览器里（`localStorage`），下次打开还是上次选的那张；
第一次打开时用哪张由 `script.js` 里的 `DEFAULT_BG` 决定（`"globe"` 或 `"scene"`）。

像素画是两张独立的 PNG，页面按屏幕比例自动选：

- `scene.png`（384×240）：横屏 / 电脑
- `scene-portrait.png`（240×420）：竖屏 / 手机、平板

切到这张背景时，倒计时卡片会自动变成半透明毛玻璃（`style.css` 里 `:root[data-bg="scene"] .card`），
让画透出来；想更透或更实，改那条规则里的 `rgba(255,255,255,0.60)` 即可。

想换画直接替换这两个文件就行（CSS 用 `object-fit: cover` 铺满，`image-rendering: pixelated` 保证像素不被糊掉）。
换了之后记得把 `index.html` 里这两张图后面的 `?v=` 数字 +1，不然浏览器会拿旧的缓存。

### 背景地球

`index.html` 顶部那段 `<svg class="globe">` 是页面背景里的地球：大陆轮廓、经纬线、以及爱丁堡 ⇄ 温哥华的航线，
都是按真实经纬度用正射投影算出来的（航线是真正的大圆航线，所以会从格陵兰上方掠过）。
一架小飞机沿航线来回飞，36 秒一个来回，去程和回程是两个独立的路径，所以机头方向都是对的。

样式在 `style.css` 的「背景地球」一节：`.globe` 的 `opacity` 控制整体浓淡，`.g-land` 是大陆轮廓，
`.g-route` 是航线虚线，`.g-city` 是两个城市的点。想让它更淡就把 `opacity: 0.62` 调小。

> 城市坐标是烘焙进 SVG 路径里的，换城市需要重新生成这段图形，不是改一个常量就行。

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

### 改完看不到变化？

`index.html` 里引用 CSS 和 JS 的地方带了版本号：

```html
<link rel="stylesheet" href="style.css?v=2" />
<script src="script.js?v=2"></script>
```

浏览器（尤其是 iOS Safari）会把 CSS / JS 缓存很久。**每次改完 `style.css` 或 `script.js`，把这两个数字 +1 再提交**，
所有人下次打开就一定是新版本，不用手动清缓存。

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
