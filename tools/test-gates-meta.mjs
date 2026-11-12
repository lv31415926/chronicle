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
import { markOwner, reclaimStale } from "./tmp-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gate-meta-"));

/* 全绿才删 TMP（见文末），所以中途被杀、或跑过失败用例的现场会一份份留下，
 * 每份 11M+。回收与 test-gates 共用同一判据：有活人占用的目录不能碰——
 * 两个 meta 会话并跑时互删副本，被抓到的那次整轮结论直接失真。 */
{
  markOwner(TMP);
  const r = reclaimStale("gate-meta-", path.dirname(TMP), path.basename(TMP));
  if (r.reclaimed) console.log(`已回收上次运行遗留的 ${r.reclaimed} 份变异现场` +
    (r.kept ? `；另 ${r.kept} 份正被别的会话占用，不动` : ""));
}

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
  /* ---- 清理程序自己 ----
   * 回收循环是这批工具里唯一会 rmSync 别人产物的代码。它改哑的两个方向都骗人：
   * 恒「无主」⇒ 并跑时互删副本，被删的一方要么崩要么拿着半套文件判绿；
   * 恒「有主」⇒ 一份都不删，tmp 里几百兆只增不减，看起来仍然全绿。
   * 判据本身由 tools/test-gates.mjs 的三个探针目录现场验，这里只负责证明那条断言不是死代码。 */
  {
    label: "现场回收判据恒「无主」（并跑时互删副本）",
    file: "tools/tmp-sweep.mjs",
    runner: "tools/test-gates.mjs",
    from: "    if (ownerAlive(dir)) { res.kept++; continue; }",
    to: "    if (false && ownerAlive(dir)) { res.kept++; continue; }",
    name: "存活会话的副本不得被删",
  },
  {
    label: "现场回收判据恒「有主」（回收永久空转）",
    file: "tools/tmp-sweep.mjs",
    runner: "tools/test-gates.mjs",
    from: "    if (ownerAlive(dir)) { res.kept++; continue; }",
    to: "    if (true || ownerAlive(dir)) { res.kept++; continue; }",
    name: "归属无效与无主旧现场仍要回收",
  },
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
    /* 这一条原先打在「test-units 里删掉 `|| sel.includes(".ep-we") ||`」上，本轮实测变成抓不到：
     * --ink-soft 进了 TEXT_TOKENS，而 .ep-we 正好用它——选择器条件成了冗余的第二重保护，
     * 删了它这条规则照样在清单里。真正的失效形态是「字色不再走令牌」（写死 hex 就从
     * `color: var(--x)` 的扫描里静默脱落，上面量出来的对比度全作废），哨兵因此改打这个形态。 */
    label: "收束语字色写成死值（脱离令牌后静默滑出字色清单）",
    file: "css/layout.css",
    runner: "tools/test-units.mjs",
    from: "  letter-spacing: .1em; color: var(--ink-soft);",
    to: "  letter-spacing: .1em; color: #8d8271;",
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
  /* 「已核」这一档第一次靠署名里的位置撑起来，所以署名判据本身要有哨兵：
   * 它一旦改哑，「某某核过」就能抬档，而读者手上仍然查不到任何东西。 */
  {
    label: "署名不再要求写明位置（「某某核过」也能冒充已核）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '    for (var i = 0; i < CHECK_KINDS.length; i++) if (CHECK_KINDS[i].re.test(s)) return true;\n    return false;',
    to: '    for (var i = 0; i < CHECK_KINDS.length; i++) if (CHECK_KINDS[i].re.test(s)) return true;\n    return true;',
    name: "核对记录被拒（署名不带位置）",
  },
  {
    label: "署名尺子把「日期」也算成位置（何时冒充了何处）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '  var CHECK_KINDS = KINDS.filter(function (k) { return k.key !== "dated"; });',
    to: '  var CHECK_KINDS = KINDS.slice();',
    name: "署名尺子确实剔掉了「日期」这一类",
  },
  {
    label: "篇目定位正则被改坏（规则死掉却仍在冒充判据）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '    { key: "chapter", label: "篇目", re: /《[^》]+·[^》]+》/ },',
    to: '    { key: "chapter", label: "篇目", re: /《[^》]+·[^》]+》ZZZ/ },',
    name: "规则已失效却在冒充判据",
  },
  /* ---- 著录编号（第六类）在四个抄本里的同步 ----
   * 这把尺子现在有四处副本：js/prov.js 的 KINDS（界面分级）、它的 CHECK_KINDS
   * （署名里的位置）、tools/validate.mjs 的 CHECK_BY_LOC_RE（入库门）、
   * tools/validate-story.mjs 的 LOCATORS（故事门）。浏览器文件不能 import 工具、
   * 工具不能 require 浏览器，所以对账只能逐串跑，哨兵则保证「对账」本身不是死代码。
   * 三条各打在一个真实分叉形态上：界面侧整类消失（分级退回五类、故事门仍放行）、
   * 故事门侧改哑（故事层说查得到底本、界面上却只给「仅书名」）、
   * 入库门侧丢掉分支（投稿进得来，徽章却不认这条核对记录）。
   * 下面还有三条对着「年第N期」这一支——同一把尺子的同一处，三个方向各打一次。 */
  {
    label: "prov.js 的「著录编号」整类被删（六类退回五类）",
    file: "js/prov.js",
    runner: "tools/test-story.mjs",
    from: '    { key: "numbered", label: "著录编号", re: /》\\s*\\d{1,6}(?:\\s*[、,，.．]\\s*\\d{1,6})+|》\\s*\\d{1,6}\\s*(?:[—–~－]|至)\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,4}[a-z](?![a-z])|》\\s*\\d{2,6}(?![\\d.])[^\\s\\d年月日—–~－/、，.．)）】至与]|》\\s*\\d{1,4}\\s*年第\\s*[0-9一二三四五六七八九十]{1,3}\\s*期/ },',
    to: '',
    name: "两侧的类别清单同名同序",
  },
  {
    label: "故事门的「著录编号」判据被改哑（门放行、界面降级）",
    file: "tools/validate-story.mjs",
    runner: "tools/test-story.mjs",
    from: '  { key: "numbered", re: /》\\s*\\d{1,6}(?:\\s*[、,，.．]\\s*\\d{1,6})+|》\\s*\\d{1,6}\\s*(?:[—–~－]|至)\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,4}[a-z](?![a-z])|》\\s*\\d{2,6}(?![\\d.])[^\\s\\d年月日—–~－/、，.．)）】至与]|》\\s*\\d{1,4}\\s*年第\\s*[0-9一二三四五六七八九十]{1,3}\\s*期/ },',
    to: '  { key: "numbered", re: /《不可能出现这本书》\\d{9}、\\d{9}/ },',
    name: "书名号＋连列编号在两侧都算「著录编号」定位",
  },
  {
    label: "入库门的署名位置判据丢掉「著录编号」分支",
    file: "tools/validate.mjs",
    runner: "tools/test-units.mjs",
    from: '|》\\s*\\d{1,6}(?:\\s*[、,，.．]\\s*\\d{1,6})+|》\\s*\\d{1,6}\\s*(?:[—–~－]|至)\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,6}\\s*[章条款篇号节项]|》\\s*\\d{1,4}[a-z](?![a-z])|》\\s*\\d{2,6}(?![\\d.])[^\\s\\d年月日—–~－\\/、，.．)）】至与]',
    to: '',
    name: "署名串「有没有写明位置」裁决完全一致",
  },
  /* 「年第N期」是著录编号里最晚补的一支（《文物》1975年第11期 这类发掘简报），
   * 它和已被防住的年跨度只差一个「期」字，所以三份副本各来一条：删掉这一支，
   * 相应那一份的自审必须当场变红——否则这一支就是个没人看着的特例。 */
  {
    label: "界面侧丢掉「年第N期」这一支（简报的核对记录被降级）",
    file: "js/prov.js",
    runner: "tools/test-units.mjs",
    from: '|》\\s*\\d{1,4}\\s*年第\\s*[0-9一二三四五六七八九十]{1,3}\\s*期',
    to: '',
    name: "真编号判为位置",
  },
  {
    label: "入库门丢掉「年第N期」这一支（门拦得住、界面抬得起）",
    file: "tools/validate.mjs",
    runner: "tools/test-units.mjs",
    from: '|》\\s*\\d{1,4}\\s*年第\\s*[0-9一二三四五六七八九十]{1,3}\\s*期',
    to: '',
    name: "署名串「有没有写明位置」裁决完全一致",
  },
  {
    label: "故事门丢掉「年第N期」这一支（两侧分级口径分叉）",
    file: "tools/validate-story.mjs",
    runner: "tools/test-story.mjs",
    from: '|》\\s*\\d{1,4}\\s*年第\\s*[0-9一二三四五六七八九十]{1,3}\\s*期',
    to: '',
    name: "两侧都算「著录编号」",
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
  /* ---- ICP 备案号（方案 B）：形状/处数/target/rel 四条判据与字色清单成员各自改哑 ---- */
  {
    label: "备案号形状判据改哑（任何文字都算合规编号）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "      if (!ICP_RE.test(inner)) e.push(",
    to: "      if (false && !ICP_RE.test(inner)) e.push(",
    name: "自审负例「不匹配工信部形状」",
  },
  {
    label: "备案号处数判据抬高（挂两处不再算错）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "      if (ms.length > 1) return [",
    to: "      if (ms.length > 9) return [",
    name: "自审负例「只该有一处」",
  },
  {
    label: "备案号的 target 判据改哑",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: '      if (!/target="_blank"/.test(tag)) e.push(',
    to: "      if (false) e.push(",
    name: "自审负例「没写 target」",
  },
  {
    label: "备案号的 rel/noopener 判据改哑",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: '      if (!/rel="[^"]*noopener/.test(tag)) e.push(',
    to: "      if (false) e.push(",
    name: "自审负例「noopener」",
  },
  {
    label: "css 删掉 .beian 的 color（备案号跟着状态条灰到底）",
    file: "css/layout.css",
    runner: "tools/test-units.mjs",
    from: ".statusbar .beian { color: var(--link); text-decoration: underline; }",
    to: ".statusbar .beian { text-decoration: underline; }",
    name: "备案号链接 .beian 也在这份字色清单里",
  },
  /* ---- 投稿分诊台 tools/intake.mjs（#54）：六道判据各自改哑，test-intake 必须点名 ----
   * 分诊台自己就是门。它的失效形状全是「不报错、不产坏数据，只是该拦的没拦」：
   * 查重不命中→并档造出双条目；白名单不登记→自封字段无声进入；空目录不判红→
   * 一整批投稿蒸发而 CI 全绿。所以每条都得单独被改哑验一遍。 */
  {
    label: "intake 查重器恒不命中（已存在的大事当新条目放行）",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "    if (a === b || a.includes(b) || b.includes(a) || sharedRatio(a, b) >= 0.6) hits.push(c.id + \":\" + c.title);",
    to: "    void 0;",
    name: "回喂已存在的大事必须 100% 被认成重复",
  },
  {
    label: "intake 白名单静默丢键（丢弃不上账）",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "  for (const k of Object.keys(rec)) if (!ALLOWED.head.includes(k)) { row.flags.push(`丢弃未知键 ${k}`); }",
    to: "  for (const k of Object.keys(rec)) if (!ALLOWED.head.includes(k)) { void 0; }",
    name: "顶层 confidence 被丢弃并登记",
  },
  {
    label: "intake 不再调站内合规判据（恒判合规）",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "  const errs = CC.checkRecord(clean);",
    to: "  const errs = [];",
    name: "year0.json 的拒绝理由点名",
  },
  {
    label: "intake 空清单不再判失败",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "  if (!rows.length) {",
    to: "  if (false) {",
    name: "空目录必须 rc=1",
  },
  {
    label: "intake 的出处定位判据恒空（升级通道被焊死）",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "  const kinds = PV.KINDS.filter(k => k.re.test(String(locator || \"\")));",
    to: "  const kinds = [];",
    name: "写到卷册页码的补出处标「可定位」",
  },
  {
    label: "intake 往 data/ 写文件（只读承诺被破）",
    file: "tools/intake.mjs",
    runner: "tools/test-intake.mjs",
    from: "  const { files, recs } = readFrom(FROM);",
    to: "  const { files, recs } = readFrom(FROM);\n  fs.writeFileSync(path.join(ROOT, \"data\", \".intake-probe\"), \"x\");",
    name: "跑完 intake 后 data/ 指纹一字未动",
  },
  /* ---- CI 与本地门清单 1:1（#54）：两侧解析各自改哑，兜底断言必须点名 ---- */
  {
    label: "CI 侧命令解析一条也匹配不到（空清单上「一处不少」恒真）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "const ciNames = (s) => [...s.matchAll(/node\\s+tools\\/([a-z0-9_-]+)\\.mjs/g)]",
    to: "const ciNames = (s) => [...s.matchAll(/node\\s+toolsZ\\/([a-z0-9_-]+)\\.mjs/g)]",
    name: "门清单两侧解析自审",
  },
  {
    label: "staging 清单取不到（缺声明时子集判据空转）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "const stagingMatch = /const STAGING_GATES = \\[([^\\]]*)\\]/.exec(pre);",
    to: "const stagingMatch = /const STAGING_GATESX = \\[([^\\]]*)\\]/.exec(pre);",
    name: "STAGING_GATES 取得到",
  },
  {
    label: "凭据判据改哑（永不命中，注释里那句「不部署」再没人兜）",
    file: "tools/test-units.mjs",
    runner: "tools/test-units.mjs",
    from: "  const CRED_RE = /secrets\\.|environment:|uses:[^\\n]*(deploy|publish)/i;",
    to: "  const CRED_RE = /secretsNEVER\\.|environmentNEVER:/i;",
    name: "凭据判据漏网",
  },
  /* 前三条验的是「解析坏了会不会红」；这条验的是判据本体的缺陷形态——CI 那侧真的少跑一门。
   * 变异打在 workflows 文件上而不是 test-units 上：门清单对账要抓的就是这个被删的动作。 */
  {
    label: "CI 少跑一道门（删掉 intake gate 那步）",
    file: ".github/workflows/gates.yml",
    runner: "tools/test-units.mjs",
    from: "      - name: intake gate\n        run: node tools/test-intake.mjs\n\n",
    to: "",
    name: "在 CI 里一处不少",
  },
  {
    label: "新增的 css 没挂进 index.html（磁盘扫描把它量了，页面却不生效）",
    file: "index.html",
    runner: "tools/test-units.mjs",
    from: '<link rel="stylesheet" href="css/story.css">',
    to: "",
    name: "每个样式表都被 index.html 链接",
  },
  /* 这条打在 atlas.css 上，而不是 components.css 上：字色扫描域从写死的四个文件
   * 改成磁盘现取之前，atlas.css 里的整套看点/地点样式从没被这把尺子量过——
   * 也就是说，这个缺陷形态当时改进去是测不出来的。现在它能了，所以要钉住。 */
  {
    label: "atlas.css 里拿点缀色当字色（旧名单扫不到这一层）",
    file: "css/atlas.css",
    runner: "tools/test-units.mjs",
    from: ".pl-w { flex: 0 0 auto; color: var(--gold-text);",
    to: ".pl-w { flex: 0 0 auto; color: var(--gold);",
    name: "css 里没有 color: var(--gold)",
  },
  /* 故事层的接线对账（test-story ⑱）必须自己能变红：内容门全绿而界面断了，
   * 读者看到的仍然是「没有小故事」，而 CI 一片绿。 */
  {
    label: "详情抽屉里摘掉「此事的小故事」",
    file: "js/detail.js",
    runner: "tools/test-story.mjs",
    from: "    if (window.ChronStory) html += ChronStory.block(ev);",
    to: "    void 0;",
    name: "详情抽屉里画了「此事的小故事」",
  },
  {
    label: "顶栏故事按钮的落点指错 id（写好了没接上）",
    file: "js/app.js",
    runner: "tools/test-story.mjs",
    from: '    $("btn-story").addEventListener("click", function () {',
    to: '    $("story-btn").addEventListener("click", function () {',
    name: "顶栏有故事按钮的点击落点",
  },
  {
    label: "故事抽屉只靠 hidden 属性收起（关掉后还杵在屏上）",
    file: "css/story.css",
    runner: "tools/test-story.mjs",
    from: ".story-drawer[hidden] { display: none; }",
    to: "/* 删掉：只留 hidden 属性 */",
    name: "显式 display:none",
  },
  {
    label: "界面 KINDS 少改一档（门改了名，界面那一档永远点不出来）",
    file: "js/story.js",
    runner: "tools/test-story.mjs",
    from: 'var KINDS = ["史载", "笔记异闻", "后世附会", "出土文献与档案"];',
    to: 'var KINDS = ["史载", "笔记异闻", "后世附会", "出土文献"];',
    name: "界面 KINDS 与门 KINDS 逐字相同",
  },
  {
    label: "舆图只靠 hidden 收起（关掉后全屏仍被它挡住并拦截点击）",
    file: "css/atlas.css",
    runner: "tools/test-units.mjs",
    from: ".atlas[hidden], .place-drawer[hidden], .frame-drawer[hidden] { display: none; }",
    to: "/* 删掉：只留 hidden 属性 */",
    name: "都有 [hidden]{display:none} 兜底",
  },
  {
    label: "兜底规则的选择器打错一个字母（写给了不存在的层）",
    file: "css/story.css",
    runner: "tools/test-units.mjs",
    from: ".story-drawer[hidden] { display: none; }",
    to: ".story-drawr[hidden] { display: none; }",
    name: "是空写的账",
  },
  {
    label: "舆图加载期按下的关被丢掉（数据一到，面板自己弹回来）",
    file: "js/atlas.js",
    runner: "tools/test-units.mjs",
    from: '"]).then(function (okAll) {\n      if (!wantOpen) return false;',
    to: '"]).then(function (okAll) {',
    name: "每个异步打开的面板都在 hidden=false 前问过",
  },
  {
    label: "wantOpen 只置真不清真（旗子永远写着「要开着」）",
    file: "js/frame.js",
    runner: "tools/test-units.mjs",
    from: "  function close() {\n    wantOpen = false;",
    to: "  function close() {",
    name: "都有一处把它清成 false",
  },
  {
    label: "详情里的复述覆盖写轻了一档（压不住 .detail .para p，两处两个色）",
    file: "css/story.css",
    runner: "tools/test-story.mjs",
    from: ".detail .para .st-scene { color: var(--ink); font-size: 13.4px; }",
    to: ".detail .st-scene { color: var(--ink); font-size: 13.4px; }",
    name: "每条 .detail 的段落覆盖权重都不低于",
  },
  {
    label: "故事抽屉收了却留着 #/story（刷新自己弹回来）",
    file: "js/story.js",
    runner: "tools/test-units.mjs",
    from: '    window.ChronRouter.resetHash(["#/story"]);',
    to: "    /* 删掉：只收面板不收地址 */",
    name: "close() 都把地址也收掉",
  },
  {
    label: "路由点名了一个不存在模块的缩写（扫描域静默少一层）",
    file: "js/router.js",
    runner: "tools/test-units.mjs",
    from: "ChronStory.open(",
    to: "ChronStor.open(",
    name: "都能按 window.Chron* 归到文件",
  },
  /* ---- 日层（#102）：这一层的接线对账由 test-dates ⑧ 验，改哑必须在这里现形。
   * 数据侧全绿而界面断一处，读者得到的仍是「没有今天」，CI 却一片绿。 ---- */
  {
    label: "今天的模块没被 index.html 挂上（孤儿文件）",
    file: "index.html",
    runner: "tools/test-dates.mjs",
    from: '<script src="js/today.js"></script>',
    to: "<!-- 忘了挂 -->",
    name: "日层的模块与样式都被 index.html 挂上",
  },
  {
    label: "顶栏今天按钮的落点指错 id（写好了没接上）",
    file: "js/app.js",
    runner: "tools/test-dates.mjs",
    from: '    $("btn-today").addEventListener("click", function () {',
    to: '    $("btn-todai").addEventListener("click", function () {',
    name: "顶栏有今天按钮的点击落点",
  },
  {
    label: "Esc 阶梯里漏掉今天抽屉（键盘用户关不掉）",
    file: "js/interaction.js",
    runner: "tools/test-dates.mjs",
    from: '        if (!floating && window.ChronToday && ChronToday.isOpen()) { ChronToday.close(); break; }\n',
    to: "",
    name: "Esc 阶梯里有今天抽屉",
  },
  {
    label: "界面 HOW_LABEL 少改一档（门改了名，出处纪日在页面上没了标签）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: '    "text-cn": "中文纪日"',
    to: '    "cn": "中文纪日"',
    name: "界面 HOW_LABEL 的键与门 HOWS 逐字相同",
  },
  {
    label: "历表分界被界面抄走一份（页面上写死 1583）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "    var PB = (dates() || {}).prolepticBefore;",
    to: "    var PB = 1583;",
    name: "js/today.js 里没有写死的历表分界年",
  },
  {
    label: "今天抽屉只靠 hidden 属性收起（关掉后还杵在屏上）",
    file: "css/today.css",
    runner: "tools/test-dates.mjs",
    from: ".td-drawer[hidden] { display: none; }",
    to: "/* 删掉：只留 hidden 属性 */",
    name: "显式 display:none",
  },
  {
    label: "切回时间轴不收今天抽屉（router 兜底分支漏一层）",
    file: "js/router.js",
    runner: "tools/test-dates.mjs",
    /* 锚串跟着兜底分支走：2026-11-10 编年抽屉接进来时这里多了一行 ChronAnnals.close()，
     * 锚串没跟上就报「变异锚串没匹配上」——那是本用例自己失效，不是被检代码出了问题。 */
    from: "      if (window.ChronStory) ChronStory.close();\n      if (window.ChronToday) ChronToday.close();\n      if (window.ChronAnnals) ChronAnnals.close();\n    }",
    to: "      if (window.ChronStory) ChronStory.close();\n      if (window.ChronAnnals) ChronAnnals.close();\n    }",
    name: "路由的兜底分支（切回时间轴）把今天抽屉一起收掉",
  },
  /* 页脚「空 N 天」的三个判据：旧写法在界面里自己数格子，把 4/31、6/31、9/31、11/31
   * 数成空着的日子（虚报 14，实况 10）。这三条各自改哑，看 test-dates 是否点名。 */
  {
    label: "界面恢复自己数日历格（4/31 被当成空一天）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "blanks: Number.isInteger(D.blankDays) ? D.blankDays : null,",
    to: "blanks: (function () { var n = 0; for (var m = 1; m <= 12; m++) for (var d = 1; d <= (m === 2 ? 29 : 31); d++) if (!recsFor(m, d).length) n++; return n; })(),",
    name: "js/today.js 不自己数日历格",
  },
  {
    label: "空天数被写成一个常量（日层改了它也不改）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "blanks: Number.isInteger(D.blankDays) ? D.blankDays : null,",
    to: "blanks: 10,",
    name: "页脚的空天数确实从日层读 D.blankDays",
  },
  {
    label: "读不到 blankDays 时印 0 而不是不说",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: '(st.blanks === null ? "" : "，空 " + st.blanks + " 天") +',
    to: '("，空 " + st.blanks + " 天") +',
    name: "读不到 blankDays 就省掉这半句",
  },
  /* 深链 #/today/4/31：日历上没有这一天。界面要么照实说，要么自己抄一份历表——
   * 抄的那份永远停在旧口径上，而照画的后果是一个会被当成史实的假日期。 */
  {
    label: "界面改抄一份历表（2 月 28 天，date-lib 改了它不知道）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "return D && Array.isArray(D.mdays) && m >= 1 && m <= 12 ? D.mdays[m - 1] : null;",
    to: "return [31,28,31,30,31,30,31,31,30,31,30,31][m - 1];",
    name: "js/today.js 里没有自己抄的历表",
  },
  {
    label: "不存在的日子照画（4 月 31 日直接当标题）",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "      if (exists === false) { ghost = { m: opts.m, d: opts.d }; day = todayMD(); }",
    to: "      if (exists === false) day = todayMD();",
    name: "不存在的日子落回读者的今天",
  },
  {
    label: "13 月这种越界月份被当成「日层没载入」放过去",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "    if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;",
    to: "    if (!Number.isInteger(m) || !Number.isInteger(d) || d < 1) return false;",
    name: "越界的月份（13 月）与越界的日（4/31）都判得出",
  },
  {
    label: "路由恢复自己抄一份历表（放过 4/31、吞掉 2/30）",
    file: "js/router.js",
    runner: "tools/test-dates.mjs",
    from: "      return { name: \"today\", params: (Number.isInteger(tm) && Number.isInteger(td)) ? { m: tm, d: td } : {} };",
    to: "      var ok = tm >= 1 && tm <= 12 && td >= 1 && td <= (tm === 2 ? 29 : 31);\n      return { name: \"today\", params: ok ? { m: tm, d: td } : {} };",
    name: "js/router.js 不自己抄历表",
  },
  {
    label: "删掉「这个日子不存在」那句说明",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: `    if (ghost) {
      var gLen = monthLen(ghost.m);
      parts.push('<div class="td-bad">链接里写的是 ' + ghost.m + ' 月 ' + ghost.d + ' 日，可' +
        (gLen === null ? "一年只有 12 个月" : "这个月只有 " + gLen + " 天") +
        "——本站不替它编一天，已按今天（" + m + " 月 " + d + " 日）打开。</div>");
    }\n`,
    to: "",
    name: "页面当着读者说出「这个日子不存在」",
  },
  {
    label: "空白天的铺成长河点了不响",
    file: "js/today.js",
    runner: "tools/test-dates.mjs",
    from: "      window.ChronDetail.flash && window.ChronDetail.flash(\"这一天本库没有可核对的纪日，长河铺不出来\", 4000);\n",
    to: "",
    name: "空白天的「铺成长河」有话说",
  },
  /* —— 「此后」钩子（详情底部三年后/三十年后/这些人后来）—— */
  {
    label: "详情不再拼入「此后」（函数写好了没人调）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    html += laterBlock(ev);\n",
    to: "",
    name: "renderEvent 真的把「此后」拼进详情",
  },
  {
    label: "口径说明没了样式（那句「不是因果」混成正文字号）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".detail .d-hint { font-size: 11.6px; line-height: 1.7; color: var(--ink-soft); margin-top: 3px; }\n",
    to: "",
    name: ".d-hint 没定义时",
  },
  {
    label: "口径说明淡成 --ink-faint（11.6px 小字 3.15:1，读者读不到那句「不是因果」）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".detail .d-hint { font-size: 11.6px; line-height: 1.7; color: var(--ink-soft);",
    to: ".detail .d-hint { font-size: 11.6px; line-height: 1.7; color: var(--ink-faint);",
    name: "「.detail .d-hint」字色",
  },
  {
    label: "口径说明字色写成死值（脱离令牌后静默滑出字色清单，与 .ep-we 同一形态）",
    file: "css/components.css",
    runner: "tools/test-units.mjs",
    from: ".detail .d-hint { font-size: 11.6px; line-height: 1.7; color: var(--ink-soft);",
    to: ".detail .d-hint { font-size: 11.6px; line-height: 1.7; color: #8d8271;",
    name: "也在这份字色清单里",
  },
  {
    label: "「三年后」格不再限量（钩子退化成年表）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "  var LATER_CAPS = { three: 3, thirty: 2, people: 3 };",
    to: "  var LATER_CAPS = { three: 5, thirty: 2, people: 3 };",
    name: "「三年后」格取满 3 条即止",
  },
  {
    label: "三年窗放宽到四年（把 1904 说成这条的三年后）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "  var LATER_WINDOWS = { three: [1, 3], thirty: [4, 30], people: [1, 30] };",
    to: "  var LATER_WINDOWS = { three: [1, 4], thirty: [4, 30], people: [1, 30] };",
    name: "三格的时间窗（年差、含两端）",
  },
  {
    label: "「三十年后」从最近的一年开始收（标题承诺三十年、行里给的是四年后）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "farFirst: true });",
    to: "farFirst: false });",
    name: "「三十年后」的两个名额从窗口远端收下",
  },
  {
    label: "调用处把年份又抄了一遍（改表时页面还念旧数）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    var three = ahead(ev, W.three[0], W.three[1], {});",
    to: "    var three = ahead(ev, 1, 3, {});",
    name: "laterPick 三处窗口全从 LATER_WINDOWS 取",
  },
  {
    label: "口径句里的年份写成死数字（表改了那句还报 1–3）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    parts.push('<div class=\"para\"><div class=\"d-hint\">「三年后」取本条之后 ' + W.three[0] + '–' + W.three[1] + ' 年的同轨条目，' +",
    to: "    parts.push('<div class=\"para\"><div class=\"d-hint\">「三年后」取本条之后 1–3 年的同轨条目，' +",
    name: "口径句里的年份也从表里取",
  },
  {
    label: "三十年格放开维度（异维的事冒充本条的后续）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    var thirty = ahead(ev, W.thirty[0], W.thirty[1], { sameDim: true, exclude: seen, farFirst: true });",
    to: "    var thirty = ahead(ev, W.thirty[0], W.thirty[1], { exclude: seen, farFirst: true });",
    name: "三十年格只收同一维度",
  },
  {
    label: "钩子绕过溯源门槛（顶栏筛了、这一格照给）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "      if (!S.passesFilter(e)) continue;",
    to: "      if (false) continue;",
    name: "被溯源门槛筛掉的条目不进「此后」",
  },
  {
    label: "窗口空了也照样出格（硬凑一条邻近）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "    if (laterEmpty(pick)) return \"\";",
    to: "    if (false) return \"\";",
    name: "全空时整格不出",
  },
  /* ---- 正文内联引用与相对年份（XREF_DANGLING / REL_YEAR）----
   * 这对门管的是散文里手写的「（见 cn--xxxx）」：related 那几道门一条都看不见它，
   * 而年差算错时读者按那句话去换算，得到的正好是错的那一年。四条变异各对应
   * tools/test-gates.mjs 五·乙 里的一条用例——判据哑、扫描域缩到只认括号、
   * 多目标只算第一个、断链不报，四种失效方式都必须在这里现形。 */
  {
    label: "REL_YEAR 不再比对年差（相对年份怎么写都不红）",
    file: "tools/validate.mjs",
    from: '            const delta = target.year - anchor;\n            if (delta !== n)',
    to: '            const delta = target.year - anchor;\n            if (false && delta !== n)',
    name: "REL_YEAR 可红（指错条目）",
  },
  {
    label: "XREF_DANGLING 恒不报（正文引用指向作废 id 也看不见）",
    file: "tools/validate.mjs",
    from: '          if (!idSet.has(m[0])) E(c.id, "XREF_DANGLING",',
    to: '          if (false && !idSet.has(m[0])) E(c.id, "XREF_DANGLING",',
    name: "XREF_DANGLING 可红",
  },
  {
    label: "REL_YEAR 只认带括号的引用（裸「见 id」18 处出扫描域）",
    file: "tools/validate.mjs",
    from: '(?:（见|见)',
    to: '（见',
    name: "裸「见 id」也在扫描域内",
  },
  {
    label: "REL_YEAR 多目标只算第一个 id（「见 a、b」的 b 永不入检）",
    file: "tools/validate.mjs",
    from: 'for (const id of m[4].split("、")) {',
    to: 'for (const id of [m[4].split("、")[0]]) {',
    name: "多目标（见 a、b）逐个算",
  },
  /* ---- 注入看门狗的两个预算与缺片出路（test-units ⑪⑫⑬ + 补齐轮数）----
   * 托管上线后 28/29 片就是这么红的：夹具里 60ms 的看门狗什么都测得出来，
   * 真实 8 s 却在慢网下一片都不够。数字本身、数字的唯一出处、判死之后的出路，
   * 三样各配一条变异——少一条，对应的断言就可能是不会红的门。 */
  {
    label: "宽预算改回 8 s（慢网下整批判死，夹具里照样全绿）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "  var INJECT_TIMEOUT = window.__CHRONICLE_INJECT_TIMEOUT || 30000;",
    to: "  var INJECT_TIMEOUT = window.__CHRONICLE_INJECT_TIMEOUT || 8000;",
    name: "宽预算要罩得住最大那片",
  },
  {
    label: "两个预算改反（首屏等满 90 s，后台 18 s 就判死）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "  var FIRST_TRY_TIMEOUT = window.__CHRONICLE_FIRST_TRY_TIMEOUT || 18000;",
    to: "  var FIRST_TRY_TIMEOUT = window.__CHRONICLE_FIRST_TRY_TIMEOUT || 90000;",
    name: "必须大于首屏预算",
  },
  {
    label: "某一层把预算改回字面量（五处各自漂移的账又回来了）",
    file: "js/geo.js",
    runner: "tools/test-units.mjs",
    from: "var INJECT_TIMEOUT = window.__CHRONICLE_GEO_TIMEOUT || window.ChronLoader.injectTimeout;",
    to: "var INJECT_TIMEOUT = window.__CHRONICLE_GEO_TIMEOUT || 8000;",
    name: "js/geo.js 的看门狗要从 ChronLoader 取",
  },
  {
    label: "脚本顺序门切不出 loader（at() 恒 -1，顺序断言全在空转）",
    file: "index.html",
    runner: "tools/test-units.mjs",
    from: '<script src="js/loader.js"></script>',
    to: "",
    name: "切得出 js/loader.js",
  },
  {
    label: "ensureAll 退回全并发（首屏刚省下的带宽被一次性占满）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "      return loadInBatches(mf.chunks, until);",
    to: "      return Promise.all(mf.chunks.map(function (c) { return loadChunk(c); })).then(sum);",
    name: "ensureAll 的并发峰值须有封顶",
  },
  {
    label: "一轮补齐后不再排下一轮（超时判死＝永久少一片）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: `        if (left && round + 1 < TOPUP_MAX_ROUNDS) {
          console.warn("[app] 仍有 " + left + " 片未载入，" +
            (TOPUP_BACKOFF_MS[round] || 20000) + "ms 后第 " + (round + 2) + " 轮补齐");
          setTimeout(function () { topUpOnIdle(round + 1); },
            TOPUP_BACKOFF_MS[round] || 20000);
        }`,
    /* 只把条件改成 false 是假门：守卫的正则还在，剩下的块体成了死代码，
     * 测试照样绿。要验的是「排下一轮这件事真的没了」，所以必须掏空块体、留住宿主。 */
    to: `        if (left && round + 1 < TOPUP_MAX_ROUNDS) { /* 变异：守卫还在，下一轮不排了 */ }`,
    name: "一轮补齐后仍有缺片必须再排一轮",
  },
  {
    label: "补齐轮数没有上限（404 那片每轮都红，定时器永不停）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: "        if (left && round + 1 < TOPUP_MAX_ROUNDS) {",
    to: "        if (left) {",
    name: "重试轮数必须有上限",
  },
  {
    label: "until 守卫被删（这一条早到手，还要把整串取完）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "      if (until && until()) return n;",
    to: "      if (false) return n;",
    name: "首批 3 片落地即命中",
  },
  {
    label: "until 写成恒真（深链兜底静默变成只取头一批）",
    file: "js/loader.js",
    runner: "tools/test-units.mjs",
    from: "      if (until && until()) return n;",
    to: "      if (true) return n;",
    name: "永不命中时仍要把 5 片取完",
  },
  {
    label: "深链不再传 until（为一把钥匙等整串又回来了）",
    file: "js/detail.js",
    runner: "tools/test-units.mjs",
    from: "L.ensureAll(function () { return !!L.eventById(id); })",
    to: "L.ensureAll()",
    name: "js/detail.js 的深链兜底",
  },
  {
    label: "「进入长河」又落回星点画布（按钮文案与首屏不符）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: '      if (!h || h === "#" || h === "#/" || h === "#/timeline") window.ChronRouter.go("#/river");',
    to: '      if (!h || h === "#") window.ChronRouter.go("#/timeline");',
    name: "点击「进入长河」要落到长河视图",
  },
  {
    label: "进门无条件改写地址栏（深链读者被拽回总览）",
    file: "js/app.js",
    runner: "tools/test-units.mjs",
    from: '      var h = location.hash;\n      if (!h || h === "#" || h === "#/" || h === "#/timeline") window.ChronRouter.go("#/river");',
    to: '      window.ChronRouter.go("#/river");',
    name: "落到长河之前要先读地址栏",
  },
  /* ---- 明史编年层：juanNum 的汉字条例法 ----
   * 卷题是读者拿去翻页的那串字，维基文库把 145 写成「一百四五」、201 写成「二百〇一」，
   * juanNum 的四条例法若只在一支上有测试，另三支改坏也没人看见。
   * 夹具（test-annals）里 45/145/201/218/245/305 六卷按页上原样登记，所以这里改坏解析器
   * 会让门在基准数据上就判红，九条边界用例跟着全部失败——不靠生产盘上的 330 卷才能露出来。 */
  {
    label: "juanNum 的「省十」例法写反（一百四五读成一五四）",
    file: "tools/mingshi-lib.mjs",
    runner: "tools/test-annals.mjs",
    from: "  return ds.length === 2 ? total + ds[0] * 10 + ds[1] : null;",
    to: "  return ds.length === 2 ? total + ds[0] + ds[1] * 10 : null;",
    name: "卷题三种合法形状各自判绿",
  },
  {
    label: "juanNum 不认〇/零占位（二百〇一直接判死）",
    file: "tools/mingshi-lib.mjs",
    runner: "tools/test-annals.mjs",
    from: "  if (zm) return total + CN[zm[1]];",
    to: "  if (zm) return null;",
    name: "卷题三种合法形状各自判绿",
  },
];

let ok = 0;
/* META_ONLY=子串：只跑 label 含该串的用例。整批每一条都要重跑一遍对应的自审器（约 1 分钟/条，
   全批以小时计；条数不写在这里，收尾行按 CASES 实数报），改一条门时无差别全跑等于不验；
   留这个开关是为了能当场复跑受影响的那两三条。全量仍由 predeploy/CI 负责。 */
const ONLY = process.env.META_ONLY;
const CASES_RUN = ONLY ? CASES.filter((c) => c.label.includes(ONLY)) : CASES;
if (ONLY) console.log(`META_ONLY=「${ONLY}」：${CASES_RUN.length}/${CASES.length} 条`);
for (const c of CASES_RUN) {
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
console.log(`\n${ok}/${CASES_RUN.length} 个死门被对应的自审器抓到${ONLY ? `（META_ONLY 局部跑，不代表全批 ${CASES.length} 条通过）` : ""}`);
if (ok === CASES_RUN.length) fs.rmSync(TMP, { recursive: true, force: true });
else console.log(`现场保留于 ${TMP}`);
process.exit(ok === CASES_RUN.length ? 0 : 1);
