/* date-candidates.mjs | 「日」层候选器与落盘器（口径在 tools/date-lib.mjs）
 * 用法: node tools/date-candidates.mjs            只读报告：收了多少、歧义在哪、哪些天是空的
 *       node tools/date-candidates.mjs --apply    写 data/dates.js（幂等：内容相同则不写）
 *       node tools/date-candidates.mjs --ambig    只列歧义条目及其候选，供人回去改正文
 *
 * 为什么先要报告再落盘：这一层是「派生」，不是「编纂」——它的覆盖率取决于条目文本里
 * 有没有把日子写出来。报告就是施工面的账：哪一天空着、哪一条因为正文里有两个日期而
 * 被弃收，都得让人看见，否则「历史上的今天」会在某些日子悄悄空掉。
 */
import fs from "fs";
import path from "path";
import { loadCorpus, useRoot, ROOT } from "./geo-lib.mjs";
import { deriveAll, DATE_RULE, PROLEPTIC_BEFORE, blankCells, MDAYS } from "./date-lib.mjs";

const argv = process.argv.slice(2);
const rootArg = argv.indexOf("--root");
if (rootArg >= 0) useRoot(path.resolve(argv[rootArg + 1]));

const corpus = loadCorpus();
const byId = new Map(corpus.map((e) => [e.id, e]));
const { recs, ambiguous } = deriveAll(corpus);

function report() {
  const byHow = {};
  const slot = new Map();
  const byTrack = { cn: 0, world: 0 };
  for (const r of recs) {
    byHow[r.how] = (byHow[r.how] || 0) + 1;
    const k = r.m + "-" + r.d;
    slot.set(k, (slot.get(k) || 0) + 1);
    const e = byId.get(r.id);
    if (e) byTrack[e.track] = (byTrack[e.track] || 0) + 1;
  }
  console.log(`语料 ${corpus.length} 条 → 收到日 ${recs.length} 条（${(recs.length / corpus.length * 100).toFixed(1)}%）`);
  console.log("  分层：" + Object.entries(byHow).map(([k, v]) => `${k} ${v}`).join(" | "));
  console.log("  分轨：" + Object.entries(byTrack).map(([k, v]) => `${k} ${v}`).join(" | "));
  console.log(`  命中日历格 ${slot.size}/${MDAYS.reduce((a, b) => a + b, 0)}；单日≥5 条的格 ${[...slot.values()].filter((v) => v >= 5).length}；只 1 条的格 ${[...slot.values()].filter((v) => v === 1).length}`);
  const blanks = blankCells(recs);
  console.log(`  空格 ${blanks.length}：${blanks.join(" ")}`);
  const pre1912 = recs.filter((r) => { const e = byId.get(r.id); return e && e.year < 1912; });
  console.log(`  1912 年前收到日的条数 ${pre1912.length}（多为 18 世纪后传教士/外交文书纪日，界面须标「公历日为后世历表」者 ${pre1912.filter((r) => byId.get(r.id).year < 1583).length} 条）`);
  console.log(`\n歧义（同年正文里出现两个不同日子，整条不收）：${ambiguous.length} 条`);
  for (const a of ambiguous.slice(0, argv.includes("--ambig") ? 999 : 12))
    console.log(`  ${a.id} ${a.year}：${a.cands.map((c) => c.m + "/" + c.d).join(" 或 ")}`);
  if (ambiguous.length > 12 && !argv.includes("--ambig")) console.log(`  …另 ${ambiguous.length - 12} 条，用 --ambig 看全表`);
  console.log(`\n口径 ${DATE_RULE}（改口径就是改语义，必须连 date-lib、门、README 一起改）`);
}

function write() {
  const head = `/* dates.js | 「历史上的今天」的日层
 *
 * 生成件，别手改：node tools/date-candidates.mjs --apply
 * 每一条的月与日都是从该条自己的 title/summary/detail.process/detail.sources 里
 * 取出来的，且必须与条目 year 同年——手打一份就有第二份，两份打架时没人知道该信哪个。
 * tools/validate-dates.mjs 会现取现算并与本文件逐字比对（DATES_DERIVE），改一个字都判红。
 *
 * how 的四层含义（界面按它区别标示，因为「文书落款日」不等于「事件发生日」）：
 *   text     标题或摘要里写明
 *   process  经过段里写明
 *   src      只出现在出处里（是文件日期，界面标「出处纪日」）
 *   text-cn  中文月日，只收 1912 年及以后（此前多为农历，本库不做历表换算）
 * 口径版本：${DATE_RULE}
 * prolepticBefore：此年之前的公历日由后世历表推得（当时行儒略历），界面读到它就必须在页脚
 *   说明一句。这个数字也归 date-lib 管——界面自己抄一份，历表一改口径就会两边打架。
 * ambiguousCount：因「同一年里出现两个不同日子」而整条不收的条数。界面把它印在页脚，
 *   就是告诉读者这一页为什么不是全库——弃收的账不写出来，缺口就会看起来像遗漏。
 * blankDays：日历上真实存在、而本库这一天没有任何纪日的天数（366 格减去命中格）。
 *   这个数由 date-lib 的 blankCells 现算——它按各月真实天数数格子，所以不会把 4/31、6/31
 *   这种根本不存在的日子算成「空着」。界面印的就是这一项，自己再数一遍就是第二份口径。
 * mdays：各月天数（含 2 月 29）。它在这儿而不是在界面里，是因为深链会点到不存在的日子：
 *   有人分享 #/today/4/31，界面要是自己猜「4 月有 31 天」，画出来就是一个假日期。
 *   界面拿这张表判真伪，判不过就照实说「这天不存在」，绝不替它编一天。
 */
window.__CHRONICLE_DATES = {
  version: 1,
  rule: ${JSON.stringify(DATE_RULE)},
  prolepticBefore: ${PROLEPTIC_BEFORE},
  ambiguousCount: ${ambiguous.length},
  blankDays: ${blankCells(recs).length},
  mdays: ${JSON.stringify(MDAYS)},
  recs: [
`;
  const body = recs.map((r) =>
    `    { id: ${JSON.stringify(r.id)}, m: ${r.m}, d: ${r.d}, how: ${JSON.stringify(r.how)} }`
  ).join(",\n");
  const out = head + body + "\n  ]\n};\n";
  const file = path.join(ROOT, "data/dates.js");
  const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (prev === out) { console.log("data/dates.js 已是当前派生结果，未写（幂等）"); return; }
  fs.writeFileSync(file, out);
  console.log(`已写 data/dates.js：${recs.length} 条（${(out.length / 1024).toFixed(1)} KB）`);
}

if (argv.includes("--apply")) write(); else report();
