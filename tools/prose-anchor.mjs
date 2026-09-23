/* prose-anchor.mjs | 文体改写的内容锚校验：改写只换语域，不许丢事实
 * 用法: node tools/prose-anchor.mjs <before.js> <after.js> [--report]
 *
 * 为什么需要它：rewrite-invariants.mjs 只冻结非散文字段，而事实其实写在散文里
 * （年份、人数、书名、引号内的专名）。一个把「被官家的火处死在日内瓦」改成
 * 「为官火焚于日内瓦」的改写，字段级校验全绿，却可能悄悄把「三十七人」写成「数十人」。
 * 故从旧文本抽取「内容锚」，逐条要求在新文本中仍在场：
 *   硬锚（缺失即红）：阿拉伯数字、拉丁词、「」与《》内的整串、中文数词+后续字
 *   软锚（只报告）：旧文中出现、新文中消失的 CJK 二元组，交人工判是否同义替换
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const REPORT = args.includes("--report");
const [beforeArg, afterArg] = args.filter((a) => !a.startsWith("--"));
if (!beforeArg || !afterArg) {
  console.error("用法: node tools/prose-anchor.mjs <before.js> <after.js> [--report]");
  process.exit(2);
}

function load(p) {
  global.window = {};
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  new Function("window", fs.readFileSync(abs, "utf8"))(global.window);
  const arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0];
  if (!Array.isArray(arr)) throw new Error(`${p}: 未找到分片数组`);
  return arr;
}

const CN_NUM = /[〇零一二两三四五六七八九十百千万亿]+/g;
/* 中文数词必须连同后一个字一起保留：「三十七人」不许写成「数十人」。
 * 独个「一」除外——它在本语料里几乎全是不承载信息的量词冠（一个说法/一把火/一册），
 * 要求它在场恰好会惩罚本次改写要做的收紧；二/三/十/百等一律仍是硬锚。 */
function cnNumAnchors(s) {
  const out = [];
  let m;
  CN_NUM.lastIndex = 0;
  while ((m = CN_NUM.exec(s))) {
    if (m[0] === "一") continue;
    const next = s[m.index + m[0].length];
    if (next && !/[，。、；：）」』\s]/.test(next)) out.push(m[0] + next);
    else out.push(m[0]);
  }
  return out;
}

function anchors(s) {
  const hard = [];
  for (const m of s.match(/\d+(?:\.\d+)?%?/g) || []) hard.push(m);
  for (const m of s.match(/[A-Za-z][A-Za-z0-9.\-]*/g) || []) hard.push(m);
  for (const m of s.match(/「[^」]*」/g) || []) hard.push(m);
  for (const m of s.match(/《[^》]*》/g) || []) hard.push(m);
  for (const m of cnNumAnchors(s)) hard.push(m);
  return hard;
}

function bigrams(s) {
  const set = new Set();
  const cjk = (s.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) || []);
  for (const run of cjk) for (let i = 0; i + 1 < run.length; i++) set.add(run.slice(i, i + 2));
  return set;
}

const before = load(beforeArg);
const after = load(afterArg);
const aById = new Map(after.map((e) => [e.id, e]));
const FIELDS = ["title", "summary"];
const DETAIL = ["background", "process", "impact"];
const useDetail = process.env.ANCHOR_DETAIL === "1";
if (useDetail) FIELDS.push(...DETAIL.map((k) => "detail." + k));

const errs = [];
const soft = [];
let checked = 0, lostBigramEvents = 0;

const text = (e, f) => (f.startsWith("detail.") ? String((e.detail && e.detail[f.slice(7)]) || "") : String(e[f] || ""));

for (const b of before) {
  const a = aById.get(b.id);
  if (!a) continue;
  checked++;
  for (const f of FIELDS) {
    const old = text(b, f), now = text(a, f);
    for (const anc of anchors(old)) {
      if (!now.includes(anc)) errs.push(`${b.id} ${f} 丢锚「${anc}」\n    旧: ${old}\n    新: ${now}`);
    }
    if (f === "summary" || f === "title") continue;
    /* detail 的长度带：语域改写只换说法，既不许加字（填充）也不许砍到六成以下
     * （那等于把背景/经过/影响三段论述压成一句，是另一种信息丢失，锚校验抓不到）。 */
    const ratio = now.length / Math.max(1, old.length);
    if (now.length > old.length)
      errs.push(`${b.id} ${f} 变长 ${old.length}→${now.length} 字（改写不得加字）\n    旧: ${old}\n    新: ${now}`);
    else if (ratio < 0.6)
      errs.push(`${b.id} ${f} 缩到 ${(ratio * 100).toFixed(0)}%（${old.length}→${now.length} 字，压缩过度）\n    旧: ${old}\n    新: ${now}`);
    const gone = [...bigrams(old)].filter((g) => !bigrams(now).has(g));
    if (gone.length) { lostBigramEvents++; soft.push(`${b.id} ${f} 消失二元组(${gone.length}): ${gone.join(" ")}`); }
  }
}

console.log(`内容锚校验：比对 ${checked} 条，字段 ${FIELDS.join(",")}`);
if (REPORT) soft.slice(0, 200).forEach((s) => console.log("  ~ " + s));
if (errs.length) {
  console.log(`\n✗ 丢锚 ${errs.length} 处：`);
  errs.slice(0, 30).forEach((e) => console.log("  " + e));
  if (errs.length > 30) console.log(`  …另 ${errs.length - 30} 处`);
  process.exit(1);
}
console.log(`\n✅ 硬锚全部在场（软锚待人工过目：${lostBigramEvents} 条有二元组消失，加 --report 查看）`);
