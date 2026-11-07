/* test-story.mjs | validate-story 的可红性自审：十三个检查码都要被定向打红一次
 * 用法: node tools/test-story.mjs
 *
 * 故事层是本站唯一自己写句子的层，所以这里的用例全是「句子怎么写坏」的动作：
 * 把大意标成原文、把掌故标成史载、把年份抄进故事里、把评价词漏进复述、
 * 把锚点指到一条不存在的条目、把分片的全局名写错。
 *
 * 夹具为什么要有 9 片 × 32 条：COVERAGE 线是 9 片 / 280 条 / 单片 14 条，
 * 小夹具永远站在红线以下，那样的「变红」证明不了任何事——只能证明夹具本来就小。
 * 所以夹具按生产形态铺满，再用删除动作把它推下去。
 *
 * mustGreen 那几条不是凑数：verbatim 的豁免只绑逐字引、评价词的豁免只绑引号对内，
 * 这两条边界如果被写坏，门会从「抓错」变成「一直叫」，那和没有门一样糟。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const failures = [];
/* 汇总里报的是「实际打红过几个码、验过几条豁免」，不写死数字——
 * 写死的计数会在下一次加用例时变成一句假话。 */
const codesRed = new Set(); let greens = 0;
function ok(c, n) { if (c) pass++; else { fail++; failures.push("✗ " + n); } }

const CHUNKS = 9, PER = 32;                 /* 9 片 × 32 条 = 288，压在 280 线之上 */
const KINDS = ["史载", "笔记异闻", "后世附会", "出土文献与档案"];
const LOC = "《夹具书·卷三》";               /* 篇目复合＝可定位 */
const TITLED = "《夹具书》";                 /* 只到书名＝不可定位 */

function anchorId(i) {
  const track = i % 2 === 0 ? "cn" : "world";
  return `${track}--${1000 + i}--p01`;
}
/* 锚点条目：故事层的年份与朝代全靠它，所以它的 sources 就是全层的天花板。 */
function mkAnchor(i, titled) {
  const year = 1000 + i;
  const track = i % 2 === 0 ? "cn" : "world";
  return {
    id: anchorId(i), track, year, yearApprox: false, dim: "politics", weight: 4,
    title: `夹具条目${i}`, summary: `夹具摘要${i}`,
    detail: { background: "缘起。", process: "经过。", impact: "影响。",
      figures: [], place: "某地", state: "某",
      sources: titled ? [TITLED] : [LOC], tags: ["夹具"] },
    related: [],
  };
}
/* 故事条目：默认全合规，用例在它上面做减法或做替换。 */
function mkStory(ci, i) {
  const k = i % 8 === 0 ? KINDS[1] : i % 8 === 3 ? KINDS[2] : i % 11 === 5 ? KINDS[3] : KINDS[0];
  const e = {
    id: `st-c${ci}-${String(i + 1).padStart(3, "0")}`,
    ev: anchorId(ci * PER + i),
    kind: k,
    title: `夹具故事${ci}-${i}`,
    people: ["某人", "另一人"],
    scene: `此段为白话复述，记其与某人往复之事，不作评价。`,
    src: [LOC],
    caveat: "此条为夹具用例，数字与名目皆假。",
  };
  if (i % 4 === 0) { e.quote = "夹具引文一句"; e.quoteState = "verbatim"; }
  else if (i % 4 === 2) { e.quote = "夹具大意一句"; e.quoteState = "paraphrase"; e.src = [TITLED]; }
  if (k === "出土文献与档案") e.find = "某遗址某号，某馆藏。";
  return e;
}

function dumpChunk(id, list) {
  /* 守卫行必须逐片都写——漏了它，浏览器里前一片把全局建好，毛病就藏住了。 */
  return `window.__CHRONICLE_STORY_CHUNK = window.__CHRONICLE_STORY_CHUNK || {};\n` +
    `window.__CHRONICLE_STORY_CHUNK[${JSON.stringify(id)}] = ${JSON.stringify(list, null, 1)};\n`;
}

function fixture(mutate, opts) {
  const o = Object.assign({ nosh: 12, verbatimLoose: false }, opts || {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-story-"));
  fs.mkdirSync(path.join(dir, "data/cn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/wd"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/story"), { recursive: true });

  const anchors = [];
  const chunks = [];
  for (let ci = 0; ci < CHUNKS; ci++) {
    const list = [];
    for (let i = 0; i < PER; i++) {
      const idx = ci * PER + i;
      /* 大多数锚点给到篇目级，只留 o.nosh 条连出处都没有——给 ANCHOR_PROV 留靶子，
       * 但基线夹具里全给足，免得「基线判绿」这一步就先红。 */
      anchors.push(mkAnchor(idx, false));
      list.push(mkStory(ci, i));
    }
    chunks.push({ id: `c${ci}`, file: `c${ci}.js`, label: "夹具片" + ci, list });
  }
  const data = { anchors, chunks };
  if (mutate) mutate(data);

  fs.writeFileSync(path.join(dir, "data/cn/cn-01.js"),
    `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
    `window.__CHRONICLE_CHUNK["cn-01"] = ${JSON.stringify(data.anchors.filter((a) => a.track === "cn"), null, 1)};\n`);
  fs.writeFileSync(path.join(dir, "data/wd/wd-01.js"),
    `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
    `window.__CHRONICLE_CHUNK["wd-01"] = ${JSON.stringify(data.anchors.filter((a) => a.track === "world"), null, 1)};\n`);
  /* 落盘用 c.file，登记册用 c.reg（默认同名；reg=false 表示干脆不登记）。三者分开的权力
   * 是留给 MANIFEST 那两个用例的：只改一边才叫「磁盘与登记册不一一对应」，两边一起改仍是自洽的。 */
  for (const c of data.chunks) fs.writeFileSync(path.join(dir, "data/story", c.file), dumpChunk(c.id, c.list));
  fs.writeFileSync(path.join(dir, "data/story/manifest.js"),
    `window.__CHRONICLE_STORY_MANIFEST = ${JSON.stringify(
      { version: 1, label: "夹具", chunks: data.chunks.filter((c) => c.reg !== false).map((c) => ({ id: c.id, file: c.reg || c.file, label: c.label })) }, null, 1)};\n`);
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-story.mjs"), "--root", dir], { encoding: "utf8" });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function mustRed(name, code, mutate, opts) {
  const dir = fixture(mutate, opts);
  const { rc, out } = run(dir);
  const hit = rc === 1 && out.includes(code);
  /* 只记真打红的码：用例本身失败时不能顺手把「这个码有守卫」写进账。 */
  if (hit) codesRed.add(code);
  ok(hit, `${name} → 变红并点名 ${code}`);
  if (!hit) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 6).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}
function mustGreen(name, mutate, opts) {
  const dir = fixture(mutate, opts);
  const { rc, out } = run(dir);
  if (rc === 0) greens++;
  ok(rc === 0, `${name} → 判绿（rc=${rc}）`);
  if (rc !== 0) failures.push("    实得红：\n" + out.split("\n").slice(-8).join("\n"));
  fs.rmSync(dir, { recursive: true, force: true });
}
/* 直接改磁盘上的夹具文件：测的是「文件形态」的坏，而不是数据的坏。 */
function mustRedFile(name, code, file, edit) {
  const dir = fixture();
  const p = path.join(dir, "data/story", file);
  fs.writeFileSync(p, edit(fs.readFileSync(p, "utf8")));
  const { rc, out } = run(dir);
  const hit = rc === 1 && out.includes(code);
  if (hit) codesRed.add(code);
  ok(hit, `${name} → 变红并点名 ${code}`);
  if (!hit) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 6).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------- ⓪ 正控制 ---------- */
mustGreen("夹具基线判绿（288 条 / 9 片）");

/* ---------- ① 注入器自审：门真在读这两份文件 ---------- */
mustRedFile("故事分片的全局名写错", "STORY_SCHEMA", "c0.js",
  (t) => t.replace(/__CHRONICLE_STORY_CHUNK/g, "__CHRONICLE_STORY_CHUNKZ"));
mustRedFile("manifest 的全局名写错", "STORY_MANIFEST", "manifest.js",
  (t) => t.replace("__CHRONICLE_STORY_MANIFEST", "__CHRONICLE_STORY_MANIFESTZ"));
/* 今日在生产数据里真撞到过的那颗雷：分片少了 `|| {}` 守卫。
 * 在浏览器里它不发作（前一片已把全局建好），只有逐片单独求值才现形。 */
mustRedFile("分片少了 window.__CHRONICLE_STORY_CHUNK = ... || {} 守卫", "STORY_SCHEMA", "c3.js",
  (t) => t.replace("window.__CHRONICLE_STORY_CHUNK = window.__CHRONICLE_STORY_CHUNK || {};\n", ""));
/* 语法错误同样必须被抓住，而不是把门一起拖死。 */
mustRedFile("分片有语法错误时门仍出结论", "STORY_SCHEMA", "c5.js", (t) => t.replace(/\];\n$/, "\n"));

/* ---------- ② STORY_MANIFEST：磁盘与登记册必须一一对应 ---------- */
mustRed("分片在磁盘上但没登记（界面按 manifest 注入，永加载不到）", "STORY_MANIFEST",
  (d) => { d.chunks[8].reg = false; });
mustRed("manifest 登记了磁盘上没有的分片（注入会 404）", "STORY_MANIFEST",
  (d) => { d.chunks[7].reg = "ghost.js"; });
/* 只改一边才叫漂移。分片改名时磁盘与 manifest 一起改，仍是自洽的——
 * 这条用例挡住的是「门按文件名死记而不是真比对」这种假门。 */
mustGreen("分片改名但磁盘与 manifest 一起改（仍一一对应）",
  (d) => { d.chunks[6].file = "c6-renamed.js"; d.chunks[6].reg = "c6-renamed.js"; });

/* ---------- ③ STORY_SCHEMA ---------- */
mustRed("故事里存了 year（年份由锚点派生，不许各存一份）", "STORY_SCHEMA",
  (d) => { d.chunks[0].list[1].year = 1001; });
mustRed("故事里存了 dynasty", "STORY_SCHEMA", (d) => { d.chunks[0].list[2].dynasty = "宋"; });
mustRed("缺 src（没有底本的小故事不许进这层）", "STORY_SCHEMA",
  (d) => { delete d.chunks[1].list[1].src; });
mustRed("people 是空数组", "STORY_SCHEMA", (d) => { d.chunks[1].list[3].people = []; });
mustRed("id 形态不合 st-<分片>-<三位>", "STORY_SCHEMA",
  (d) => { d.chunks[2].list[0].id = "st-c2-1"; });
mustRed("title 超 40 字（抽屉一行放不下）", "STORY_SCHEMA",
  (d) => { d.chunks[2].list[4].title = "很长" .repeat(21); });
mustRed("一条故事写成了两个对象之外的形态（scene 空串）", "STORY_SCHEMA",
  (d) => { d.chunks[3].list[5].scene = "   "; });

/* ---------- ④ STORY_DUP ---------- */
mustRed("同一 id 出现两次", "STORY_DUP",
  (d) => { d.chunks[4].list[6].id = d.chunks[4].list[7].id; });

/* ---------- ⑤⑥ 锚点 ---------- */
mustRed("ev 指向不存在的条目", "STORY_ANCHOR",
  (d) => { d.chunks[5].list[1].ev = "cn--9999--p01"; });
mustRed("锚点自己只到书名仍可锚（证明本码只查有无出处）", "STORY_ANCHOR", (d) => {
  /* 这不是豁免用例：把锚点整条删掉，故事就悬空了。 */
  d.anchors = d.anchors.filter((a) => a.id !== d.chunks[5].list[2].ev);
});
mustRed("锚点没有任何 sources（年份与场面都锚不住）", "STORY_ANCHOR_PROV",
  (d) => { const ev = d.chunks[6].list[1].ev; d.anchors.find((a) => a.id === ev).detail.sources = []; });

/* ---------- ⑦ STORY_KIND ---------- */
mustRed("kind 自造一个第五类", "STORY_KIND",
  (d) => { d.chunks[0].list[9].kind = "民间传说"; });

/* ---------- ⑧ STORY_QUOTE ---------- */
mustRed("有 quote 却没有 quoteState", "STORY_QUOTE",
  (d) => { delete d.chunks[1].list[0].quoteState; });
mustRed("有 quoteState 却没有 quote", "STORY_QUOTE",
  (d) => { const e = d.chunks[1].list[4]; delete e.quote; e.quoteState = "verbatim"; });
mustRed("quoteState 写了第三种值", "STORY_QUOTE",
  (d) => { d.chunks[1].list[8].quoteState = "通作"; });

/* ---------- ⑨ STORY_PROV：全层最要命的一条 ---------- */
/* 「大意」冒充「原文」只有一种写法能成立：出处只到书名。这一格红不红，
 * 决定读者能不能把「原文」两个字当回事。 */
mustRed("标 verbatim 但出处只到书名", "STORY_PROV",
  (d) => { const e = d.chunks[2].list[0]; e.quote = "夹具引文"; e.quoteState = "verbatim"; e.src = [TITLED]; });
mustGreen("同一句改成 paraphrase 就合法（宁少标十个原文）",
  (d) => { const e = d.chunks[2].list[0]; e.quoteState = "paraphrase"; e.src = [TITLED]; });

/* ---------- ⑩⑪ CAVEAT / FIND ---------- */
mustRed("笔记异闻不写 caveat", "STORY_CAVEAT",
  (d) => { const e = d.chunks[3].list[0]; e.kind = "笔记异闻"; delete e.caveat; });
mustRed("后世附会不写 caveat", "STORY_CAVEAT",
  (d) => { const e = d.chunks[3].list[1]; e.kind = "后世附会"; e.caveat = "  "; });
mustRed("出土文献与档案不写 find", "STORY_FIND",
  (d) => { const e = d.chunks[3].list[2]; e.kind = "出土文献与档案"; delete e.find; });

/* ---------- ⑫ STORY_STANCE ---------- */
mustRed("评价词漏进复述", "STORY_STANCE",
  (d) => { d.chunks[4].list[2].scene = "这是一项辉煌的成就，令人自豪。"; });
mustGreen("同一评价词落在引号对内（转述原文合法）", (d) => {
  d.chunks[4].list[2].scene = "时人称之为「辉煌的成就」。";
});
mustGreen("书名号里的专名带评价字不误报", (d) => {
  d.chunks[4].list[3].scene = "其说见《伟大征程》一书。";
});

/* ---------- ⑬ STORY_SUPERLATIVE ---------- */
mustRed("说「最早」却不给 caveat", "STORY_SUPERLATIVE",
  (d) => { const e = d.chunks[5].list[3]; e.scene = "此为世间最早之例。"; delete e.caveat; });
mustGreen("说「最早」并写了凭什么", (d) => {
  d.chunks[5].list[3].scene = "此为现存实物中最早之例。";
  d.chunks[5].list[3].caveat = "「最早」以出土品为限，文献记载另有更早之说。";
});

/* ---------- ⑭ STORY_COVERAGE ---------- */
mustRed("一整个分片被删（片数与总数同时塌）", "STORY_COVERAGE",
  (d) => { d.chunks = d.chunks.slice(0, 8); });
mustRed("某分片被削到 14 条以下", "STORY_COVERAGE",
  (d) => { d.chunks[6].list = d.chunks[6].list.slice(0, 13); });
mustGreen("削到 280 条整（贴线不越线）",
  (d) => { d.chunks[0].list = d.chunks[0].list.slice(0, 24); });

/* ---------- ⑮ kind 分布哨兵 ---------- */
mustRed("全层 100% 史载（等于没做过任何史料学判断）", "STORY_KIND",
  (d) => { for (const c of d.chunks) for (const e of c.list) { e.kind = "史载"; } });

/* ---------- ⑯ 生产数据实测 ---------- */
{
  const { rc, out } = run(ROOT);
  ok(rc === 0, `真实故事层判绿\n${out.split("\n").slice(-2).join("\n")}`);
  const m = /故事层：(\d+) 条 \/ (\d+) 片（史载 (\d+)、逐字引 (\d+)、含注 (\d+)）/.exec(out);
  ok(!!m && Number(m[1]) >= 280, `真实条数 ${m ? m[1] : "?"} ≥ 280`);
  ok(!!m && Number(m[3]) / Number(m[1]) <= 0.9, `史载占比 ${m ? (Number(m[3]) / Number(m[1]) * 100).toFixed(1) + "%" : "?"} ≤ 90%`);
  ok(!!m && Number(m[5]) === Number(m[1]), `每条都有 caveat（含注 ${m ? m[5] : "?"} ＝ 总条数 ${m ? m[1] : "?"}）`);
}

/* ---------- ⑰ 用例对检查码清单的覆盖率 ---------- */
/* 清单不在这里抄一份——抄的那份会在下一个人加码时静默过期，于是「13 个码全打红」
 * 变成一句假话。两个来源现取并核对：头部注释里登记的，和 bad() 里真发出去的。
 * 只加注释不发码（写了不做的门）与只发码不注释（做了不说的门）都会在这里露出。 */
{
  const src = fs.readFileSync(path.join(ROOT, "tools", "validate-story.mjs"), "utf8");
  const declared = [...src.matchAll(/^\s+\*\s+(STORY_[A-Z_]+)\s{2,}\S/gm)].map((m) => m[1]);
  const emitted = [...src.matchAll(/\bbad\(\s*"(STORY_[A-Z_]+)"/g)].map((m) => m[1]);
  const dset = new Set(declared), eset = new Set(emitted);
  const onlyDoc = [...dset].filter((c) => !eset.has(c));
  const onlyCode = [...eset].filter((c) => !dset.has(c));
  ok(!onlyDoc.length && !onlyCode.length,
    `检查码清单自洽：注释 ${dset.size} 个 / bad() 实发 ${eset.size} 个` +
    (onlyDoc.length || onlyCode.length ? `（只在注释：${onlyDoc.join(",")}；只在代码：${onlyCode.join(",")}）` : ""));
  const all = new Set([...dset, ...eset]);
  const uncovered = [...all].filter((c) => !codesRed.has(c));
  ok(!uncovered.length, `每个检查码都有定向打红的用例（共 ${all.size} 个）` +
    (uncovered.length ? `（未覆盖：${uncovered.join(",")}）` : ""));
}

/* ---------- ⑱ 界面接线：门判得再对，没人渲染就等于这层不存在 ----------
 * 上面的用例全在 data/story 上做文章；这一节盯着 js/ 与 index.html。
 * 判据一律从文件里现取，不抄行数、不抄 z 值：改动即换结论。 */
{
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const html = read("index.html");
  const app = read("js/app.js"), detail = read("js/detail.js"),
        route = read("js/router.js"), keys = read("js/interaction.js"),
        story = read("js/story.js"), css = read("css/story.css");

  ok(html.includes('<script src="js/story.js"></script>') && html.includes('href="css/story.css"'),
     "故事层的模块与样式都被 index.html 挂上（孤儿文件＝功能不存在）");
  ok(/ChronStory\.block\(/.test(detail) && /if \(window\.ChronStory\) html \+= ChronStory\.block\(ev\);/.test(detail),
     "详情抽屉里画了「此事的小故事」：故事要贴着条目出现，不是只有抽屉");
  ok(/ChronStory\.handleDetailClick\(/.test(detail) && /\[data-st\]/.test(detail),
     "详情的点击委托把 st-* 那一笔交回故事层（选择器里没有 data-st 就永远轮不到它）");
  ok(/name === "story"/.test(route) && /ChronStory\.open\(/.test(route),
     "路由认得 #/story：parse 有分支、apply 有落点（缺一个就是打不开的深链）");
  ok(/ChronStory\.isOpen\(\)[\s\S]{0,40}ChronStory\.close\(\)/.test(keys),
     "Esc 阶梯里有故事抽屉（不收它，键盘用户关不掉这一层）");
  ok(/case "s": case "S":/.test(keys) && /ChronStory\.open\(\{\}\)/.test(keys),
     "有 s/S 开关故事抽屉，且与顶栏按钮同一条 open() 路径");
  ok(/\$\("btn-story"\)\.addEventListener/.test(app) && /\$\("btn-story"\)\.classList\.toggle/.test(app),
     "顶栏有故事按钮的点击落点，且亮灭在 syncToggles 里由状态反推（只在回调里改类名会停在写死的默认值上）");

  /* kind 名单两侧必须同源：门改了名而界面还用旧名，卡片会全落进兜底样式、
   * 筛选栏也点不出那一档——数据侧全绿，界面上却少一类故事。 */
  const vSrc = read("tools/validate-story.mjs");
  const gv = /const KINDS = \[([^\]]+)\]/.exec(vSrc), gs = /var KINDS = \[([^\]]+)\]/.exec(story);
  ok(!!gv && !!gs, `两侧的 kind 名单都解析得到（门 ${gv ? "有" : "无"}／界面 ${gs ? "有" : "无"}：解析不到下面的对账就是空对账）`);
  if (gv && gs) {
    const norm = (s) => s.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).join("|");
    const a = norm(gs[1]), b = norm(gv[1]);
    ok(a === b, `界面 KINDS 与门 KINDS 逐字相同（界面「${a}」／门「${b}」：四选一改动必须两侧同步）`);
  }

  /* 层叠：抽屉压在详情之上，但不能高过投稿弹窗——投稿入口就在详情里。 */
  const zof = (sel) => { const m = new RegExp(sel + "\\s*\\{[^}]*z-index:\\s*(\\d+)").exec(css); return m ? Number(m[1]) : null; };
  const zSty = zof(".story-drawer");
  const zDetail = Number((/\.detail\s*\{[^}]*z-index:\s*(\d+)/.exec(read("css/layout.css")) || [])[1]);
  const zContrib = Number((/\.contrib-modal\s*\{[^}]*z-index:\s*(\d+)/.exec(read("css/components.css")) || [])[1]);
  ok(zSty !== null && Number.isFinite(zDetail) && Number.isFinite(zContrib),
     `三层的 z-index 都读得到（故事 ${zSty}／详情 ${zDetail}／投稿 ${zContrib}：读不到就没法比大小）`);
  if (zSty !== null && Number.isFinite(zDetail) && Number.isFinite(zContrib)) {
    ok(zSty > zDetail, `故事抽屉(${zSty})压在详情(${zDetail})之上：从详情点开的卡不能被详情盖住`);
    ok(zSty < zContrib, `故事抽屉(${zSty})仍在投稿弹窗(${zContrib})之下：补一条故事也要填得进表单`);
  }
  /* 本仓的抽屉都用 hidden 属性收放，而 [hidden] 的 UA 样式会被作者写的 display:flex 顶掉。 */
  ok(/\.story-drawer\[hidden\]\s*\{[^}]*display:\s*none/.test(css),
     ".story-drawer[hidden] 显式 display:none（只有 hidden 属性时，class 上的 display:flex 会赢过 UA，关掉后抽屉还杵在屏上）");

  /* 权重账：components.css 的 .detail .para p 是「两类一型」，
   * 任何写成 .detail .某类（两类）的覆盖根本压不住它——实测复述字色仍是 --ink-soft。
   * 这类缺陷只在「同一段话在抽屉里与详情里长得不一样」时露出来，所以名单从
   * story.js 的 <p class="..."> 现取，不手写：换了标签或加了段落，这条自动跟着变。 */
  const comps = read("css/components.css");
  const paraP = /\.detail \.para p\s*\{[^}]*\}/.exec(comps);
  /* 权重 = 类/属性选择器数 ×10 + 类型选择器数：这里只用来比大小，不需要真算 ID。 */
  const spec = (s) => ((s.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length) * 10 +
    ((s.replace(/\.[\w-]+|\[[^\]]+\]/g, "").match(/[a-zA-Z][\w-]*/g) || []).length);
  const need = spec(".detail .para p");
  ok(!!paraP && need > 0,
     `.detail .para p 在 components.css 里读得到且权重算得出（${paraP ? "读到了，权重 " + need : "没读到"}：算不出来下面的对账就是空账）`);
  const pCls = [...new Set([...story.matchAll(/<p class="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)))];
  ok(pCls.length >= 2, `解析到故事卡上 ${pCls.length} 个挂在 <p> 里的类（少于 2 个＝这条门空转：${pCls.join(",")}）`);
  {
    const checked = [], losing = [];
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/(?:^|;)\s*(?:color|font-size)\s*:/.test(m[2])) continue;
      for (const sel of m[1].split(",").map((x) => x.trim())) {
        if (!/\.detail/.test(sel)) continue;
        if (!pCls.some((c) => new RegExp("\\." + c + "(\\s+[a-zA-Z]+)?$").test(sel))) continue;
        checked.push(sel);
        if (spec(sel) < need) losing.push(sel + "(权重 " + spec(sel) + " < " + need + ")");
      }
    }
    ok(checked.length >= 2,
      `详情里覆盖到 <p> 段落字色/字号的规则有 ${checked.length} 条（0 条=故事在详情里全靠 .para p 的默认，两处同色无从谈起：${checked.join(" / ")}）`);
    ok(!losing.length,
      `每条 .detail 的段落覆盖权重都不低于 .detail .para p（${losing.join(" / ") || "全部达标"}：写轻了压不住，抽屉与详情会给出两个色/两个字号）`);
  }
}

/* ---------- ⑲ 定位判据的两端口径：故事门 ⇔ 界面徽章 ----------
 * validate-story 的 LOCATORS 与 js/prov.js 的 KINDS 是同一把尺子的两份抄本——
 * 浏览器文件不能 import 工具，工具不能 require 浏览器，所以只能各留一份、逐串对账
 * （validate-story.mjs 头部那句「test-story 用同值用例看着」指的就是这一节）。
 * 分叉的后果不是「哪边更严」，而是「界面说这条小故事查得到底本、门说查不到」同时成立。
 * 两份都从源文件求值成真 RegExp 再跑同一批串：按斜杠切正则文本会被字符类里的裸 `/`
 * （numbered 第五分支就有）切成半截正则，那种「对账」只会永远绿。 */
{
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const vBlock = /const LOCATORS = \[[\s\S]*?\n\];/.exec(read("tools/validate-story.mjs"));
  const pBlock = /var KINDS = \[[\s\S]*?\n  \];/.exec(read("js/prov.js"));
  const L = vBlock && new Function(vBlock[0] + "; return LOCATORS;")();
  const K = pBlock && new Function(pBlock[0] + "; return KINDS;")();
  ok(!!L && !!K, `两侧的定位判据都求值得到（门 ${L ? L.length + " 类" : "没解析到"}／界面 ${K ? K.length + " 类" : "没解析到"}）：解析不到，下面的对账就是空对账`);
  if (L && K) {
    ok(K.map((x) => x.key).join("|") === L.map((x) => x.key).join("|"),
       "两侧的类别清单同名同序（改了名不同步＝其中一份的该类永远不参与对账）");

    const BOTH = [
      "《资治通鉴·唐纪》", "《史记》卷三十九", "第 112 页", "张三（2026年9月1日核）",
      "https://zh.wikisource.org/wiki/史記/卷001", "国学网 www.guoxue.com",
      "《甲骨文合集》6412、6413", "《殷周金文集成》10175", "希罗多德《历史》1.96",
      "亚里士多德《形而上学》983b", "《盎格鲁-撒克逊编年史》878 条", "《史记》123卷",
      "《史记》", "《申报》1912—1913年原载", "《挑战者号报告》1880至1895年",
      "《弗兰肯斯坦》1818/1831年版", "《人民日报》1952年9月", "（1991）", "某书第3章",
      "《文物》1975年第11期", "《考古》1979年第5期", "《文物》1975年", "《考古》第5期",
    ];
    const hit = (list, s) => list.filter((x) => x.re.test(s)).map((x) => x.key);
    const diverged = [];
    for (const s of BOTH) {
      const a = hit(K, s).join("+"), b = hit(L, s).join("+");
      if (a !== b) diverged.push(`「${s}」界面[${a}]／门[${b}]`);
    }
    ok(!diverged.length, `${BOTH.length} 串 × ${K.length} 类逐串对账，两侧命中的类别一致（分叉：${diverged.join("；") || "无"}）`);

    /* 对账只证明两份抄本一致，不证明这把尺子本身是对的——所以下面直接钉住意图。 */
    ok(hit(K, "《甲骨文合集》6412、6413").includes("numbered") &&
       hit(L, "《甲骨文合集》6412、6413").includes("numbered"),
       "书名号＋连列编号在两侧都算「著录编号」定位：这一类漏一侧，那条故事的底本就一侧查得到、一侧查不到");
    for (const yr of ["《申报》1912—1913年原载", "《挑战者号报告》1880至1895年", "《弗兰肯斯坦》1818/1831年版"]) {
      ok(!hit(K, yr).length && !hit(L, yr).length,
        `${yr} 两侧都不命中任何定位类（年份冒充编号＝虚增可核度；命中了[${hit(K, yr)}]/[${hit(L, yr)}]）`);
    }
    /* 期刊期号与上面那年跨度只差一个「期」字，所以它必须钉在正面、而光有年份必须留在反面：
     * 只钉一侧的话，把「年」当位置或把「年第N期」当噪声，两侧各错一半也不会被这里发现。 */
    for (const q of ["《文物》1975年第11期", "《考古》1979年第5期"]) {
      ok(hit(K, q).includes("numbered") && hit(L, q).includes("numbered"),
        `${q} 两侧都算「著录编号」：简报与评论就靠年第N期定位，不算这一侧的读者照着书名找不到那一期`);
    }
    for (const q of ["《文物》1975年", "《考古》第5期"]) {
      ok(!hit(K, q).length && !hit(L, q).length,
        `${q} 两侧都不算定位（只给年＝一年的二十几期无从指认，只给期＝各年复用到同一期号）`);
    }
    ok(!hit(K, "《史记》").length && !hit(L, "《史记》").length,
       "只到书名两侧都不可定位（否则「仅书名」这一档永远不会出现，四级标签塌成三级）");
  }
}

console.log(`\n故事层门自审：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);if (fail) { console.log(failures.join("\n")); process.exitCode = 1; }
else console.log(`✅ ${codesRed.size} 个检查码都被定向打红过一次，${greens} 条豁免边界都验过，真实故事层判绿`);
