# 时间长河 · River of Time

中国编年史与世界编年史的双线对照时间轴，另有一条空间轴：492 个古今地名、4312 条事件落点、
6 条人物行迹、3 幅「山河大势」示意组成的舆图视图。**零构建、零依赖、零服务器**：数据以 `.js`
分片形式随页面加载，因此直接双击 `index.html`（`file://`）即可完整使用。

## 写给对历史感兴趣的人

这个站的出发点只有一个问题：**我出生那年，全世界在发生什么。**

所以它坚持三条做法：

1. **双线并置。** 中国轨与世界轨共用一条时间轴，同框显示。翻到 1260 年，中国轨是「世祖尊八思巴为
   国师」（《元史·释老传》），世界轨是同年五月忽必烈在上都开平即汗位、阿里不哥在和林另立——站内
   把这两条明确连成一条对照边，并在台账里写清为什么算同一次即位的前后件；往前四年，世界轨还有一条
   「旭烈汶破木剌夷诸山堡」。不是两条各讲各的历史，是同一时代的两面。
   「同年对照」「叠加对照」「分栏对照」都是为这件事服务的入口。
2. **把可信度摊开，而不是装成客观。** 每条记录都带溯源等级：`已核`（逐字对过原书页面）／
   `可定位`（能找到卷章但没逐字比）／`仅书名`／`无出处`。顶栏可以按等级筛「只看查得到的那些」，
   画布下方的图例列出各等级的含义。纠错也不经任何人认证：任何人可以直接补出处、报核对。
3. **区分「史料说了什么」和「本站的连接」。** 策展的成就与观点全部关在视角层里，且由门禁逐条
   校验：主张必须逐字出现在被引条目的正文中；用了「最早／第一／唯一」就必须交代判据和跟谁比。
   「涟漪」模块的每一条边都标明是「有出处」还是「本站的连接」——邻近不是因果。

数据之外还有一条空间轴：地名可以点进「地点页」，看一座城从传说时代到本站落点的完整履历；
六个人（张骞、苏武、霍去病、玄奘、杜甫、苏轼）的行迹直接挂在语料条目上；舆图的水系随年代出现或
消失——「黄河故道」这一段在图上 `1128` 年出现、`1855` 年消失，改道是一条会动的线。同一地点、同一
人物在不同时代展现的内容不同，这是本站想做的「在时间长河里流动」的多维世界。

它不是一个需要联网、注册或装东西的产品：下载仓库，双击 `index.html` 就能用。史实有错，欢迎提交
——`CONTRIBUTING.md` 写了怎么核、核到什么程度算过关。

## 打开

双击 `index.html`，或在浏览器里 `文件 → 打开` 选择它。无需 npm install，无需本地服务器。

开场屏不自动退场：停留到引言读完（默认 3.2s，`prefers-reduced-motion` 下 1.2s）后整屏即为入口——
点任意处、或让「进入长河」按钮取得焦点后按回车，才进入时间轴。数据加载失败另走报错屏（点击重载），
两条出口互斥。题记在《论语》出处之后收在本站自己的一句上（原文见下文「投稿」一节，两处同一句）。

> 为什么不用 `fetch()` 读 JSON：`file://` 下每个文件都是独立 origin，`fetch`、ES module
> 与 Web Worker 都会被 CORS 拦掉。所以数据集写成
> `window.__CHRONICLE_CHUNK["cn-01"] = [...]`，由 `js/loader.js` 动态注入 `<script>`
> 按需加载。这一约束是硬性的，改动前先确认仍在 `file://` 下自测过。

## 能做什么

| 能力 | 入口 |
| --- | --- |
| 双线叠加对照 / 分栏对照 | 顶栏「叠加对照」「分栏对照」 |
| 缩放 前3000 ↔ 2026，五档层级自动切换 | 滚轮（以鼠标下的年份为锚点）、`+`/`-`、顶栏缩放滑杆 |
| 文字标注开关（密集视图下可全部隐去） | 顶栏「文字标签」 |
| 悬停某一年/某一格 → 当年大事 | 鼠标悬停，气泡内含维度分布与折叠条目 |
| 点击事件 → 详情（背景/经过/影响/人物/出处/同年世界） | 点击标记 |
| 十维筛选与配色（形状二次编码，色盲可用） | 维度胶囊；点某个维度可 solo |
| 全文检索 + 语法 | `⌘K` / `Ctrl+K` / `/` |
| 时间区间全局筛选（手写年份 + 预设） | 顶栏「区间」两输入框与「预设…」下拉 |
| 把检索词 / 主题线 / 当前筛选铺成可通读的长河 | 顶栏「长河视图」、`R`、检索面板「铺成长河」（`Shift+Enter`）、主题线浮窗按钮 |
| **舆图**：海岸线底图 + 该年事件落针（中国／世界同框），水系随年代出现或消失 | 顶栏「舆图」、`M`、`#/atlas?year=&place=&journey=` |
| **地点页**：一座城从传说时代到今天的本库落点，带溯源构成 | `#/place/<key>`（详情与地图上的地名都可点） |
| **人物行迹**：张骞 / 苏武 / 霍去病 / 玄奘 / 杜甫 / 苏轼，站点挂语料条目或自带出处 | `#/person/<key>`、舆图「行迹」模式 |
| **山河大势**：三个年份的势力范围示意 + 进退箭头 + 上一阶段虚线残影 | 舆图「大势」模式（`data/geo/snapshots.js`） |
| **舆图寻址挑战**：给年代与线索，在底图上落针，按大圆距离计分授衔 | 舆图右下「寻址挑战」 |
| 主题时间线（一条线索串起跨年代事件） | 「选择主题时间线」下拉 |
| 同年对照弹窗（中国 vs 世界同年并排） | 顶栏「同年对照」、详情内对照块 |
| **此后三格**：三年后／三十年后／这些人后来——全部按年序与人物名现算，不读 `related` | 详情底部；「三十年后」从窗口远端收，所以它真是几十年后 |
| 年份档案（点空白处） | 点击画布空白 |
| 画布上的水流层：河面亮度随该段史实密度涨落，附波光与偶发流星 | 无需操作（深墨底为光、宣纸底为墨；叠加模式上朱砂／中脊金／下石青） |
| 看点：本站策展的成就条目，附逐字原文引证、对照与争议 | 顶栏「看点」、`G`、`topics/highlights.html` |
| **此事的小故事**：锚在真条目上的复述与原文，性质四选一（史载／笔记异闻／后世附会／出土文献与档案）以线型区分 | 顶栏「故事」、`S`、`#/story`、详情底部「此事的小故事」 |
| **涟漪**：大事的余波落在后来的小事上；每一边标明「有出处」还是「本站的连接」，邻近不是因果 | 顶栏「涟漪」、`B`、`#/chain/<id>`、详情底部「此事牵出的涟漪」 |
| **历史上的今天**：只列条目正文里已写明某月某日的那些事；`出处纪日` 单独标出，空着的天照实说空 | 顶栏「今天」、`T`、`#/today/<月>/<日>` |
| 每条记录的溯源等级（已核／可定位／仅书名／无出处） | 详情、气泡、长河与对照处的 `pv` 标签；图例「溯源」行在画布下方 |
| 按溯源等级过滤（只看查得到的那些） | 顶栏「溯源」下拉 |
| 补出处、报核对、添新条目（不需要账号，也不经任何人认证） | 顶栏「纠错投稿」；详情底部「补充出处」「我核过这条」 |

检索语法：`1368-1644` 年代区间、`前636` 公元前后、`!cn` / `!world` **只看**该轨
（不是排除）、`#science` 限定维度、`@person` 限定关键人物。

舆图接受零坐标深链：`#/atlas?year=-100&place=beikal`、`#/place/xian?year=741`、
`#/person/suwu`——`place` 写中文古称、别名、今名或行迹 key 都行，坐标由本站地名表解析，
调用方不需要也不应该自己猜经纬度。给搜索引擎看的静态页在 `topics/`（由
`node tools/gen-topics.mjs` 现算，见「数据维护」第 12 步）。

快捷键见画布下方「帮助」。视图、模式、筛选偏好存 localStorage；URL hash 携带当前视窗，
可直接分享定位。`prefers-reduced-motion` 下自动关闭惯性动画。

## 本站有编辑立场，但立场只在一层

时间长河不是价值中立的百科全书：它决定先看什么、把什么并置、把哪些成就放在显眼处。
这条立场**全部写在视角层** `data/frame/highlights.js`（顶栏「看点」/ `G`），
并且由 `tools/validate-frame.mjs` 逐条校验：

- 每条主张的 `ground` 必须**逐字**出现在被引条目的正文里——立场只能复述史料说过的话；
- 用了「最早／第一／领先／之最／唯一／最大」就必须给出判据（拿什么算）与范围（跟谁比）；
- 强度不是「确证」的必须写出争议与反例；
- 被用来立论的条目，溯源必须 ≥「可定位」；只写着书名的材料不许当成就的证据；
- 对照侧必须挂真实条目，标「同期」的年差不得超过 160 年。

事实层（`data/{cn,wd}`）不因此改动一个字：不加评价词、不调权重、不删灾荒与败绩。
**只留好消息的时间轴，读者查到第一条被隐去的事时，被怀疑的是全部条目。**

## 谁的话可信：溯源四级

正史与随手添加混在一张时间轴上时，读者需要的不是「谁认证过」，而是**我能查到哪一步**。
所以等级不写进数据、不由任何人盖章，而是每条现算（`js/prov.js` 是唯一派生处，界面、
筛选、图例都读它）：

| 等级 | 判据（`tierOf` 的实际口径） |
| --- | --- |
| 已核 | 有至少一条合式的核对记录：`checks[i]` 写明 `by`（谁、**核的是哪一处**）与 `at`（`YYYY-MM-DD`）。`by` 里给不出位置（篇目／卷册／节页／著录编号／链接）就报 `CHECK_BY_LOCATOR`——「某某核过」抬不起这一档；日期不算位置，「何时」归 `at`。只有记录没有出处时 `validate` 另报 `CHECK_WITHOUT_SOURCE` |
| 可定位 | 无核对记录，但 `sources` 里出现了能直接翻到的位置：篇目／卷册／节页／年月日／著录编号（《甲骨文合集》6412、《历史》1.96、《文物》1975年第11期）／链接（ISBN、URL 算链接）。年跨度不算（《申报》1912—1913年 只是出版年），光给年或光给期也不算 |
| 仅书名 | 有 `sources`，但一条定位线索都没有——写得出书名，翻不到内容 |
| 无出处 | `sources` 为空。当作线索看，不要当作依据用 |

四档按「读者能不能自己查证」排序，不代表真假；顶栏「溯源」下拉据此过滤。
「能不能自己查证」这把尺子在仓里有三份副本（`js/prov.js` 的 `KINDS`、`tools/validate.mjs` 的
`CHECK_BY_LOC_RE`、`tools/validate-story.mjs` 的 `LOCATORS`）——浏览器文件不能 import 工具，
工具不能 require 浏览器，所以不做「统一到一个模块」的假动作，而是逐串对账：
`test-units` 管前两份、`test-story` 管第一与第三份，`test-gates-meta` 再给每一份、每一支都配上能真红的哨兵，证明对账不是死代码（条数由它自己打印）。
等级也没有手写通道：条目顶层一旦出现 `tier` / `prov` / `provenance` / `verified` /
`certified` / `confidence` / `badge` / `sourceTier` 任一字段名，`validate --strict` 按
ERROR 计（`TIER_FIELDS` 门）——写进去就等于绕开派生器自封等级。

## 投稿：三个入口，一条通道，零后端

不需要账号、不经过认证，因为本站没有服务器。三个入口：详情底部「补充出处」「我核过这条」
（针对既有条目），顶栏「纠错投稿」（新增条目）。表单内容一律过 `buildRecord` 的字段白名单，
产出 `chronicle-contribution/1` 记录。

**第一版的写入通道只有一条：GitHub issue。** 落点是仓库里的
`.github/ISSUE_TEMPLATE/chronicle-contribution.md`；站内表单生成的三条出口里，只有
「在 GitHub 上开一个 issue」会把记录送到维护者手上，「复制 JSON」与「下载 .json」
只是转手介质——它们本身不进任何系统。仓库未登记时提示语如实说明通道尚未接上，
而不是留一个点不动的按钮。链接带的标签取 `js/contribute.js` 里的 `LABEL` 常量，
模板头里的 `labels:` 与它由 `tools/test-units.mjs` 对账（两处各写一遍字面量，早晚会不同源）。
URL 超过 7800 字符就不画 issue 按钮——半截被截的正文比没有按钮更坏。

**我们都是历史的见证者，我们都是历史的创造者。** 这句在站内出现两次：开场屏的题记收束行
（引言之后）与投稿弹窗的页脚。两处分别是「读这条河的入口」与「往里添水的入口」，缺一个都只剩半边话。
它与「溯源四级」是同一件事的两面——等级只标「可核到什么程度」，不给人分级。
两处各有一条断言钉着：页脚那句不许在阶段重画时被连字带节点清掉，题记那句不许掉出字色测量清单。

防线：蜜罐字段 `fax`（放视口外而非 `display:none`，每次开表清空）、本地限流
（10 分钟 5 条／每日 20 条，判据是纯函数 `rlJudge`，时钟回拨的戳记不计）、
`checkRecord` 拒绝越界年份／公元 0 年／未知轨道维度／过短标题与摘要。
**核对记录是唯一能把等级往上抬的输入**，而它能抬是因为它写了「谁、何时、查的哪一处」，
不是因为投稿人声称自己核过。

本仓库 `index.html` 里那一行已填成发布用的仓库（必须排在 `js/contribute.js` 之前，该模块加载时读一次）：

```html
<script>window.__CHRONICLE_CONTRIB_REPO = "lv31415926/chronicle";</script>
```

fork 或镜像站**必须改成自己那份 `owner/name`**——留着别人的地址，投稿就会落进别人的 issue 列表；
改成不存在的地址则按钮是活的、通道是死的。留空是第三种合法状态：少一条出口，但界面会如实说明。

## 上线为公开站点

零构建 ⇒ 任何静态托管都够，不需要服务器也不需要数据库。**备案则取决于接入地**：解析到境外
（下面的 1–5 步，以 GitHub Pages 为例）不需要 ICP 备案；解析到境内必须备案，见
「境内接入（方案 B）」。两条路线之间，本站的代码一行都不用改。

1. 在 GitHub 上建一个公开仓库（站点是历史数据，建议 Public）。**仓库名要与
   `index.html` 里 `__CHRONICLE_CONTRIB_REPO` 已填的那份对上**（本仓库填的是
   `lv31415926/chronicle`），对不上就照第 4 步改那一行——否则「开 issue」指向一个不存在的仓库。
2. 本地推送。提交前先跑 `node tools/predeploy.mjs`（工作树与 clone 视图各验一遍）。
   **本机没有配置 git 身份，也不要为一次提交去写全局 config**——一次性注入即可，作者信息照常落进提交：

   ```
   git -c user.name="<你的名字>" -c user.email="<你的邮箱>" commit -m "时间长河 v1"
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```

   仓库已 `git init` 且文件已全部暂存时，就只差这三条；从零开始才需要先 `git add`。
3. 仓库 `Settings → Pages → Build and deployment`：Source 选 `Deploy from a branch`，
   Branch 选 `main` / `/ (root)`，保存。约一分钟后得到
   `https://<owner>.github.io/<repo>/`，那就是本站——双击可用与线上可用是同一份文件。
   仓库根里的 `.nojekyll` 让 Pages 跳过默认的 Jekyll 构建：零构建站不该在本地文件和线上内容
   之间再夹一道第三方构建，那样「同一份文件」这句话就没人验证得了。
4. 投稿出口：**这一步只在仓库名与那一行不符时才做**——把
   `__CHRONICLE_CONTRIB_REPO` 改成实际的 `<owner>/<repo>` 再推一次即可；不改也不影响浏览，
   投稿走复制／下载两条出口。
   这一行**刻意不从 `location.pathname` 猜**：Pages 的路径形状确实是 `/<owner>/<repo>/`，
   但同一份文件还要在 `file://`、任何镜像站与不同宿主根路径下跑；猜错一次的后果是
   「开 issue」把投稿带进一个不存在的仓库——按钮是活的、通道是死的，比没有按钮更坏。
5. 自定义域名（后置，不影响先上线）。按 GitHub 文档的机制，**只需在
   `Settings → Pages → Custom domain` 填一次**，GitHub 会在你的分支里生成 `CNAME` 文件；
   然后到域名商加解析：裸域用 A 记录 `185.199.108.153 / .109 / .110 / .111`，
   `www` 子域用 CNAME 指向 `<owner>.github.io`。`Enforce HTTPS` 等解析生效后再勾（证书由 Pages 签发）。
   两点法规口径：解析到 Pages 属境外接入，**不需要 ICP 备案**；但境内注册商（万网/DNSPod）
   的域名必须先过实名认证才解析——实名未通过时域名处于 `clientHold`，通过后约 1~2 个工作日解锁。

### 境内接入（方案 B）

想让自己的域名在境内稳定可达，就得把解析指到境内接入的静态托管（阿里云 OSS 静态网站托管、
腾讯云 COS 静态网站托管 + CDN 都够），而境内接入的前置条件是 **ICP 备案**。手续按这个顺序，
倒过来必然被退回：

1. **选后缀**。只有工信部已批复的后缀能备案：`.com` / `.cn` / `.net` 可以，**`.org` 不可以**
   （批复清单里没有它，选了它就等于选了一条走不通的路）。注册商也要在批复之列——境外廉价
   注册商买的名字备不了案。域名**剩余有效期须大于 45 天**才可提交备案。
2. **注册并做实名认证**（两件事，别合成一步理解）。实名要填的三个字段——持有人名称、
   证件类型、证件号码——**就是第 5 步备案表上要抄的三个字段**，所以此刻怎么写，往后就怎么抄。
   注册与付款只能本人做：备案主体、域名实名持有人、托管账号持有人**必须是同一个主体**，
   这是审核口径而不是流程建议。
3. **等同步**。实名通过后约 1~2 个工作日解除 `clientHold`，实名信息同步到工信部另需 2~3 天。
   没同步完就交备案会退回，所以这一格等待省不掉。
4. **买境内托管，取备案授权**。备案表要填接入服务商与它的 IP 资源，因此托管必须先买——
   在托管商的备案控制台领取备案服务号/授权码。
5. **提交备案**。在托管商备案系统填主体与网站信息 → 上传证件并做人脸/短信核验 →
   托管商初审（期间可能电话核实）→ 通管局终审 → 下发备案号。整体 1~20 个工作日。
   网站性质按本站的真实形状填：**纯静态、无用户注册、公众提交不在站内渲染**（见 `js/contribute.js`：
   投稿只生成一条外部 issue 链接）。这条不只是技术限制——零构建站本来就没有可写后端，
   而它恰好也是备案口径上的资产：一旦改成"站内直接展示公众投稿"，服务性质就从静态展示
   滑向交互式服务，要另走前置审批。**要不要开这一格，是合规决定，不是前端决定。**
6. **绑定与展示**。在托管商控制台把域名绑到静态托管并开启 HTTPS（免费 DV 证书需在域名
   已解析后才能签发），CDN 回源到托管；备案号挂在页脚并链到 `beian.miit.gov.cn`——
   这是展示义务，漏挂会被要求整改。**这是 B 相对 A 唯一一处要改 `index.html` 的地方**，
   而且挂法已经留在文件里：页脚注释中有一行可原样粘贴的
   `<a class="beian" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">…</a>`，
   把示例编号换成工信部下发的那个即可。别挂空壳——备案号是法定标识，写错或留空壳比不挂更糟，
   所以 `tools/test-units.mjs` 核对它的形状、链接、`target`、`rel` 与「最多一处」，
   `.beian` 的字色也被那道逐主题量对比度的门盯着（状态条正文走 `--ink-faint`，法定标识不能跟着灰）。
   本站当前解析到境外，真件走「0 处」分支——这不是漏挂，是另一种合规状态。
7. **发布方式变了**。A 路线 `git push` 即上线；B 路线没有 CI 会自动同步，每次改动都要把整个
   目录再传一遍（控制台拖，或 `ossutil cp -r` / `coscmd upload -r`）。这是长期成本，不是初始成本，
   所以先 A 后 B、A B 并存（备案下来时只换解析并补一行页脚备案号）通常比直接上 B 划算。

换宿主不动代码这件事不是推断，是门保证的：`tools/e2e-static.mjs` 的 `ABS_PATH` 判据禁止任何
根绝对路径的资源引用——它同时是 `file://` 双击可用与"子目录/根目录都能跑"的前置条件。

零后端做不到的事，也别假装做得到：**投稿不会自己出现在站上**。浏览器在 `file://`
下连 `fetch` 都不允许（`tools/e2e-static.mjs` 的 `FILE_URL_BREAK` 门就是为此存在），
所以读取仓库内容必须由一次重新生成来完成——把 issue 里的 JSON 记录人工并档进
`data/{cn,wd}/*.js`，跑一遍必跑清单，再推送。并档时署名写进 `checks[].by`，且要写清核的是
哪一处（人核：`张三（翻中华书局点校本《资治通鉴》卷二百一十二）`；本站工具比对：
`本站·维基文库比对（史记/卷001 三家注版）`），等级才会从「可定位／仅书名」升到「已核」。

## 目录

```
index.html          单页外壳（工具栏、图例、面板容器）
CONTRIBUTING.md     贡献者须知：三种贡献、五条准入硬规则、投稿之后的三道闸、署名与撤回
                    （文中每处条目 id 都被 doc-cite 与语料对账，写错权重或引用已删条目即判红）
.github/            ISSUE_TEMPLATE/chronicle-contribution.md：第一版唯一写入通道的落点
                    （模板头 labels 与 js/contribute.js 的 LABEL 由 test-units 对账）
                    workflows/gates.yml：PR 上跑与本地同一整套门（门清单由 test-units 与
                    predeploy 的 GATES 做 1:1 对账，CI 少跑一道即判红）。**它不部署、也不自动
                    并档投稿**——CI 里没有凭据（这条也是判据，不是注释），而「裁定」必须是人的动作
css/                深墨 + 朱砂石青的纸质编年史配色（atlas.css 是舆图、地点页与寻址挑战）
js/
  app.js            启动与装配
  state.js          全局状态 / 筛选 / localStorage 持久化
  loader.js         分片按需注入 + 事件仓库 + 索引
  time.js           无公元 0 的年表换算、政权（polity）查找
  axis.js           视口坐标映射、刻度布局、时代带分段、minimap 密度
  lod.js            五档层级（时代/半世纪/十年/单年折叠/单年全量）与聚合
  timeline.js       Canvas 主视图（含标注两遍避让）
  interaction.js    滚轮/拖拽/悬停/点击/触摸
  popover.js  detail.js  compare.js  themes.js  search.js  router.js
  river.js          全屏「长河」梳理视图（分节/目录/排序）
  flow.js           画布水流层（河面密度、波光、流星尾迹）
  prov.js           溯源四级的唯一派生器：等级从 sources/checks 现算，数据与投稿都写不出等级
  contribute.js     投稿表单与出口：零后端可送达的记录（issue 链接 / 复制 / 下载），白名单挡住一切自封字段
  shapes.js   palette.js
  frame.js        视角层界面：看点抽屉（主张、逐字原文、对照、争议同屏；立场只在这里）
  story.js        故事层界面：小故事抽屉与详情里的「此事的小故事」——
                  复述与引文的排版必须一眼可分，因为把复述排得像引文就是把本站的话当史料
  chain.js        涟漪层界面：因果链抽屉与详情里的「此事牵出的涟漪」，
                  每一边照 basis 分成「有出处」与「本站的连接」，两者排版同级（B 键打开）
  geo.js          地理层数据访问：按需注入 data/geo/*（沿用 loader 的看门狗纪律）
  atlas.js        舆图视图：SVG 墨卡托、单层相机变换、落针/行迹/大势三模式、深链与 embed
  atlas-quiz.js   舆图寻址挑战：题源只有本站已地理化且带出处的条目
  places.js       地点页与人物行迹页（列表复用 detail/river 的排法，不另起一套卡片）
  today.js        「历史上的今天」抽屉：只摊开 data/dates.js 里已有纪日的条目，
                  本页一个日期都不生产（四层 how 必须区别标示，空着的日子照实说空）。
                  地址里写了日历上没有的日子（#/today/4/31、#/today/13/1）时当面说这个日子
                  不存在、落回读者的今天；存在与否只问盘上的 mdays，本页不抄第二份历表
data/
  meta.js           年代范围、轨道、十维、时代带、主题元数据
  reign.js  themes.js  manifest.js
  dates.js          「日」层（生成物，别手改）：{id,m,d,how} 全部由 tools/date-lib.mjs 从
                    该条自己的文本现算，改一个字 DATES_DERIVE 就判红。
                    头部的 prolepticBefore / ambiguousCount / blankDays / mdays 同为派生账
                    （界面只读不数：空天数自己数会虚报，历表自己抄就有第二份）
  cn/cn-0X.js       中国编年史分片    wd/wd-0X.js  世界编年史分片
  frame/highlights.js 视角层：本站的编辑立场（看点 + 比较主张 + 对照 + 争议）
  geo/
    places.js       492 条古今地名（由 tools/geo-places.tbl 生成）：keys 命中词、坐标、识别参考出处
    event-places.js 事件地理叠加层（生成物）：条目 id -> {p: placeKey, d: 方位}
    journeys.js     6 条人物行迹（作者策展）：每站必须挂条目 id 或自带 src 出处
    basemap.js      底图（生成物）：Natural Earth 公有领域陆界 + 自绘水系，不含现代国界
    snapshots.js    三幅「山河大势」示意：势力范围墨面 + 进退箭头 + 依据条目
  story/
    manifest.js     九片分片的登记表（界面按它注入；漏登记的分片永远加载不到，STORY_MANIFEST 判红）
    preqin/han/liuchao/suitang/songyuan/ming/qing/modern/world .js
                    小故事（条数以 node tools/validate-story.mjs 的读数为准，不在文档里抄一份）：
                    每条锚在一条真条目上，kind 四选一（史载/笔记异闻/后世附会/出土文献与档案），
                    标「原文」必须给到能翻的位置，只写「大意」的绝不自称原文。
                    这一层走独立全局 __CHRONICLE_STORY_CHUNK，事实层的 loadCorpus 读不到它，
                    所以加故事不会抬语料条数、也不会动权重与成就线的任何一条基线。
  chain/
    manifest.js     涟漪层的登记表（界面按它注入；漏登记的分片永远加载不到，CHAIN_MANIFEST 判红）
    ancient.js  earlymodern.js
                    因果链（条数以 node tools/validate-chain.mjs 的读数为准，不在文档里抄一份）：
                    每环挂一条真条目，每边写明「有出处」还是「本站的连接」，落点必须是小事。
                    与故事层同一份独立全局纪律（__CHRONICLE_CHAIN_CHUNK），事实层读不到它，
                    所以编一条涟漪不会抬语料条数、也不会动任何一条基线。
tools/
  DATA_SCHEMA.md    数据契约（作者必读）
  validate.mjs      数据门（硬性错误必须为 0）
                    散文里的内联引用也在门里：正文「（见 cn--xxxx）」指向不存在的 id 报
                    XREF_DANGLING，「明年／后 N 年 +（见 id）」的年差算不回来报 REL_YEAR
                    （带括号与裸写两种都算，见 DATA_SCHEMA §5）
  validate-frame.mjs 视角层门：主张的 ground 必须逐字命中条目原文（反造神主判据）、
                             极限词必须有判据与范围、非确证必须写争议、
                             仅书名材料不得立成就论、对照标「同期」年差 ≤160
  test-frame.mjs     上一道门的可红性自审（含「记载→记录」一字之差与张冠李戴用例）
  validate-achv.mjs 成就线门：九条成就线仍在且成员/高光锚点未塌（ACHV_LINE/ACHV_GAP）、
                     成就维 w≥4 里「出处只到书名」的条数只许降不许升（ACHV_PROV_RATCHET，棘轮）、
                     评价词不得漏进事实层的五个叙述字段（ACHV_STANCE，引号对内豁免）
  test-achv.mjs      上一道门的可红性自审：四个码各被定向打红一次，
                     另钉三条「不该红」的边界（引号内的原文评价词、名词性字段里的专名、
                     非成就线塌方）——棘轮只能在 200 条量级的夹具上测，故备两套语料
  validate-story.mjs 故事层门：十三码。锚点必须真在语料里且自己带出处（STORY_ANCHOR/_PROV）、
                     多存一份 year/dynasty 即红（STORY_SCHEMA）、kind 四选一（STORY_KIND）、
                     标 verbatim 却给不出可定位出处即红（STORY_PROV）、大意冒充原文的红（STORY_QUOTE）、
                     笔记异闻/后世附会缺 caveat、出土档案缺 find（STORY_CAVEAT/_FIND）、
                     评价词漏进复述（STORY_STANCE）、极值语没写凭什么（STORY_SUPERLATIVE）、
                     分片缩水（STORY_COVERAGE）、全层 90% 以上标「史载」判红——
                     那等于本层没做过任何史料学判断
  test-story.mjs     上一道门的可红性自审。九个生产形态夹具片（压在 COVERAGE 线之上做减法，
                     夹具若本来就小于下限，那满屏的「红」只证明夹具小、不证明门有效）：
                     每个码各被定向打红一次 + 豁免边界各判绿一次；
                     检查码清单从 validate-story 源码现取（注释登记与 bad() 实发两侧对账再比用例覆盖），
                     所以「加了码忘了写用例」会在这里露出来，而不是靠文档里一句写死的数字；
                     另有一节把 validate-story 的定位判据与 js/prov.js 的 KINDS 逐串对账——
                     两份副本不能 import 彼此，分叉的形态是「故事门说这条底本翻得到、界面徽章只给仅书名」
                     ⑱ 另管界面接线：模块与样式是否真挂上 index.html、路由/Esc/S 键/顶栏按钮四条入口、
                     抽屉与详情与投稿弹窗的 z 序、[hidden] 的 display 兜底，以及 .detail 里那条
                     「段落覆盖必须压得过 .detail .para p」的 CSS 权重账（名单从 story.js 的 <p class> 现取）
  validate-chain.mjs 涟漪层门：十七码。这一层在替历史编因果，所以判据全围着「不许把猜说成史书说的」：
                     每环必须真在语料里且自己带出处（CHAIN_ANCHOR/_PROV）、年份权重只由锚点派生（CHAIN_SCHEMA）、
                     环序严格递增且平均每环隔三年（CHAIN_ORDER/_SPAN）、落点必须是小事（CHAIN_SMALL，
                     否则这层就退化成另一份大事年表）、每边二选一（CHAIN_BASIS）、
                     标「有出处」所引材料名必须逐字在两端条目自己的 sources 里（CHAIN_PROV，凭空造书名即红）、
                     一条链不许全是本站推断（CHAIN_GROUNDED）、caveat 必须真在怀疑这条连接（CHAIN_CAVEAT）、
                     跨轨铺开（CHAIN_CROSS）、评价词只许在引号内（CHAIN_STANCE）、链数与复用度（CHAIN_COVERAGE）
  test-chain.mjs     上一道门的可红性自审：生产形态夹具（两片 × 六条，压在 COVERAGE 与 CROSS 两线之上），
                     十七码各被定向打红一次 + 豁免边界各判绿一次；检查码清单从 validate-chain 源码现取，
                     所以「加了码忘了用例」「注释里有而代码从不发」都会在这里露出来。
                     末组另管界面接线：模块与样式挂没挂上 index.html、路由/Esc/B 键/顶栏按钮四条入口、
                     各抽屉互相关闭的窗口、z 序、[hidden] 的 display 兜底、.detail 里 <p class="ch-*"> 的
                     权重账，以及「有出处」与「本站的连接」两种标识必须排版同级——淡下去的那一档，
                     读起来就成了「这句不算数」
  date-lib.mjs      「日」的唯一派生口径（候选器与门共用一份）：四层取数 text>process>src>text-cn，
                    只认与本条 year 同年的日子，同年两个日子判歧义整条不收，
                    1912 年前的中文月日一律不收（此前多为农历，本库不做历表换算）；
                    各月有几天这张表也只此一份（MDAYS / validMD / blankCells），
                    谁再自己写一遍 d<=31，就会把 4/31、6/31、9/31、11/31 数成「空着的一天」
  date-candidates.mjs 日层候选器与落盘器：只读报告（覆盖率/空格/歧义）/ --apply 写 data/dates.js（幂等）/
                    --ambig 列出歧义条目及其候选，交回写正文的人裁定——门不许替人挑一个日子
  validate-dates.mjs 日层门：八码。盘上与现算逐字对账（DATES_DERIVE）、该收没收（DATES_MISSING）、
                    条目已删而日层留着（DATES_ID）、形与月日越界（DATES_SCHEMA）、重复（DATES_DUP）、
                    口径版本与界面要读的 prolepticBefore / ambiguousCount / blankDays 漂移（DATES_RULE / DATES_DERIVE）、
                    文件缺失或求值失败（DATES_FILE）、日历格塌陷（DATES_COVERAGE）
  test-dates.mjs     上一道门的可红性自审（54 项）：日门对两侧都敏感，所以两侧都各打红一次——
                    改 data/dates.js 会红，改条目正文里那句纪日也会红，并且必须证明
                    「改完正文重跑 --apply 就能回绿」；夹具从当前日层运行时挑（硬编码 id 必腐），
                    前置条件构造不出来即判失败、不许静默 skip；另验 --json 回执在千条错误下仍可解析
                    （Node 把 error.stdout 截在 64 KB，截断的 JSON 会让「门坏了」的读数变成谎话），
                    以及 ⑧ 界面接线：模块与样式挂没挂上、脚本顺序、路由/Esc/T 键/顶栏按钮四条入口、
                    界面 HOW_LABEL 与门 HOWS 同源、历表分界与「空 N 天」只许读盘上的数字
                    （界面自己数格子会把 4/31 这类不存在的日子算进缺口）、[hidden] 的 display 兜底
  limits.mjs        title/summary 长度上限的唯一出处（validate / check / mcheck 共用同一份数值）
  e2e-static.mjs    零构建 / file:// 不变量门：资源存在性、外部引用、根绝对路径（/js/… 在 file:// 与
                    项目页子路径下都 404）、fetch|XHR|Worker|动态import|ES module
                    等破坏 file:// 的写法、脚本顺序与 window.Chron* 读取顺序的倒挂、css url()、manifest 声明缺失
  gen-manifest.mjs  重扫分片 → 生成 data/manifest.js
  test-units.mjs    纯函数与运行时单测（time/axis/lod/state/元数据/themes/flow/编码腐蚀判据，
                    并含 loader.js 失效路径：注入悬挂→超时、缺文件→失败、坏 manifest→不缓存、少片→failedChunks；
                    另含 compare.js 关联边门：逐年用真实语料重算，跨线边一条不许丢、双向落库不许排两行；
                    水层三层门：河面色标上朱砂/下石青/中脊金且由心向外单调、闪点须对各自底色量得出 ΔL≥60
                    （配了令牌≠看得见）、波光只在少数相位亮且随密度涨落、流星尾迹宽度不许混进落点统计；
                    启动闸门：全文件只许一处撤遮罩且那处在点击回调里、停留时长按 reduceMotion 分档且成带；
                    溯源四级：四档字色对每一层面板底色都量 AA（10px 小字 4.5:1）、未核档不得借用认证色、
                    投稿通道：三种记录都带不进去等级/权重/日期，年份与长度边界两侧各取反例、限流纯函数 15 例、
                    报错文案与判据同线、issue 唯一写入通道（模板头 name/about/labels 齐且标签与 LABEL 同源、
                    表单写入的每个 .contrib-* 节点都在弹窗骨架里）、
                    开场收束语（取不到即空串恒真那句先拦、必须落在题记之内、字色走令牌并进 AA 清单、
                    减动效下入场延迟一并归零；ICP 备案号：形状/链接/target/rel/最多一处五条判据各配
                    自审负例，另查注释里留着可粘贴的挂法与 .beian 字色走令牌；
                    CI 与本地门清单 1:1（两侧各配解析自审，少跑一门／点名下不存在的脚本／
                    工作流不带凭据／真的会在 main 与 PR 上触发）、
                    层的收起与打开：凡「用 hidden 收起、自己又声明了非 none display」的层都要带
                    [hidden]{display:none} 兜底（反向也查：写了兜底却没这层是空账），
                    异步到货才显形的面板必须在 hidden=false 前问一次「用户还要不要它开着」，
                    每条路由叫开的那一层 close() 都得把地址也收掉（路由名／模块归属一律从
                    router.js 的 parse() 与 apply() 现取，加一条路由不必改这份清单）；
                    css/js 的扫描域一律磁盘现取，孤儿样式表与没链接的模块同一条门判红
                    （项数以各脚本末行自报为准：抄一份进文档，下一次加用例就会有一处腐烂）
  test-gates.mjs    门禁可红性自审：给每个门注入一处定向变异，要求它变红并命中指定检查码
                    （项数以该脚本自己的 `N/N 通过` 为准，文档里抄一份就注定腐烂）——
                    一道永远不变红等于这道门不存在。开头三项考的是清理程序自己：
                    tools/tmp-sweep.mjs 的归属判据用三个探针目录现验两个相反方向
  tmp-sweep.mjs     变异现场回收的唯一判据（test-gates 与 test-gates-meta 共用）：副本目录里写
                    `.owner`=pid，回收前用 kill(pid,0) 问一句「还有人活着吗」——
                    EPERM 也算活着，只有 ESRCH 才判死。无此判据时两个并跑的门禁会话会互删对方
                    正在用的目录：一边 ENOTEMPTY 崩溃，另一边更坏，副本半途没了却仍打印通过
  test-gates-meta.mjs 再往上套一层：把门改哑，验对应自审器（test-gates / test-doc-cite /
                    test-related-candidates / test-units / **test-intake**）是否抓到并点名——
                    本轮为 intake 新加的 6 条变异各打在一个真实缺陷形态上：查重恒不命中、
                    白名单丢弃不上账、不再调站内合规判据、空清单不判红、定位判据恒空、往 data/ 写文件；
                    为 CI 对账新加的 4 条里前三条打在三处解析上（解析坏了「一处不少」会恒真），
                    第四条直接把工作流删掉一步——变异打在 .github 那侧，抓的就是被删的动作本身
  predeploy.mjs     发布面门：把工作树 `GATES` 全跑，再 `git checkout-index` 还原一份「别人 clone 到的样子」
                    跑其中的 `STAGING_GATES` 那一组（两份清单的数目不写在这里，由 test-gates-meta 与 CI 对账）
                    ——本地全绿而纯净目录变红，就是 .gitignore 挡掉了发布需要的文件；
                    另查没有疑似密钥、无未跟踪未忽略的漏网文件、无 5MB 巨块。
                    这三条扫的是**全部被跟踪文件**（`git ls-files`）而非本次暂存的改动——
                    首次提交之后 `diff --cached` 只剩刚 add 的那一个文件，拿它当发布面等于
                    在近零覆盖上判绿；因此还原视图的条数与该清单还有一道对账，两数不等即判红
  doc-cite.mjs      文档引用对账门：tools/DATA_SCHEMA.md、README.md、CONTRIBUTING.md 里每一处「id + wN」
                    必须与语料一致（id 存在、权重相等）；``` 围栏内是语法模板不核对，模板里的 id 一律写 …--pNN 占位
  test-doc-cite.mjs 上一道门的红性证明：不改门的代码、改输入（把 w5 写成 w3、引用不存在的 id、
                    删权重、把权重推出窗口、围栏内/外各塞假 id、抽走 README），逐条要求变红并点名
  intake.mjs        投稿分诊台（**只读，一条数据都不写**）：读 issue 正文/JSON 记录 → 白名单丢弃自封
                    字段（tier/verified/confidence/weight，丢弃一律上账）→ 复用 ChronContribute.checkRecord
                    判年份与长度口径 → 与全库语料查重（条数现量看 data/manifest.js） → 用 ChronProv.KINDS 判「补的出处能不能升级」
                    → 输出 pending / review / reject / unreadable 四堆待裁清单。--json 供脚本消费，
                    --strict 下有 reject 即 rc=1。判据零复制：重写一遍就有了两把尺子，迟早量出两个答案
  test-intake.mjs   分诊台的功能门（53 项）：夹具的年份/边界全部从 meta 与语料现推，不抄会腐坏的坐标；
                    查重召回用「把语料自身回喂」测（必须 100%，认不出=并档造出双条目），精确侧用
                    「同年且标题只少量共字」的真实对照对测（不许把另一件事拖进来，找不到对照对就报红
                    而不是静默通过）；空目录 / 缺 --from / 路径不存在三条都必须 rc=1；
                    跑完对 data/ 取指纹比对——「不写数据」是承诺，就得有机甲（53 项）
  weight-change.mjs 权重单字段变更 + 内置自审门：断言 diff 恰好等于授权集合、
                    其余字段逐字节不变；补丁必须带 §4 依据的 why，否则拒绝
  related-candidates.mjs 跨轨 related 候选生成器（只读）：±5 年窗内按共名/共标签/共地望/共词/同拉丁名打分，
                    低频信号才准入（DF_* 门 + strong 旗标）——编造关联是禁止项，故先出候选再逐边裁定
  related-cross.mjs 跨轨 related 补边的唯一授权写入口：只认 tools/related-cross.json 里的 accepted 集合，
                    断言改后只多出这些边、无任何边被删除、除 related 外每字段逐字节不变；默认 dry-run，--write 才落盘
  test-related-candidates.mjs 候选器的可红性自审：合成夹具（7 对应收 + 过泛/越窗/同轨等必不收的对照）
                    证明判别力，再用真实语料双向对账：「候选集 ⊆ 裁定集」（漏裁定与凭空裁定都算红）
                    ＋「盘上跨轨边 = accepted 集合」（有边无留痕的越权边、有留痕未落盘的裁定都算红——候选器看不见年窗外的边，这一头只能直接数盘）
  check.mjs         作者侧单分片自检
  shard-report.mjs  全分片体检：条数/跨度/50年桶疏密/体积，定位代理中断留下的空洞
  prov-stats.mjs    溯源四级现算（只读报告，不是门）：总量 + `--era` 按年代分段，指出「仅书名」
                    占比最高、读者最查不到的那一段；判据直接 load js/prov.js，零复制，
                    所以文档里再不许抄一份四级读数
  style-probe.mjs   跨分片文体漂移：文言标记率、「」率、白话虚词密度（多代理并行时用来对齐文风）
  style-samples.mjs 分片抽样打印 title/summary/背景句 —— style-probe 的正则是粗代理会误报，定性要看真句子
  rewrite-invariants.mjs 改写前后逐条比对：冻结 12 个事实字段，只放 title/summary/background/process/impact，
                    并校验长度契约与条数/id 集合不变 —— 批量改文体时防事实静默漂移
  repair-lines.mjs  修复增量追加时丢掉收尾 `}` 的单行事件
  fix-ids.mjs       给公元前 id 批量补 `b` 中缀（幂等）
  geo-lib.mjs       古今地名匹配的**唯一口径**（候选器/落盘器/校验器共用一份，不各写一遍）
  geo-candidates.mjs 地理覆盖候选器（只读）：覆盖率、最肥的未覆盖地名、命中最多的地点
  geo-apply.mjs     由「地名表 + 语料 detail.place」重算叠加层；默认 dry-run，--write 原子落盘
  validate-geo.mjs  地理层门：schema／命中词撞车／叠加层与表+语料是否同步／行迹与快照的出处／覆盖率地板
  test-geo.mjs      上一道门的可红性自审（34 项定向变异 + 真实语料正控制）
  gen-places.mjs    由 tools/geo-places.tbl 生成 data/geo/places.js（列数/坐标/kind/撞名当场报错）
  gen-basemap.mjs   解码 Natural Earth TopoJSON + RDP 简化 + 滤跨经线伪影 → data/geo/basemap.js
  gen-topics.mjs    由语料与地理层现算静态专题页（地点/时代/行迹）+ sitemap.xml
  geo-places.tbl    地名表源文件（8 列同构，改地名只动这里）
  geo-water.tbl     水系与湖泊表（含 appear/vanish，黄河夺淮与罗布泊随年代流转）
scripts/
  mcp-server.mjs    零依赖 MCP（stdio JSON-RPC 2.0）：6 个工具，返回一律带 sources 与溯源等级
topics/             静态专题页（生成物）+ topic.css；llms.txt 是给 Agent 的站点说明书
```

## 数据维护

1. 按 `tools/DATA_SCHEMA.md` 编辑 `data/{cn,wd}/*.js`。id 规则要点：**公元前年份必须带
   `b` 中缀**（`cn--b636--pNN`，NN 为该年该维度内的两位序号），否则 前1500 与 公元1500 会撞成同一 id。
2. `node tools/gen-manifest.mjs` — 重算分片清单（条数、年代范围、体积）。
3. `node tools/validate.mjs --strict` — 看 `=== ERRORS` 是否为 0。29 分片现已全部有内容，
   故 `--strict` 是默认口径（此时悬空 `related` 按错误计，不再是告警）。分片数以 `data/manifest.js`
   现量为准：`cn-17`（秦与西汉前期 前221–前141）与 `cn-18`（昭帝始元至东汉明帝 前86–59）都是 2026-11-07
   因 `cn-03` 撞 320KB 体积预算而拆出的新片，内容一条未删——越预算先拆片、不要删条目
   （见 `tools/DATA_SCHEMA.md` §1；拆分用 `node tools/split-shard.mjs <源分片> <切点年> <新chunkId>`，
   它自带条数守恒与「正文逐行零改动」两道自检，切点选在朝代更替处，两个警告带都会跟着重排，
   拆完必须回跑 `gen-manifest` → `geo-apply --write` → `validate --strict` 看有无新触线）。
   数据门之后紧接着跑成就线门：`node tools/validate-achv.mjs`。它不看单条字段契约，
   看的是**地基有没有退**——九条成就线还在不在、成员与高光锚点有没有塌、
   成就维 w≥4 的条目里「出处只到书名」的数量有没有越过棘轮基线、
   以及评价词有没有漏进事实层的叙述句里。删条目、改 `data/themes.js` 的关键词、
   抬权重这三类动作都会碰到它（详见 `tools/DATA_SCHEMA.md` §14）。
4. `node tools/test-units.mjs` — 改动 `js/time|axis|lod|state|themes|flow|loader|prov|contribute.js`、
   `js/detail.js`（详情「此后」三格的窗口表 `LATER_WINDOWS`、限量 `LATER_CAPS` 与远端取法都在这一层：
   窗口数字在测试里另写一份做交叉核对，改表必红——名额只有两三个，偷偷放宽常常挤不进结果，只看行为会漏）、
   `.github/ISSUE_TEMPLATE/`、`.github/workflows/gates.yml`（门清单在这里与 `predeploy` 的 `GATES` 对账）、
   投稿弹窗的骨架与 `.contrib*` 样式、开场题记（`index.html` 的 `#boot .epigraph`
   与 `css/layout.css` 的题记样式块）、状态条的备案号链接 `.beian`，或数据元信息后必跑。含加载器失效路径：
   注入悬挂/缺文件/坏 manifest 时，遮罩必须超时判失败而不是把整站冻死（`failedChunks()` 必须留账）。
5. `node tools/e2e-static.mjs` — 改 `js/` 或 `index.html` 的脚本顺序后必跑。零构建站的全部
   致命约束（无 fetch、无 ES module、脚本顺序即依赖顺序、**资源一律相对路径**）都在这里查，不靠浏览器。
   相对路径不是风格问题：本站同时要在 `file://` 与 `https://<owner>.github.io/<repo>/` 下活，
   写成 `/js/app.js` 在第一种解析成 `file:///js/…`、在第二种丢掉 `/<repo>`，两边都 404 而站点主页托管下正常。
6. `node tools/test-gates.mjs && node tools/test-gates-meta.mjs && node tools/test-doc-cite.mjs &&`
   `node tools/test-intake.mjs && node tools/test-related-candidates.mjs` — 前三条是「审门的门」；
   第四条审的是投稿分诊台自己
   （改动 `tools/intake.mjs`、`js/contribute.js` 的白名单、`js/prov.js` 的定位器种类后必跑——
   intake 的判据是从这两个模块现取的，它们一变，分诊结论就可能悄悄变）；
   第五条审的是跨轨 related 候选器的判别力。改动 `tools/` 下任何门的检查分支、阈值或正则后本步必跑——
   新增一道门而未证明它能红，等于新增了一道会骗人的门。
   候选器自审原先只在第 8 步的条件链里跑，现已进 `GATES`：「只在补边时才跑的门」等于给漏跑开了口子，
   它的否决判据一旦被改坏，没人会在补边之外发现。
7. `node tools/doc-cite.mjs` — 改动 `DATA_SCHEMA.md` / `README.md` 里任何「id + 权重」引用后必跑。
   文档写过的例证曾与语料实评相反（§4A② 记着那两次驳回），引用不再靠人自觉。
8. 补跨轨 `related`（只在需要新增对照边时）：
   `node tools/related-candidates.mjs --min 4` 出候选 → 逐边写进 `tools/related-cross.json`
   的 accepted / rejected（**每条必须有 why**，编造关联是禁止项，故不许跳过裁定直接补边）→
   `node tools/related-cross.mjs` dry-run 审计通过 → 加 `--write` 落盘 →
   `node tools/test-related-candidates.mjs && node tools/validate.mjs --strict` 复验。
9. 浏览器里 `file://` 打开自测：缩放、悬停、点击、检索各过一遍，控制台应无 error。
   静态不变量已由第 5 步接管，浏览器只验交互与视觉。舆图另验四件事：底图陆界画得出来
   （不是整屏纯色）、落针数量与提示条一致、`#/atlas?year=-100&place=beikal` 这类深链
   能把镜头带到对的点、大势模式下只画快照自己挂的那几条依据。
10. 并档投稿记录（`chronicle-contribution/1`）：`source` 往 `detail.sources` 追加、
    `check` 往顶层 `checks` 追加 `{by, at, note}`（`by` 用投稿人署名，这是署名的唯一落点）、
    `event` 按 §2 新建一条并按 §4 定权重。**只从记录里取证据，不取结论**——记录里没有也不该有
    等级与权重字段，投稿人自报的那些一律丢弃（见「投稿：三个入口，一条通道，零后端」）。
11. 地理层（改动 `tools/geo-places.tbl`、`tools/geo-water.tbl`、`data/geo/journeys.js`、
    `data/geo/snapshots.js` 或任何分片的 `detail.place` 后必跑，顺序不能换）：

```bash
node tools/gen-places.mjs && node tools/gen-basemap.mjs   # 表 → 生成物
node tools/geo-apply.mjs --write                          # 表+语料 → 叠加层
node tools/validate-geo.mjs && node tools/test-geo.mjs     # 门 + 门能红
node tools/geo-candidates.mjs --top 30                    # 缺口还有多大（只读）
```

    叠加层是**生成物**：改了某条的 `detail.place` 却忘了重跑 `geo-apply`，
    `validate-geo` 的 `OVERLAY_SYNC` 会重算一遍并与盘上逐字比对后判红——
    「忘重生成」从静默漂移变成一道红门。

12. 静态专题页（改过语料、地名表或行迹后重跑；换域名必须显式传 `--base`）：

```bash
node tools/gen-topics.mjs --places 40
node tools/gen-topics.mjs --base https://<你的域名>/<路径>/
```

13. 故事层（改动 `data/story/*.js` 任何一片后必跑）：

```bash
node tools/validate-story.mjs && node tools/test-story.mjs
```

    这一层是本站唯一**自己写句子**的层：事实层的条目来自书，出处错了指得回原书；
    故事层的 `scene` 是白话复述，一句「他临死说」写歪了，读者翻遍史料也找不到那句话。
    所以判据全是围绕「不许把大意冒充原文」：标 `verbatim` 必须给到能翻到的位置（篇目/卷册/节页/日期/著录编号/链接），
    `笔记异闻`／`后世附会` 必须写 `caveat` 说明为什么还值得看，`出土文献与档案` 必须写 `find` 说明东西在哪。
    年份与朝代**不存**在故事里——一律由 `ev` 锚定的那条真条目派生，存了就有第二份打架的。
    新增一片时记得两处：文件里必须自带 `window.__CHRONICLE_STORY_CHUNK = ... || {}` 守卫行
    （漏了它在浏览器里不发作，只有逐片独立求值才现形），以及 `data/story/manifest.js` 里登记——
    只写文件不登记，`STORY_MANIFEST` 判红，因为界面按 manifest 注入，那片永远加载不到。

14. 涟漪层（改动 `data/chain/*.js` 任何一片或它的 `manifest.js` 后必跑）：

```bash
node tools/validate-chain.mjs && node tools/test-chain.mjs
```

    这一层是本站**风险最高**的一层：它不写事实，写的是「因为 A，所以后来有了 B」——替历史编因果。
    读者分不清「史书这样写了」和「本站这样连的」，而后者一旦被当成前者，造假就不是写错一条，
    而是凭空多出一条从来没人主张过的关系。所以判据全围着这一句：
    每一边必须写明「有出处」还是「本站的连接」，两者在界面上**排版同级**
    （「本站的连接」淡一档就成了「这句不算数」）；说「有出处」时，所引材料名必须逐字出现在
    这一边两端条目自己的 `sources` 里，本站无权凭空造一个书名；一条链允许有本站推断的边，
    但不允许全是。环序按年份严格递增、同年不排、平均每环隔三年；落点（末环）必须是
    `weight ≤ 2` 的小事，否则这层退化成另一份大事年表。年份与权重**不存**在链里，一律由锚点派生。
    `caveat` 每链必填且必须真在怀疑这条连接——写「此事尚有争议」那种放之四海而皆准的废话不过门。
    契约全文见 `tools/DATA_SCHEMA.md` §17。

15. 日层（改动任何分片正文里那句「X年Y月Z日」之后必跑；顺序不能换）：

```bash
node tools/date-candidates.mjs                 # 只读报告：收了多少、哪些日历格空着、哪几条因歧义不收
node tools/date-candidates.mjs --apply         # 写 data/dates.js（幂等：内容相同则不写）
node tools/validate-dates.mjs && node tools/test-dates.mjs
```

    这一层是**派生**，不是编纂：「历史上的今天」里的每一个月日，都必须是该条自己的文本
    （标题/摘要 → 经过段 → 出处）已经写明、且与该条 `year` 同一年的日子。同一年里出现两个
    不同日子即判歧义、整条不收——门不许替人挑一天，挑了就是造假，所以 `--ambig` 把候选交回
    写正文的人。中文月日只收 1912 年及以后（此前多为农历，换算要历表，而历表错一次就是把日期
    造假）；`how=src` 那一层是文书落款日，界面必须标「出处纪日」，不能与事件发生日混成一件事。
    改了正文却忘了重跑 `--apply`，`validate-dates` 会现算一遍并与盘上逐字比对后判红。
    页脚那句「命中 N 个日历格，空 M 天」里的 M 也只许有一个出处：盘上的 `blankDays`。
    界面自己按 `d <= 31` 数格子会把 4/31、6/31、9/31、11/31 当成空着的一天（实测虚报 14 天，
    实况 10 天）；同理「这个日子存不存在」由盘上的 `mdays` 判，`js/router.js` 与 `js/today.js`
    都不得再抄一份历表——两份历表打架时，4/31 走一条路被放行、2/30 走另一条路被默默吞掉，
    读者被送回今天而不知道为什么。

16. `node tools/predeploy.mjs` — 提交或推送前最后一道：它把工作树 `GATES` 里的门全跑，
    再按 git 索引还原一份「别人 clone 到的样子」跑其中的 `STAGING_GATES` 那一组（数目不写死在文档里，
    两份清单由 `tools/test-gates-meta.mjs` 与 `.github/workflows/gates.yml` 对账），并对**全部被跟踪文件**查疑似密钥、巨块、
    漏网未跟踪文件；还原视图的文件条数与该清单不一致当场判红。
    本地全绿而它红 ⇒ `.gitignore` 挡掉了发布需要的文件，这种错只有在这里才看得见。

常用命令：

```bash
node tools/validate.mjs --json | head -40    # 机读，便于脚本消费
node tools/fix-ids.mjs                        # 干跑，看清改动面
node tools/fix-ids.mjs --write                # 落盘（原子写；运行期间文件被改则跳过并告警）
node tools/drop-dups.mjs --plan               # 重复条目裁定：打印删除计划 + 裁定依据，不动数据
node tools/drop-dups.mjs --write              # 按计划删除，related 改指留存方并复验条数
```

## 已知边界

- **移动端不是纵向流**。最初设想里手机应走竖向时间流，实际实现是同一张画布上的
  横向可拖拽时间轴 + 触摸缩放。窄屏下字号与标记密度偏紧，尚未按手机重排。
- **覆盖度不均**。分片按年代切分，部分区间仍在编纂；`validate.mjs` 的 `HOLE` 告警就是
  当前空洞清单，`1949 后条目` 一行给出双线覆盖数。空洞是数据问题，不是渲染问题。
- 前841年（共和行政）之前的中国纪年属学界推定，条目带 `yearApprox`，界面显示为 `~前xxxx年`。
- 当代条目（1949 后、尤其 2020 后）只收可溯源事实，`sources` 标注出处，不作价值判断。
- 主题时间线由 `data/themes.js` 的关键词匹配生成，不是人工维护的事件 id 列表；
  关键词命中为空的主题会在下拉里显示为 0 节点。
- **「已核」目前一条都没有。**四级在现库的读数不在这里抄一份——抄了就注定腐烂（这里
  曾同时写着 3388/1512 与 3430/1480 两组数）。要现算就执行 `node tools/prov-stats.mjs --era`，
  它用的判据就是 `js/prov.js` 本身，不是第二把尺子；`--era` 顺带按年代分段，直接指出
  `仅书名` 占比最高、读者最查不到的那一段。
  标签体系先于核对记录存在，升档只能靠 `checks` 一条条攒出来——这不是缺陷，是这套设计的起点。
  攒的动作不限于「人翻书」：本站逐字比对权威电子书文本后写下的记录同样算核对，
  只要 `by` 写明比对的是哪一卷；这类记录按 `CHECK_BY_LOCATOR` 的口径如实登记，不自称人工审读。
- 投稿不承诺进入站点：并档要有人按第 10 步做一次，而本站没有审核时限与值班表。
  谁在维护、多久并一次档，写在仓库的 README 或 issue 模板里由维护者自定。
- **舆图不画现代国界与省界**。底图只有 Natural Earth 的陆地轮廓（公有领域）与作者自绘的
  水系；「山河大势」是墨色示意面加箭头，写明「非精确疆界」。**这不只是审美选择**：
  公开上线含边界的地图在境内可能触发地图审核与互联网地图服务合规，备案号也解决不了它。
  境内接入前请按「上线为公开站点 · 方案 B」的合规咨询走一遍，别把审图当成上线后再补的手续。
  Natural Earth 是公有领域，但不等于符合中国地图审核口径。
- **地理覆盖不是 100%，也不该假装是**。实测 w4-5 覆盖 1508/1667（90.5%）、全量 4312/4910（87.8%）；
  没落点的条目多数是语料里 `detail.place` 只写了流域／区域（「黄河中下游」「淮泗之间」）或地名表
  还没收到那座城。缺口由 `node tools/geo-candidates.mjs` 按条数排序报出来，补表按这个顺序补。
- **坐标是现代市区位置，作者按公开资料自绘**，不是测绘成果；古今地名的识别参考谭其骧主编
  《中国历史地图集》——只取「某古城即今某地」这类结论，未复制该书图幅与边界线（表达）。
  区域级条目（`kind: region`，如「今山西」）在界面上画成软盘而不是精确落针。
- **行迹与快照的出处是硬门**：一站既没有语料条目 id 又没有 `src`，`validate-geo` 判红
  （`JOURNEY_NOSRC`）；快照缺 `source` 或 `license` 同样判红。游戏化的寻址挑战也只能用
  已地理化且带出处的条目出题。
