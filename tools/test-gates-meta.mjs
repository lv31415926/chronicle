/* test-gates-meta.mjs | 对自审器做自审
 * 用法: node tools/test-gates-meta.mjs
 *
 * test-gates.mjs 与 test-doc-cite.mjs 声称「每个门都能变红」。这句话本身怎么验？
 * 只有一个办法：把门改坏成永远不红的死门，看对应的自审器是否抓到并点名。
 * 本轮审计抓到的两条死门（CHRON_ORDER 的深度过滤、W5_LOW 的阈值文案）都是人肉发现的；
 * 这个脚本把那种发现方式固化下来，此后任何一条检查被改哑都会在这里现形。
 * 每条用例用 `runner` 指明由哪个自审器验收（缺省 tools/test-gates.mjs）。
 *
 * 仓库工作区零写入：全部破坏发生在 mkdtemp 副本里，test-gates 按自身位置解析
 * ROOT，所以从副本内跑它、拷的就是那份被改坏的副本。
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gate-meta-"));

function fresh() {
  const dir = path.join(TMP, "run");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(ROOT, dir, {
    recursive: true,
    filter: (s) => !/(^|\/)(\.git|node_modules|__pycache__)(\/|$)/.test(s),
  });
  return dir;
}

const CASES = [
  {
    label: "CHRON_ORDER 深度过滤退回 0",
    file: "tools/e2e-static.mjs",
    from: "    if (d > 1) return;",
    to: "    if (d > 0) return;",
    name: "CHRON_ORDER",
  },
  {
    label: "ABS_PATH html 分支被删除",
    file: "tools/e2e-static.mjs",
    from: '  if (url.startsWith("/")) {\n    errs.push(`ABS_PATH 根绝对路径，file:// 与子路径部署下必失效: ${url}`);\n    continue;\n  }\n',
    to: "",
    name: "e2e · ABS_PATH (html)",
  },
  {
    label: "ABS_PATH css 分支改哑",
    file: "tools/e2e-static.mjs",
    from: '    if (u.startsWith("/")) { errs.push(`ABS_PATH ${f}: url(${u}) 根绝对路径，子路径部署必失效`); continue; }',
    to: "    void 0;",
    name: "e2e · ABS_PATH (css)",
  },
  /* ---- 投稿通道（#43）：三条判据各自改哑，看 test-units 是否点名 ---- */
  {
    label: "issue 模板的 labels 取错键（恒空→恒不匹配）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: 'const tplLabels = fmOf("labels").split(",")',
    to: 'const tplLabels = fmOf("no-such-front-matter-key").split(",")',
    name: "模板 labels=",
  },
  {
    label: "被写入节点扫描匹配不到任何东西",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: 'matchAll(/querySelector\\("\\.([a-z-]*contrib',
    to: 'matchAll(/querySelector\\("\\\\X([a-z-]*contrib',
    name: "往 .contrib-* 节点写内容的地方解析得到",
  },
  {
    label: "弹窗骨架取不到却继续往下判",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "src.match(/form\\.innerHTML =([\\s\\S]*?);\\s*\\n\\s*document\\.body\\.appendChild/)",
    to: "src.match(/form\\.innerHTMLNOTHERE =([\\s\\S]*?);\\s*\\n\\s*document\\.body\\.appendChild/)",
    name: "弹窗骨架取得到",
  },
  /* ---- 开场收束语（#45）：三条兜底判据各自改哑，看 test-units 是否点名 ---- */
  {
    label: "字色清单的选择器条件漏掉 .ep-we（换色无人管）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: ' || sel.includes(".ep-we") ||',
    to: " ||",
    name: "也在这份字色清单里",
  },
  {
    label: "收束语从 index.html 提取式改坏（恒空→文案断言恒真）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: 'indexHtml.match(/<p class="ep-we"[^>]*>([^<]*)</)',
    to: 'indexHtml.match(/<p class="ep-weNOTHERE"[^>]*>([^<]*)</)',
    name: "开场收束语从 index.html 取得到",
  },
  {
    label: "减动效块取块正则一条也切不到（并集判据空转）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "reduce\\)\\s*\\{([\\s\\S]*?)\\n\\}/g",
    to: "reduce\\)\\s*\\{([\\s\\S]*?)\\n  \\}/g",
    name: "至少切得出",
  },
  {
    label: "W5_LOW 分支被删除",
    file: "tools/validate.mjs",
    re: /if \(p5 < TRIG\.w5Lo\) W\(c\.id, "W5_LOW".*\n/,
    name: "W5_LOW",
  },
  {
    label: "weight-change 非 weight 字段审计失效",
    file: "tools/weight-change.mjs",
    from: "errs.push(`${a.id} 非 weight 字段 ${k} 被附带改动 —— 拒绝落盘`);",
    to: "void 0;",
    name: "毒化 summary",
  },
  /* doc-cite 的两条 ERROR 分支：改哑后必须被 test-doc-cite 的改输入用例抓到 */
  {
    label: "doc-cite 权重对账改成「照抄盘上值」",
    file: "tools/doc-cite.mjs",
    runner: "tools/test-doc-cite.mjs",
    from: "const cited = wm ? Number(wm[1] || wm[2] || wm[3] || wm[4]) : null;",
    to: "const cited = wm ? e.weight : null;",
    name: "文档把 w5 写成 w3",
  },
  {
    label: "doc-cite 静默跳过语料里不存在的 id",
    file: "tools/doc-cite.mjs",
    runner: "tools/test-doc-cite.mjs",
    from: 'if (!e) { errs.push(`${at}: 引用 ${id} —— 语料里没有这条（条目已删或当初就写错）`); continue; }',
    to: "if (!e) { continue; }",
    name: "引用语料里没有的 id",
  },
  /* ---- 跨轨候选生成器：四条判据链各自改哑，夹具对照必须点名 ---- */
  {
    label: "候选器 strong 准入门被删除（噪声全放行）",
    file: "tools/related-candidates.mjs",
    runner: "tools/test-related-candidates.mjs",
    from: "        if (!strong && !WEAK) continue;",
    to: "        void 0;",
    name: "阳性集恰为",
  },
  {
    label: "候选器共名 df 门恒真（高频人名当强信号）",
    file: "tools/related-candidates.mjs",
    runner: "tools/test-related-candidates.mjs",
    from: "          if (f <= DF_FIG) {",
    to: "          if (true) {",
    name: "阳性集恰为",
  },
  {
    label: "候选器共名定档方向反过来（取 df 最大值）",
    file: "tools/related-candidates.mjs",
    runner: "tools/test-related-candidates.mjs",
    from: "          const f = Math.min(...shFig.map((x) => df.fig.get(x) || 1));",
    to: "          const f = Math.max(...shFig.map((x) => df.fig.get(x) || 1));",
    name: "阳性集恰为",
  },
  {
    label: "候选器年窗常量放宽到 12",
    file: "tools/related-candidates.mjs",
    runner: "tools/test-related-candidates.mjs",
    from: "const GAP_MAX = 5;",
    to: "const GAP_MAX = 12;",
    name: "越窗与同轨",
  },
  /* ---- 跨轨补边写入口：五道闸各自改哑，test-gates 的对应分支用例必须抓到 ---- */
  {
    label: "related-cross 年差 sanity 失效",
    file: "tools/related-cross.mjs",
    from: "  if (Math.abs(ea.e.year - eb.e.year) > YEAR_SPAN)",
    to: "  if (false)",
    name: "年差越界",
  },
  {
    label: "related-cross 4 项上限检查失效",
    file: "tools/related-cross.mjs",
    from: '  if (next.length > MAX_REL) E(`${id} 补边后 related ${next.length} 项 > ${MAX_REL}（须先撤掉本轮里价值最低的那条）`);',
    to: "  void 0;",
    name: "补边后超 4 项上限",
  },
  {
    label: "related-cross 非 related 字段审计失效",
    file: "tools/related-cross.mjs",
    from: '        if (k !== "related") { E(`${a.id} 非 related 字段 ${k} 被附带改动 —— 拒绝落盘`); continue; }',
    to: "        if (k === \"__never__\") { E(\"deadened\"); continue; }",
    name: "毒化 summary",
  },
  {
    label: "related-cross 手术改成覆盖而非追加",
    file: "tools/related-cross.mjs",
    from: "    : lit.replace(/\\]\\s*$/, `${SEP}${appended.map((x) => quote + x + quote).join(SEP)}]`);",
    to: "    : `[${appended.map((x) => quote + x + quote).join(SEP)}]`;",
    name: "只追加不覆盖",
  },
  {
    label: "related-cross 摘掉 related 定位的字段边界锚",
    file: "tools/related-cross.mjs",
    from: 'const REL_SEG = /(^|[{,]\\s*)("?)(related)("?)(\\s*:\\s*)(\\[[^\\]]*\\])/;',
    to: 'const REL_SEG = /()("?)(related)("?)(\\s*:\\s*)(\\[[^\\]]*\\])/;',
    name: "被字段边界锚筛掉",
  },
  /* ---- 对照视图的关联边：四条判据改哑，test-units 的语料级断言必须点名 ----
   * 这一组的存在理由：2026-09-22 实测发现对照卡标题写「跨线关联」、列出的却是
   * 全部 related 且按插入顺序截前 10 条，32 个年份的跨线边被同轨边挤到看不见。
   * 这类缺陷不报错、不产坏数据，只是少显示——只有把「一条都不许丢」写成门
   * 并且把门改哑验一遍，才算它真的在守着。 */
  {
    label: "compare 无向去重退回有向键（同一件事排两行）",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: '        var key = [e.id, r.id].sort().join("|");',
    to: '        var key = e.id + ">" + rid;',
    name: "无向对不得在界面上排成两行",
  },
  {
    label: "compare 跨线与同轨混列（标题与内容脱钩）",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: "        (e.track === r.track ? same : cross).push(orient(e, r));",
    to: "        cross.push(orient(e, r));",
    name: "同轨边不得混入跨线块",
  },
  {
    label: "compare 跨线块上限退回到挤得下同轨的档",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: "  var CROSS_MAX = 12, SAME_MAX = 8;",
    to: "  var CROSS_MAX = 1, SAME_MAX = 8;",
    name: "跨线块上限",
  },
  {
    label: "compare 行首不再按权重定向（次序随落库顺序漂）",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: "        (e.track === r.track ? same : cross).push(orient(e, r));",
    to: "        (e.track === r.track ? same : cross).push({ from: e, to: r });",
    name: "反向落库的边也要把权重高的一端排在行首",
  },
  /* ---- 2026-09-22 水层三件事（贴主题的河色 / 隐隐的波光 / 流星尾迹）与点击进入闸门 ----
   * 这些缺陷的共同形状：不报错、不产坏数据，只是「悄悄不好看了」——
   * 缺令牌时 Canvas 直接不画，闪点写错时只是一片死白，流星写错时永远出不来。
   * 所以每条都要么把颜色/落点量成数，要么给"整层消失"留一颗正对照。 */
  {
    label: "宣纸主题漏配 spark 令牌（波光层静默消失）",
    file: "js/palette.js",
    runner: "tools/test-units.mjs",
    from: 'spark: "rgba(36,80,111,0.95)",',
    to: "",
    name: "用到的令牌 spark",
  },
  {
    /* 2026-09-22 浏览器实测：宣纸的 spark 曾是纸白，令牌齐备、语法合法、上千笔照画，
     * 屏幕上却一片空白（对底 ΔL 仅 +14）。「配了令牌」与「看得见」是两件事，各要一道门。 */
    label: "宣纸闪点退回纸白（画了但看不见）",
    file: "js/palette.js",
    runner: "tools/test-units.mjs",
    from: 'spark: "rgba(36,80,111,0.95)",',
    to: 'spark: "rgba(255,253,246,0.95)",',
    name: "对底色看得见",
  },
  {
    label: "叠加河面上侧铺成通用金（朱砂/石青的方位语义丢失）",
    file: "js/flow.js",
    runner: "tools/test-units.mjs",
    from: '        up: trackCol("cn", pal.selectGlow), dn: trackCol("world", pal.selectGlow)',
    to: "        up: pal.selectGlow, dn: trackCol(\"world\", pal.selectGlow)",
    name: "朱砂只铺在中线以上",
  },
  {
    label: "闪点三次方退化成线性（波光变成常亮的白斑）",
    file: "js/flow.js",
    runner: "tools/test-units.mjs",
    from: "    return (.06 + .62 * dk) * tw * tw * tw * edge(s.u);",
    to: "    return (.06 + .62 * dk) * tw * edge(s.u);",
    name: "的相位上亮到半峰以上",
  },
  {
    label: "流星判定写死成 false（整层光子消失）",
    file: "js/flow.js",
    runner: "tools/test-units.mjs",
    from: "      var meteor = roll < 0.05;",
    to: "      var meteor = false;",
    name: "颗流星",
  },
  {
    label: "流星尾迹短到 3px 以下（混进粒子落点统计）",
    file: "js/flow.js",
    runner: "tools/test-units.mjs",
    from: "    var len = Math.max(14, p.tail * (.55 + .45 * dk));",
    to: "    var len = p.tail * (.12 + .05 * dk);",
    name: "尾迹每段 ≥3.4px 宽",
  },
  {
    label: "水面色标顺序写反（水汽与河心明暗对调）",
    file: "js/flow.js",
    runner: "tools/test-units.mjs",
    from: "    side(ch.up, .5 - .5 / HAZE * 1.6, .09);",
    to: "    side(ch.up, .5 - .5 / HAZE * .62, .09);",
    name: "色标由河心向外单调排布",
  },
  {
    label: "遮罩退回定时器自动撤（点击进入被绕过）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "      armEnter(Math.max(0, ENTER_REVEAL - (performance.now() - t0)));",
    to: '      setTimeout(function () { $("boot").classList.add("done"); }, 900);',
    name: "只有一处撤遮罩",
  },
  {
    label: "CSS 里删掉 .enter.show 规则（按钮永远不浮现）",
    file: "css/layout.css",
    runner: "tools/test-units.mjs",
    from: "#boot .enter.show { opacity: 1; transform: none; }",
    to: "",
    name: "#boot .enter.show 规则",
  },
  {
    label: "停留时长不再分减动效（reduce 分支被抹平）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "var ENTER_REVEAL = reduceMotion ? 1200 : 3200;",
    to: "var ENTER_REVEAL = 1200;",
    name: "用 reduceMotion 三元式",
  },
  {
    label: "默认停留缩回 1800ms（本轮「再长一些」丢失）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "var ENTER_REVEAL = reduceMotion ? 1200 : 3200;",
    to: "var ENTER_REVEAL = reduceMotion ? 1200 : 1800;",
    name: "默认停留",
  },
  /* ---- 溯源四级（prov.js）：十条判据链各自改哑，注入变异必须逐条点名 ----
   * 这套标签是整个公开站的可信度地基：一旦「已核」能被出处质量换来、
   * 核对记录能自封、或某个界面悄悄不画标签，读者看到的分级就成了假分级。 */
  {
    label: "tierOf 放宽：出处可定位即算已核（认证可被伪造）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '    if (verifiedChecks(e).length) return "verified";',
    to: '    if (verifiedChecks(e).length || hasLocator(e)) return "verified";',
    name: "出处能定位、无人核对",
  },
  {
    label: "validCheck 不再校验日期格式（自封的核对记录生效）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '      typeof c.at === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(c.at.trim());',
    to: '      typeof c.at === "string";',
    name: "核对记录被拒（日期写成中文）",
  },
  {
    label: "篇目定位正则被改坏（规则死掉却仍在冒充判据）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '    { key: "chapter", label: "篇目", re: /《[^》]+·[^》]+》/ },',
    to: '    { key: "chapter", label: "篇目", re: /《[^》]+·[^》]+》ZZZ/ },',
    name: "规则已失效却在冒充判据",
  },
  {
    label: "RANK 丢掉一档（门槛筛选把两档静默合并）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: "  var RANK = { unsourced: 0, titled: 1, locatable: 2, verified: 3 };",
    to: "  var RANK = { unsourced: 0, locatable: 2, verified: 3 };",
    name: "RANK 给出严格互异",
  },
  {
    label: "explain 不再转义署名（核对记录成了 HTML 注入点）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '      var cs = verifiedChecks(e).map(function (c) { return esc(c.by) + " 于 " + esc(c.at); });',
    to: '      var cs = verifiedChecks(e).map(function (c) { return c.by + " 于 " + c.at; });',
    name: "explain 输出里没有未转义的",
  },
  {
    label: "详情头部摘掉溯源标签（同函数内还有第二处，靠计数棘轮抓）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: '      (PV ? PV.badge(ev) : "") + wDots(ev.weight) + "</div>" +',
    to: '      wDots(ev.weight) + "</div>" +',
    name: "溯源标签落点数",
  },
  {
    label: "长河节点不画溯源标签（逐函数点名）",
    file: "js/river.js",
    runner: "tools/test-units.mjs",
    from: '        \'<div class="rv-t">\' + esc(e.title) + (PV ? PV.badge(e) : "") +',
    to: '        \'<div class="rv-t">\' + esc(e.title) +',
    name: "长河节点",
  },
  {
    label: "图例改成手写档位清单（加一档就漏一档）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "      PV.TIERS.map(function (t) {",
    to: "      [PV.TIERS[0], PV.TIERS[1], PV.TIERS[2], PV.TIERS[3]].map(function (t) {",
    name: "图例的四档由 TIERS 生成",
  },
  {
    label: "passesFilter 不再看溯源门槛（顶栏控件成摆设）",
    file: "js/state.js",
    runner: "tools/test-units.mjs",
    from: "      && window.ChronProv.rankOf(ev) >= state.provFloor;",
    to: "      ;",
    name: "passesFilter 真的按溯源门槛过滤",
  },
  {
    label: "无出处档借用认证色（组件层看不出，只有令牌层看得见）",
    file: "css/base.css",
    runner: "tools/test-units.mjs",
    from: "  --pv-unsourced: #d97f5b;",
    to: "  --pv-unsourced: var(--gold);",
    name: "不得等于已核字色",
  },
  {
    label: "组件层串档：无出处的字色指向已核的 token",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".pv-unsourced { border-style: dashed; color: var(--pv-unsourced); }",
    to: ".pv-unsourced { border-style: dashed; color: var(--pv-verified); }",
    name: "取自自己的 var(--pv-unsourced)",
  },
  {
    label: "某档字色淡到 AA 线以下（溯源标签读不出）",
    file: "css/base.css",
    runner: "tools/test-units.mjs",
    from: "  --pv-titled: #a39883;",
    to: "  --pv-titled: #7d7462;",
    name: "AA 线",
  },
  {
    label: "描边退回固定 --rule（外壳在墨底上被自己画没）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: "  border: 1px solid currentColor; color: var(--pv-locatable);",
    to: "  border: 1px solid var(--rule); color: var(--pv-locatable);",
    name: "描边跟随字色",
  },
  {
    label: "门槛选项退回 HTML 手写（与档位表脱钩）",
    file: "index.html",
    runner: "tools/test-units.mjs",
    from: '              title="按「读者能不能自己去查」筛选，与重要度（这条有多重）互不相干"></select>',
    to: '              title="筛"><option value="0">全部</option><option value="1">有出处</option>' +
         '<option value="2">出处可定位</option><option value="3">仅已核</option></select>',
    name: "不自带 option",
  },
  {
    label: "进入按钮的浮现挂回 rAF（后台标签页永不回调）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "      void btn.offsetWidth;\n      btn.classList.add(\"show\");",
    to: "      requestAnimationFrame(function () { btn.classList.add(\"show\"); });",
    name: "show 不再回调里加",
  },
  {
    label: "筛选键清单把 view 也算进去（拖拽每帧抽回顶部）",
    file: "js/state.js",
    runner: "tools/test-units.mjs",
    from: "  var FILTER_KEYS = { tracks: 1, dims: 1, weightFloor: 1, provFloor: 1, range: 1 };",
    to: "  var FILTER_KEYS = { tracks: 1, dims: 1, weightFloor: 1, provFloor: 1, range: 1, view: 1 };",
    name: "FILTER_KEYS 不含 view",
  },
  {
    label: "筛选键清单漏掉 provFloor（门槛改了长河不重画）",
    file: "js/state.js",
    runner: "tools/test-units.mjs",
    from: "  var FILTER_KEYS = { tracks: 1, dims: 1, weightFloor: 1, provFloor: 1, range: 1 };",
    to: "  var FILTER_KEYS = { tracks: 1, dims: 1, weightFloor: 1, range: 1 };",
    name: "FILTER_KEYS 恰等于",
  },
  {
    label: "长河退回手抄筛选键清单且抄漏 provFloor",
    file: "js/river.js",
    runner: "tools/test-units.mjs",
    from: "    if (S.filterChanged(ch)) render();",
    to: "    if (ch.range || ch.dims || ch.tracks || ch.weightFloor) render();",
    name: "不得手抄筛选键",
  },
  {
    label: "对照面板不再订阅筛选变化",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    re: /  S\.subscribe\(function \(s, ch\) \{\n    if \(isOpen\(\) && S\.filterChanged\(ch\)\)[\s\S]*?\n  \}\);\n/,
    name: "没有订阅状态变化",
  },
  {
    label: "boot 不再安排后台补齐（首屏之后永远只有一半数据）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "      topUpOnIdle();",
    to: "      void 0;",
    name: "ready 之后真的安排了后台补齐",
  },
  {
    label: "没人接补齐信号（长河顶部那句「尚不完整」过期成假话）",
    file: "js/river.js",
    runner: "tools/test-units.mjs",
    from: '  window.addEventListener("chronicle:rest", function () { if (open0) render(); });',
    to: "  void 0;",
    name: "长河接住 chronicle:rest",
  },
  {
    label: "补齐排序失效（按 manifest 顺序取片）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "      .sort(function (a, b) { return a.g - b.g || a.y - b.y; })",
    to: "      .sort(function (a, b) { return a.c.file < b.c.file ? -1 : 1; })",
    name: "补齐顺序须由近及远",
  },
  {
    label: "失败片救回后不撤账（状态栏永久挂 ⚠）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "      delete failed[id];",
    to: "      void 0;",
    name: "救回后必须撤账",
  },
  {
    label: "被门槛筛掉的年份仍报「此年暂无收录条目」",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "      if (!raw.length) {",
    to: "      if (true) {",
    name: "只在真的没有条目时才说",
  },
  {
    label: "顶栏下拉不再被状态推回（放宽后仍指着最严那格）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "    if (pf) pf.value = String(st.provFloor);",
    to: "    void pf;",
    name: "syncToggles 把 provFloor 推回下拉",
  },
  /* ---- 核对记录的两端口径：任一侧偷偷放宽，另一侧必须在这里点名 ---- */
  {
    label: "prov.js 的核对日期正则放宽到只看年份",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: "typeof c.at === \"string\" && /^\\d{4}-\\d{2}-\\d{2}$/.test(c.at.trim());",
    to: "typeof c.at === \"string\" && /^\\d{4}/.test(c.at.trim());",
    name: "个日期串裁决完全一致",
  },
  {
    label: "validate.mjs 的核对日期正则放宽到只看年份",
    file: "tools/validate.mjs",
    runner: "tools/test-units.mjs",
    from: "const CHECK_DATE_RE = /^\\d{4}-\\d{2}-\\d{2}$/;",
    to: "const CHECK_DATE_RE = /^\\d{4}/;",
    name: "个日期串裁决完全一致",
  },
  {
    label: "EV_KEYS 里删掉 checks（合法记录变野生字段）",
    file: "tools/validate.mjs",
    runner: "tools/test-units.mjs",
    from: `, "related", "checks"];`,
    to: `, "related"];`,
    name: "EV_KEYS 含 checks",
  },
  {
    label: "prov.js 改成采信手写 tier 字段",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: 'if (verifiedChecks(e).length) return "verified";',
    to: 'if (e && e.tier) return String(e.tier); if (verifiedChecks(e).length) return "verified";',
    name: "prov.js 不读任何手写等级字段",
  },
  {
    /* 这条变异=把 #39 修掉的缺陷原样塞回去：对照列已随筛选实时重画，
     * 门槛拉满时它会被整年筛空，而空态仍说「此年无收录条目」。
     * 门若抓不住，下次谁再改空态就没人提醒他分辨「没有」与「不给看」。 */
    label: "compare.js 空态退回无条件「此年无收录」",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: `html += '<div class="none">' + (!raw.length ? "此年无收录条目。"`,
    to: `html += '<div class="none">' + (!evs.length ? "此年无收录条目。"`,
    name: "的「此年无收录」由未筛计数决定",
  },
  {
    label: "compare.js 空态不再点出溯源门槛",
    file: "js/compare.js",
    runner: "tools/test-units.mjs",
    from: "全部被溯源门槛筛掉",
    to: "全部被隐藏",
    name: "分辨得出「被溯源门槛筛掉」",
  },
  /* ---- 投稿通道（#40）：一条出口改哑，读者就会看到自封的等级 ----
   * 这套判据守的是「公开站的可信度从哪来」：等级只能由证据现算。
   * 下面每条变异都是把一种「投稿人能自己盖章」的口子原样塞回去。 */
  {
    label: "buildRecord 漏白名单：check 记录带上 tier",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '    } else if (kind === "check") {',
    to: '    } else if (kind === "check") {\n      rec.tier = f.tier;',
    name: "check 记录里塞不进任何等级",
  },
  {
    label: "新条目的重要度改由投稿人自报",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "        weight: null",
    to: "        weight: f.weight == null ? null : Number(f.weight)",
    name: "新条目的重要度恒为 null",
  },
  {
    label: "投稿日期可由表单指定（可把自己标成三年前核过）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: 'var rec = { schema: SCHEMA, kind: kind, at: todayISO(), app: "时间长河" };',
    to: 'var rec = { schema: SCHEMA, kind: kind, at: f.at || todayISO(), app: "时间长河" };',
    name: "记录的日期恒为提交当日",
  },
  {
    label: "年份范围两头各放宽一格",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "      else if (e.year < M.yearMin || e.year > M.yearMax)",
    to: "      else if (e.year < M.yearMin - 1 || e.year > M.yearMax + 1)",
    name: "下界外一年拒绝",
  },
  {
    label: "无公元 0 年的判据被摘（与 time.js 口径脱钩）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '      else if (e.year === 0) errs.push("没有公元 0 年',
    to: '      else if (false && e.year === 0) errs.push("没有公元 0 年',
    name: "没有公元 0 年",
  },
  {
    label: "投稿目标不再核对是否真的存在",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "      else if (!L.eventById(rec.target)) errs.push(",
    to: "      else if (false) errs.push(",
    name: "目标条目不存在即废件",
  },
  {
    label: "表单里给投稿人一个「自认等级」输入框",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '          { name: "locator", type: "textarea", label: "出处定位", required: true, max: MAX.locator, rows: 3,',
    to: '          { name: "tier", type: "text", label: "自认等级", max: 20 },\n' +
         '          { name: "locator", type: "textarea", label: "出处定位", required: true, max: MAX.locator, rows: 3,',
    name: "表单里没有名为 tier 的字段",
  },
  {
    label: "issue 出口不再校验仓库地址格式",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '    if (!REPO || !/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(REPO)) return "";',
    to: '    if (!REPO) return "";',
    name: "含空格的仓库名 → 不画",
  },
  {
    label: "超长 issue 链接改为截半送出",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '    return u.length <= ISSUE_URL_MAX ? u : "";',
    to: "    return u.slice(0, ISSUE_URL_MAX);",
    name: "正文超长的记录不生成链接",
  },
  {
    label: "issue 链接不过 esc() 直接写进 HTML",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: `      exits += '<a class="primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +`,
    to: `      exits += '<a class="primary" href="' + url + '" target="_blank" rel="noopener noreferrer">' +`,
    name: "链接写进 HTML 前过 esc()",
  },
  {
    label: "issue 正文的 JSON 块丢掉语言标记",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "```json",
    to: "json",
    name: "的 JSON 块解析得到",
  },
  {
    label: "「报核对」入口从详情投稿条里摘掉",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: `      '<button type="button" data-contrib="check" data-id="'`,
    to: `      '<button type="button" data-c="check" data-id="'`,
    name: "有真实落点",
  },
  {
    label: "app.js 不再调用 mount()（按钮点了没反应）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "  if (window.ChronContribute) ChronContribute.mount();",
    to: "  void 0;",
    name: "app.js 启动后调用 mount()",
  },
  {
    label: "详情抽屉里的投稿条被摘掉",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    if (window.ChronContribute) html += ChronContribute.bar(ev);",
    to: "    void 0;",
    name: "详情抽屉里画了投稿条",
  },
  {
    label: "contribute.js 忘记挂进 index.html",
    file: "index.html",
    runner: "tools/test-units.mjs",
    from: '<script src="js/contribute.js"></script>',
    to: "",
    name: "是孤儿",
  },
  {
    label: "openForm 不再重置蜜罐（脏值吞掉此后每条正常投稿）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: `    var hp = form.querySelector('[name="fax"]');\n    if (hp) hp.value = "";`,
    to: `    var hp = form.querySelector('[name="fax"]');`,
    name: "每次 openForm 都重置蜜罐",
  },
  {
    label: "蜜罐条件取反（正常投稿被静默丢弃、机器人放行）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '    if (honeypotFilled(v.fax)) { setMsg("已收到，感谢补充。", "good"); return; }',
    to: '    if (!honeypotFilled(v.fax)) { setMsg("已收到，感谢补充。", "good"); return; }',
    name: "蜜罐判的是「填了才拦」",
  },
  {
    label: "蜜罐改用 display:none（脚本不再填，蜜罐变装饰）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".contrib-hp { position: absolute; left: -9999px; top: 0; width: 1px; height: 1px; overflow: hidden; }",
    to: ".contrib-hp { display: none; }",
    name: "蜜罐不用 display:none",
  },
  {
    label: "限频的时钟守卫被删（未来时间戳会把人锁到永远）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: 'typeof t === "number" && now - t >= 0 && now - t < 24 * 3600 * 1000;',
    to: 'typeof t === "number" && now - t < 24 * 3600 * 1000;',
    name: "未来的单条时间戳不进当日账",
  },
  {
    label: "ChronLoader 把 eventById 改名（测试桩替它活着）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "    eventById: eventById,",
    to: "    byId: eventById,",
    name: "都由 ChronLoader 真导出",
  },
  {
    label: "投稿弹窗压到详情抽屉之下（入口被盖住）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: "  position: fixed; inset: 0; z-index: 59; background: var(--scrim);",
    to: "  position: fixed; inset: 0; z-index: 39; background: var(--scrim);",
    name: "压在详情",
  },
  {
    label: "投稿弹窗盖到启动遮罩之上",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: "  position: fixed; inset: 0; z-index: 59; background: var(--scrim);",
    to: "  position: fixed; inset: 0; z-index: 61; background: var(--scrim);",
    name: "仍在启动遮罩",
  },
  {
    label: "投稿条 hover 字色退回点缀色",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".contrib-bar button:hover { color: var(--link); border-color: var(--link); border-style: solid; }",
    to: ".contrib-bar button:hover { color: var(--cn-soft); border-color: var(--cn-soft); border-style: solid; }",
    name: "里没有 color: var(--cn-soft)",
  },
  {
    label: "宣纸底 --link 淡到 AA 线以下",
    file: "css/base.css",
    runner: "tools/test-units.mjs",
    from: "  --link: #b3301a;",
    to: "  --link: #c98677;",
    name: "字色 --link=",
  },
  /* ---- 报错文案与判据同线（浏览器验收实测六字摘要被告知「不能空着」）---- */
  {
    label: "六字摘要的报错退回「不能空着」（字段明明有内容）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '      if (e.summary.length < MIN.summary) errs.push("摘要太短（至少 " + MIN.summary + " 字）——没有一句话，读者无从判断要不要点开");',
    to: '      if (e.summary.length < MIN.summary) errs.push("摘要不能空着——没有一句话，读者无从判断要不要点开");',
    name: "有内容时报错不得说「空着」",
  },
  {
    label: "判据比文案宽一格：正好写到下限仍被打回",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "      if (e.summary.length < MIN.summary) errs.push(",
    to: "      if (e.summary.length <= MIN.summary) errs.push(",
    name: "正好落在下限即放行",
  },
  {
    label: "输入框提示退回只写上限（下限只藏在报错里）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: '          ph: "至少 " + MIN.summary + " 字，说清这一条在讲什么" },',
    to: '          ph: "一句话说清发生了什么" },',
    name: "的输入提示提前写明下限",
  },
  {
    label: "标题判据与 MIN 脱钩（写死 3，文案还写着 4）",
    file: "js/contribute.js",
    runner: "tools/test-units.mjs",
    from: "      if (e.title.length < MIN.title) errs.push(",
    to: "      if (e.title.length < 3) errs.push(",
    name: "比下限少一字即判废",
  },
];

let ok = 0;
for (const c of CASES) {
  const dir = fresh();
  const p = path.join(dir, c.file);
  const src = fs.readFileSync(p, "utf8");
  const out = c.re ? src.replace(c.re, "") : src.replace(c.from, c.to);
  if (out === src) {
    console.log(`✗ ${c.label.padEnd(34)} 变异锚串没匹配上——被检代码已改动，本用例失效`);
    continue;
  }
  fs.writeFileSync(p, out);
  let code = 0, stdout = "";
  const runner = c.runner || "tools/test-gates.mjs";
  try {
    stdout = execFileSync("node", [path.join(dir, runner)], { cwd: dir, encoding: "utf8" });
  } catch (e) {
    code = e.status === undefined ? -1 : e.status;
    stdout = (e.stdout || "") + (e.stderr || "");
  }
  const named = stdout.split("\n").some((l) => l.includes(c.name) && /^\s*✗/.test(l));
  const good = code === 1 && named;
  console.log(`${good ? "✅" : "✗"} ${c.label.padEnd(34)} rc=${code} 点名「${c.name}」=${named}`);
  if (good) ok++;
}
console.log(`\n${ok}/${CASES.length} 个死门被对应的自审器抓到`);
if (ok === CASES.length) fs.rmSync(TMP, { recursive: true, force: true });
else console.log(`现场保留于 ${TMP}`);
process.exit(ok === CASES.length ? 0 : 1);
