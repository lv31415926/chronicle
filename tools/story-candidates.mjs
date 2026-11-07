/* story-candidates.mjs | 故事层锚点候选器（只读）：给一条传说/异闻，找出它能挂在哪一条真事件上
 * 用法: node tools/story-candidates.mjs --person 谢安 --year 383
 *       node tools/story-candidates.mjs --kw 世说 [--year 400] [--limit 8]
 *       node tools/story-candidates.mjs --list            （只看索引规模与最肥的人名）
 * 可选：--track cn|wd　--within 40（年份窗，默认 60）　--root <目录>
 *
 * 为什么要有这台机器：data/story 的每一条都必须带 ev，而**年份由锚点派生**（故事层自己不存
 * 年份）。锚点选错，界面就替读者把这条异闻系错了年——比少收一条故事危害大得多。
 * 本器只出候选、不下结论：谁跟这件事真是同一件，要人看着标题与出处裁定
 * （与 related-candidates.mjs、geo-candidates.mjs 同一口径）。
 *
 * 输出里那个 `已挂 n` 是这条锚点当前已经承载了几条故事：异闻若全挤在两三件事上，
 * 长河里就是一片同年的针，看着像数据坏了而不像热闹。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { loadCorpus, useRoot, ROOT } from "./geo-lib.mjs";

const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf("--" + k); return i < 0 ? "" : argv[i + 1] || ""; };
const has = (k) => argv.includes("--" + k);
const rootArg = argv.indexOf("--root");
if (rootArg >= 0) useRoot(path.resolve(argv[rootArg + 1]));

const corpus = loadCorpus();

/* ---------- 现有故事的锚点用量 ---------- */
function storyUsage() {
  const dir = path.join(ROOT, "data/story");
  const use = new Map();
  if (!fs.existsSync(dir)) return use;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js") && x !== "manifest.js")) {
    const sb = { window: {} }; sb.window = sb;
    vm.createContext(sb);
    try { vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), sb, { filename: f }); }
    catch (e) { console.log(`! ${f} 求值失败：${e.message}（锚点用量按已能解析的部分算）`); continue; }
    const C = sb.__CHRONICLE_STORY_CHUNK || {};
    for (const k of Object.keys(C)) for (const s of C[k] || [])
      use.set(s.ev, (use.get(s.ev) || 0) + 1);
  }
  return use;
}
const usage = storyUsage();

/* ---------- 索引 ---------- */
const figs = new Map();
for (const e of corpus) {
  for (const p of ((e.detail && e.detail.figures) || [])) {
    if (!figs.has(p)) figs.set(p, []);
    figs.get(p).push(e);
  }
}

const person = flag("person");
const kw = flag("kw");
const track = flag("track");
const year = has("year") ? Number(flag("year")) : NaN;
const within = has("within") ? Number(flag("within")) : 60;
const limit = has("limit") ? Number(flag("limit")) : 12;

if (has("list")) {
  const top = [...figs].sort((a, b) => b[1].length - a[1].length).slice(0, 20);
  console.log(`语料 ${corpus.length} 条 | 人名索引 ${figs.size} 项 | 故事锚点 ${usage.size} 个（承载 ${[...usage.values()].reduce((a, b) => a + b, 0)} 条故事）`);
  console.log("条目最多的人名：" + top.map((x) => `${x[0]}(${x[1].length})`).join(" "));
  process.exit(0);
}
if (!person && !kw) {
  console.log("要至少给一个 --person 或 --kw。--list 看索引规模。");
  process.exit(0);
}

/* 全文检索用的那一段字符串：标题+摘要+标签+出处。抽成一个函数，三处搜索共用一份口径。 */
function haystack(e) {
  const d = e.detail || {};
  return `${e.title} ${e.summary} ${(d.tags || []).join(" ")} ${(d.sources || []).join(" ")}`;
}

/* 命中：人名走索引（准），关键词走标题+摘要+标签+出处（宽） */
let pool = person && figs.has(person) ? figs.get(person).slice() : [];
if (person && !figs.has(person)) console.log(`（人名索引里没有「${person}」——下面按关键词在全文找）`);
if (kw) {
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const extra = corpus.filter((e) => re.test(haystack(e)));
  const seen = new Set(pool.map((e) => e.id));
  for (const e of extra) if (!seen.has(e.id)) { pool.push(e); seen.add(e.id); }
}
if (person) {
  const re = new RegExp(person.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const seen = new Set(pool.map((e) => e.id));
  for (const e of corpus) if (!seen.has(e.id) && re.test(haystack(e))) { pool.push(e); seen.add(e.id); }
}
if (track) pool = pool.filter((e) => e.track === track);

/* 排序：先看在不在窗内，再看离目标年多近，最后按权重。
 * 窗外的条目不删——异闻常常本来就系不到当年那件事，退而求其次挂到同一人的他事上，
 * 是裁定者的事，不是候选器替他做的决定。 */
pool.sort((a, b) => {
  if (Number.isFinite(year)) {
    const da = Math.abs(a.year - year), db = Math.abs(b.year - year);
    const inA = da <= within ? 0 : 1, inB = db <= within ? 0 : 1;
    if (inA !== inB) return inA - inB;
    if (da !== db) return da - db;
  }
  return (b.weight || 0) - (a.weight || 0);
});

const shown = pool.slice(0, limit);
for (const e of shown) {
  const d = Number.isFinite(year) ? `Δ${Math.abs(e.year - year)}年` : "  -- ";
  const src = ((e.detail && e.detail.sources) || []).slice(0, 2).join("；");
  console.log(`${String(e.year).padStart(6)} ${d.padStart(7)} ${e.id.padEnd(16)} w${e.weight} ${e.dim.padEnd(10)} 已挂${usage.get(e.id) || 0} | ${e.title} | ${src}`);
}
console.log(`\n候选 ${pool.length} 条（显示前 ${shown.length}，年份窗 ±${within}）——逐条裁定后才写进 data/story；写下的每一条都得自己再读一遍出处。`);
if (!pool.length) console.log("零候选：这件事挂不住锚点。宁可不收，也不要借一条不相干的事件凑数。");
console.log(`（语料 ${corpus.length} 条 · 人名索引 ${figs.size} 项 · root ${ROOT}）`);
