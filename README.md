# 时间长河 · River of Time

中国编年史与世界编年史的双线对照时间轴。**零构建、零依赖、零服务器**：数据以 `.js`
分片形式随页面加载，因此直接双击 `index.html`（`file://`）即可完整使用。

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
| 主题时间线（一条线索串起跨年代事件） | 「选择主题时间线」下拉 |
| 同年对照弹窗（中国 vs 世界同年并排） | 顶栏「同年对照」、详情内对照块 |
| 年份档案（点空白处） | 点击画布空白 |
| 画布上的水流层：河面亮度随该段史实密度涨落，附波光与偶发流星 | 无需操作（深墨底为光、宣纸底为墨；叠加模式上朱砂／中脊金／下石青） |
| 每条记录的溯源等级（已核／可定位／仅书名／无出处） | 详情、气泡、长河与对照处的 `pv` 标签；图例「溯源」行在画布下方 |
| 按溯源等级过滤（只看查得到的那些） | 顶栏「溯源」下拉 |
| 补出处、报核对、添新条目（不需要账号，也不经任何人认证） | 顶栏「纠错投稿」；详情底部「补充出处」「我核过这条」 |

检索语法：`1368-1644` 年代区间、`前636` 公元前后、`!cn` / `!world` **只看**该轨
（不是排除）、`#science` 限定维度、`@person` 限定关键人物。

快捷键见画布下方「帮助」。视图、模式、筛选偏好存 localStorage；URL hash 携带当前视窗，
可直接分享定位。`prefers-reduced-motion` 下自动关闭惯性动画。

## 谁的话可信：溯源四级

正史与随手添加混在一张时间轴上时，读者需要的不是「谁认证过」，而是**我能查到哪一步**。
所以等级不写进数据、不由任何人盖章，而是每条现算（`js/prov.js` 是唯一派生处，界面、
筛选、图例都读它）：

| 等级 | 判据（`tierOf` 的实际口径） |
| --- | --- |
| 已核 | 有至少一条合式的核对记录：`checks[i]` 写明 `by`（谁）与 `at`（`YYYY-MM-DD`）。只有记录没有出处时 `validate` 另报 `CHECK_WITHOUT_SOURCE` |
| 可定位 | 无核对记录，但 `sources` 里出现了能直接翻到的位置：篇目／卷册／节页／年月日／链接（ISBN、URL 算链接） |
| 仅书名 | 有 `sources`，但一条定位线索都没有——写得出书名，翻不到内容 |
| 无出处 | `sources` 为空。当作线索看，不要当作依据用 |

四档按「读者能不能自己查证」排序，不代表真假；顶栏「溯源」下拉据此过滤。
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
   这是展示义务，漏挂会被要求整改。**这是 B 相对 A 唯一一处要改 `index.html` 的地方**：
   页脚加一行备案号链接。
7. **发布方式变了**。A 路线 `git push` 即上线；B 路线没有 CI 会自动同步，每次改动都要把整个
   目录再传一遍（控制台拖，或 `ossutil cp -r` / `coscmd upload -r`）。这是长期成本，不是初始成本，
   所以先 A 后 B、A B 并存（备案下来时只换解析并补一行页脚备案号）通常比直接上 B 划算。

换宿主不动代码这件事不是推断，是门保证的：`tools/e2e-static.mjs` 的 `ABS_PATH` 判据禁止任何
根绝对路径的资源引用——它同时是 `file://` 双击可用与"子目录/根目录都能跑"的前置条件。

零后端做不到的事，也别假装做得到：**投稿不会自己出现在站上**。浏览器在 `file://`
下连 `fetch` 都不允许（`tools/e2e-static.mjs` 的 `FILE_URL_BREAK` 门就是为此存在），
所以读取仓库内容必须由一次重新生成来完成——把 issue 里的 JSON 记录人工并档进
`data/{cn,wd}/*.js`，跑一遍必跑清单，再推送。并档时署名写进 `checks[].by`，
等级才会从「可定位／仅书名」升到「已核」。

## 目录

```
index.html          单页外壳（工具栏、图例、面板容器）
.github/            ISSUE_TEMPLATE/chronicle-contribution.md：第一版唯一写入通道的落点
                    （模板头 labels 与 js/contribute.js 的 LABEL 由 test-units 对账）
css/                深墨 + 朱砂石青的纸质编年史配色
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
data/
  meta.js           年代范围、轨道、十维、时代带、主题元数据
  reign.js  themes.js  manifest.js
  cn/cn-0X.js       中国编年史分片    wd/wd-0X.js  世界编年史分片
tools/
  DATA_SCHEMA.md    数据契约（作者必读）
  validate.mjs      数据门（硬性错误必须为 0）
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
                    减动效下入场延迟一并归零）（721 项）
  test-gates.mjs    门禁可红性自审：给每个门注入一处定向变异，要求它变红并命中指定检查码
                    （65 项）——一道永远不变红的门等于这道门不存在
  test-gates-meta.mjs 再往上套一层：把门改哑，验对应自审器（test-gates / test-doc-cite /
                    test-related-candidates / test-units）是否抓到并点名（96 项）
  predeploy.mjs     发布面门：工作树六道门全跑，再 `git checkout-index` 还原一份「别人 clone 到的样子」
                    跑四道——本地全绿而纯净目录变红，就是 .gitignore 挡掉了发布需要的文件；
                    另查没有疑似密钥、无未跟踪未忽略的漏网文件、无 5MB 巨块。
                    这三条扫的是**全部被跟踪文件**（`git ls-files`）而非本次暂存的改动——
                    首次提交之后 `diff --cached` 只剩刚 add 的那一个文件，拿它当发布面等于
                    在近零覆盖上判绿；因此还原视图的条数与该清单还有一道对账，两数不等即判红
  doc-cite.mjs      文档引用对账门：tools/DATA_SCHEMA.md 与 README.md 里每一处「id + wN」必须与语料一致
                    （id 存在、权重相等）；``` 围栏内是语法模板不核对，模板里的 id 一律写 …--pNN 占位
  test-doc-cite.mjs 上一道门的红性证明：不改门的代码、改输入（把 w5 写成 w3、引用不存在的 id、
                    删权重、把权重推出窗口、围栏内/外各塞假 id、抽走 README），逐条要求变红并点名
  weight-change.mjs 权重单字段变更 + 内置自审门：断言 diff 恰好等于授权集合、
                    其余字段逐字节不变；补丁必须带 §4 依据的 why，否则拒绝
  related-candidates.mjs 跨轨 related 候选生成器（只读）：±5 年窗内按共名/共标签/共地望/共词/同拉丁名打分，
                    低频信号才准入（DF_* 门 + strong 旗标）——编造关联是禁止项，故先出候选再逐边裁定
  related-cross.mjs 跨轨 related 补边的唯一授权写入口：只认 tools/related-cross.json 里的 accepted 集合，
                    断言改后只多出这些边、无任何边被删除、除 related 外每字段逐字节不变；默认 dry-run，--write 才落盘
  test-related-candidates.mjs 候选器的可红性自审：合成夹具（7 对应收 + 过泛/越窗/同轨等必不收的对照）
                    证明判别力，再用真实语料对账「候选集 ⊆ 裁定集」（漏裁定与凭空裁定都算红）
  check.mjs         作者侧单分片自检
  shard-report.mjs  全分片体检：条数/跨度/50年桶疏密/体积，定位代理中断留下的空洞
  style-probe.mjs   跨分片文体漂移：文言标记率、「」率、白话虚词密度（多代理并行时用来对齐文风）
  style-samples.mjs 分片抽样打印 title/summary/背景句 —— style-probe 的正则是粗代理会误报，定性要看真句子
  rewrite-invariants.mjs 改写前后逐条比对：冻结 12 个事实字段，只放 title/summary/background/process/impact，
                    并校验长度契约与条数/id 集合不变 —— 批量改文体时防事实静默漂移
  repair-lines.mjs  修复增量追加时丢掉收尾 `}` 的单行事件
  fix-ids.mjs       给公元前 id 批量补 `b` 中缀（幂等）
```

## 数据维护

1. 按 `tools/DATA_SCHEMA.md` 编辑 `data/{cn,wd}/*.js`。id 规则要点：**公元前年份必须带
   `b` 中缀**（`cn--b636--pNN`，NN 为该年该维度内的两位序号），否则 前1500 与 公元1500 会撞成同一 id。
2. `node tools/gen-manifest.mjs` — 重算分片清单（条数、年代范围、体积）。
3. `node tools/validate.mjs --strict` — 看 `=== ERRORS` 是否为 0。27 分片现已全部有内容，
   故 `--strict` 是默认口径（此时悬空 `related` 按错误计，不再是告警）。
4. `node tools/test-units.mjs` — 改动 `js/time|axis|lod|state|themes|flow|loader|prov|contribute.js`、
   `.github/ISSUE_TEMPLATE/`、投稿弹窗的骨架与 `.contrib*` 样式、开场题记（`index.html` 的 `#boot .epigraph`
   与 `css/layout.css` 的题记样式块），或数据元信息后必跑。含加载器失效路径：
   注入悬挂/缺文件/坏 manifest 时，遮罩必须超时判失败而不是把整站冻死（`failedChunks()` 必须留账）。
5. `node tools/e2e-static.mjs` — 改 `js/` 或 `index.html` 的脚本顺序后必跑。零构建站的全部
   致命约束（无 fetch、无 ES module、脚本顺序即依赖顺序、**资源一律相对路径**）都在这里查，不靠浏览器。
   相对路径不是风格问题：本站同时要在 `file://` 与 `https://<owner>.github.io/<repo>/` 下活，
   写成 `/js/app.js` 在第一种解析成 `file:///js/…`、在第二种丢掉 `/<repo>`，两边都 404 而站点主页托管下正常。
6. `node tools/test-gates.mjs && node tools/test-gates-meta.mjs && node tools/test-doc-cite.mjs`
   — 改动 `tools/` 下任何门的检查分支、阈值或正则后必跑。新增一道门而未证明它能红，等于新增了一道会骗人的门。
7. `node tools/doc-cite.mjs` — 改动 `DATA_SCHEMA.md` / `README.md` 里任何「id + 权重」引用后必跑。
   文档写过的例证曾与语料实评相反（§4A② 记着那两次驳回），引用不再靠人自觉。
8. 补跨轨 `related`（只在需要新增对照边时）：
   `node tools/related-candidates.mjs --min 4` 出候选 → 逐边写进 `tools/related-cross.json`
   的 accepted / rejected（**每条必须有 why**，编造关联是禁止项，故不许跳过裁定直接补边）→
   `node tools/related-cross.mjs` dry-run 审计通过 → 加 `--write` 落盘 →
   `node tools/test-related-candidates.mjs && node tools/validate.mjs --strict` 复验。
9. 浏览器里 `file://` 打开自测：缩放、悬停、点击、检索各过一遍，控制台应无 error。
   静态不变量已由第 5 步接管，浏览器只验交互与视觉。
10. 并档投稿记录（`chronicle-contribution/1`）：`source` 往 `detail.sources` 追加、
    `check` 往顶层 `checks` 追加 `{by, at, note}`（`by` 用投稿人署名，这是署名的唯一落点）、
    `event` 按 §2 新建一条并按 §4 定权重。**只从记录里取证据，不取结论**——记录里没有也不该有
    等级与权重字段，投稿人自报的那些一律丢弃（见「投稿：三个入口，一条通道，零后端」）。
11. `node tools/predeploy.mjs` — 提交或推送前最后一道：它把工作树六道门全跑，再按 git 索引
    还原一份「别人 clone 到的样子」跑其中四道，并对**全部被跟踪文件**查疑似密钥、巨块、
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
- **「已核」目前一条都没有。**四级在现库的实测分布是 可定位 3388 / 仅书名 1512 / 已核 0 /
  无出处 0（浏览器控制台执行 `ChronProv.stats(ChronLoader.allEvents())` 可复算）。
  标签体系先于核对记录存在，升档只能靠 `checks` 一条条攒出来——这不是缺陷，是这套设计的起点。
- 投稿不承诺进入站点：并档要有人按第 10 步做一次，而本站没有审核时限与值班表。
  谁在维护、多久并一次档，写在仓库的 README 或 issue 模板里由维护者自定。
