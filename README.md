# 我们的小站 · Rex & 洛洛 HQ

一个纯静态的小网站，部署在 GitHub Pages 上，底部导航可以切换不同的功能：

| 页面 | 状态 | 说明 |
| --- | --- | --- |
| 首页 | ✅ | 见面倒计时、牵手的像素小人、点屏幕冒爱心 |
| 里程碑 | ✅ | 时间线 + 进度条，完成一步推进一格；解锁贴纸、升级 |
| 点菜 | ✅ | 菜单、「今天吃什么」随机抽、发到聊天、共享点单 |
| 邮件提醒 | ✅（可选） | 点了菜 / 完成了里程碑，自动发邮件 |
| 约会 / 回忆 / 小游戏 | 🚧 | 预告页，之后一个个做 |

右上角的小按钮可以切换两张背景：地球航线 / 像素画。

---

## 目录结构

```
index.html              页面骨架（背景、导航、版本号）
manifest.webmanifest    「添加到主屏幕」用的配置
css/
  base.css              配色、布局、卡片、导航、按钮、弹层等通用样式
  home.css              首页倒计时
  milestones.css        里程碑
  menu.css              点菜
js/
  config.js             ★ 日常只需要改这个文件
  main.js               入口
  router.js             底部导航 + 页面切换（加新页面在这里加一行）
  lib/                  通用工具：数据存取、暗号、弹层、特效、像素画……
  blocks/               每个页面一个文件
assets/                 像素画背景、App 图标
supabase/schema.sql     云端数据库（开启云端同步时用）
supabase/notify.sql     邮件提醒：数据库这边的触发器（可选）
supabase/apps-script.gs 邮件提醒：Google 那边负责发信的小脚本（可选）
.github/workflows/      保持云端数据库醒着的定时任务
```

---

## 本地预览

现在用的是现代 JavaScript 模块写法，**直接双击 `index.html` 打不开**（浏览器的安全限制），需要起一个本地服务器：

- **VS Code**：装一个「Live Server」扩展，右键 `index.html` → Open with Live Server
- **终端**：在项目文件夹里运行 `python3 -m http.server 8000`，然后打开 http://localhost:8000

---

## 日常修改

改 `js/config.js` 就行：见面日期、名字、文案、默认背景、云端地址都在里面。

**改完 css / js 之后**，把 `index.html` 里所有的 `?v=15` 换成新数字（VS Code：`Cmd+Shift+H` 全局替换，比如换成 `?v=16`），
不然手机会继续用旧的缓存。只改 `config.js` 也一样要换。

推送：

```bash
git add -A
git commit -m "update"
git push
```

---

## 两种模式

### 本地模式（默认）

`config.js` 里 `SUPABASE_URL` 和 `SUPABASE_KEY` 留空时，里程碑、菜单、点单都只存在**当前这台设备的浏览器**里。
自己玩没问题，但两个人看到的是各自的数据。

### 云端模式（推荐）

两个人看到同一份数据：你完成的里程碑她马上能看到，她点的菜你这边能接单。
进入这些页面需要输入你们共同的**暗号**（一串数字），每台设备只需要输一次。

#### 开启云端同步（大约 10 分钟）

1. 打开 [supabase.com](https://supabase.com) 注册，点 **New project**，名字随便起，数据库密码存好（这个用不到但别丢），地区选离你们近的，免费档就够
2. 项目建好后，左边点 **SQL Editor** → **New query**
3. 打开本项目的 `supabase/schema.sql`，**先把最底部的 `'在这里填暗号'` 改成你们的暗号**（4~12 位数字，建议 8 位以上，别用生日纪念日这种好猜的），然后整个复制进去，点 **Run**
   - 如果忘了改暗号，会看到一条红字提示，改好再 Run 一次就行
   - 以后想换暗号：改这一行再 Run 一次整个文件（不会删数据）。换了以后两台设备都会被请回密码页，输新暗号即可
4. 左边点 **Project Settings** → **API Keys**，复制 **Publishable key**（`sb_publishable_` 开头）；再到 **Data API**（或项目首页）复制 **Project URL**
5. 填进 `js/config.js`：

   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_KEY = "sb_publishable_xxxxxxxxxxxx";
   ```

6. 换一下 `index.html` 里的版本号，push。打开网站 → 里程碑 → 输入暗号，完成

> **这个 key 放在网页里安全吗？** 安全。Publishable key 本来就是设计给网页公开用的。
> 数据库的三张表对它完全关闭，它唯一能做的是调用 `schema.sql` 里那几个函数，而每个函数都会先核对暗号。
> 暗号在数据库里只存加密后的哈希；10 分钟内输错 20 次会自动锁 10 分钟，防止被一个个猜。

#### 防止云端数据库「睡着」（可选但推荐）

Supabase 免费项目如果连续 7 天几乎没人访问会被暂停（数据不会丢，去后台点 Resume 就能恢复）。
你们天天用的话不会触发；想保险的话：

GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，添加两个：

- `SUPABASE_URL`（和 config.js 里一样）
- `SUPABASE_KEY`（和 config.js 里一样）

之后 `.github/workflows/keepalive.yml` 每两天会自动去敲一下门。可以在仓库的 **Actions** 页面手动点一次 **Run workflow** 试试。

---

## 邮件提醒（可选，大约 10 分钟）

开启后：**提交点单**、**完成一个里程碑**，都会自动发一封邮件（同一个里程碑来回点，1 小时内只发一次）。
需要先开好云端模式。

**原理**：网页本身不能安全地发邮件（发信的密码放进公开网页谁都能看到），所以换成：
数据库发现有新点单 / 新完成的里程碑 → 通知一个放在你 Google 账号里的小脚本 → 它用你的 Gmail 发信。
所有口令都只存在 Supabase 和 Google 里，**不在这个公开仓库里**。免费，普通 Gmail 每天大约能发 100 封，完全够用。

#### 第 1 步：Google 这边（发信的小脚本）

1. 打开 [script.google.com](https://script.google.com)，用你的 Gmail 登录 → **新建项目**，左上角改个名字（比如「小站提醒」）
2. 把本项目 `supabase/apps-script.gs` 的内容整段复制，替换掉编辑器里原有的代码，`Cmd+S` 保存
3. 顶部函数下拉框选 `sendTest` → 点 **运行** → 按提示授权（会提示「Google 未验证此应用」，点 **高级 → 转至…（不安全）**，这是你自己写的脚本，没关系）。
   收到一封「[测试] 我们点菜啦」就说明发信没问题
4. 右上角 **部署 → 新建部署** → 左边齿轮选 **Web 应用**：
   - 执行身份：**我**
   - 谁可以访问：**任何人**（必须选这个，数据库才能叫到它；没有口令它什么也不会做）
   - 点 **部署**，复制那个以 `/exec` 结尾的网址

#### 第 2 步：Supabase 这边（触发器）

1. Supabase 后台 → **SQL Editor** → **New query**，把 `supabase/notify.sql` 整个粘贴进去
2. **在 SQL Editor 里**把最底部的 `'在这里填Apps Script网址'` 换成刚才复制的网址（别改进仓库里的文件再 push），点 **Run**
3. 结果区会显示一串口令，复制它

#### 第 3 步：把口令交给 Google 那边

回到 Apps Script → 左边齿轮 **项目设置** → 最下面 **脚本属性** → **添加脚本属性**：

| 属性 | 值 |
| --- | --- |
| `TOKEN` | 刚才复制的那串口令（必填） |
| `TO` | 收件人，比如 `a@gmail.com,b@qq.com`（选填，不填就只发给你自己） |

保存。

#### 第 4 步：试一下

Supabase SQL Editor 里运行：

```sql
select hq_notify_test();
```

几秒后收到「✅ 邮件提醒接通啦」就大功告成。之后在网站上点一次菜试试。

#### 以后

- **暂时关掉**：SQL Editor 运行 `update hq_notify set enabled = false;`（打开就是 `true`）
- **换收件人**：改 Apps Script 的脚本属性 `TO`，不用重新部署
- **改了 Apps Script 的代码**：要 **部署 → 管理部署 → 编辑（铅笔）→ 版本选「新版本」→ 部署**，网址不变
- **收不到**：
  1. 先看垃圾箱
  2. Apps Script 左边 **执行**（▶︎≡ 图标）：有记录说明数据库叫到它了，点开看日志；「口令不对」= 脚本属性 `TOKEN` 没填对
  3. 没有任何执行记录：SQL Editor 运行 `select * from hq_notify;` 看网址对不对，
     再运行 `select status_code, error_msg from net._http_response order by created desc limit 5;`（状态码 302 是正常的）

---

## 各页面怎么用

### 首页

和之前一样。倒计时的日期、名字、文案都在 `config.js` 顶部。

### 里程碑

- 点左边的小圆圈 = 完成。会炸彩纸、解锁一张像素贴纸，攒够数量升级（Lv.0「刚刚出发」→ Lv.8「白头偕老」）
- 点标题或 ⋯ 可以编辑日期、备注，或者删除
- 进度条和时间线的彩色段都会跟着往前推
- 「贴纸收集册」里能看到一共 12 张，已解锁的会显示名字
- 等级门槛和名字在 `js/blocks/milestones.js` 顶部的 `LEVELS`

### 点菜

- **今天吃什么**：点骰子随机抽一道（选了分类就只在那个分类里抽）
- **菜单**：点菜名加进点单；「编辑」模式下点菜名可以改名、换分类、删除
- **去下单**，两种方式：
  - 💬 **发到聊天里**：把点的菜整理成一段话，弹出手机的分享面板直接发微信 / iMessage（电脑上会复制到剪贴板）
  - ✓ **提交点单**：出现在「我们的点单」里，两个人打开网站都能看到，一步步点「接单 → 在做 → 开饭」
- 点单右上角 ⋯：重新发消息 / 再点一次同样的 / 删除

里程碑和点菜都不区分是谁做的 —— 两个人就是一体。

---

## 添加到手机主屏幕

用手机浏览器打开网站 → 分享 → **添加到主屏幕**。之后从桌面图标打开会全屏显示，底部导航用起来就像一个 App。

---

## 以后加新页面

1. 在 `js/blocks/` 里新建一个文件，照着 `placeholder.js` 的样子写 `mount(root)`
2. 在 `js/router.js` 的 `TABS` 里加一行（或者把 `约会 / 回忆 / 小游戏` 的 `placeholder.js` 换成新文件）
3. 在 `index.html` 的 `importmap` 里加上新文件（照着已有的格式抄一行）
4. 需要存数据的话，直接用 `store.list("新的kind")` / `store.save("新的kind", 数据)`，**数据库不用改**

---

## 关于公开

GitHub Pages 的网站是公开可访问的（加了 noindex，搜索引擎不会收录，但知道网址的人能打开首页）。
里程碑、点单这些私人内容在云端模式下需要暗号才能看到。以后做「回忆」放照片时，也会放在暗号后面。
