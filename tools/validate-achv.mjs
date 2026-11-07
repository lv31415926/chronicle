/* validate-achv.mjs | 成就线门：补齐不许只补一次，立场不许漏进事实层
 * 用法: node tools/validate-achv.mjs [--json] [--root <目录>]
 *
 * 为什么需要这道门：#86 那一轮把九条成就缺口填上、六条权重抬到该在的位置，
 * 但「填好」这件事本身没有任何持久效力——下一次有人删条目、改关键词、
 * 或把一句「最后辉煌」顺手写进 impact，全库不会有任何一处变红。
 * 本门把这三件事钉住：成就线必须仍有内容、成就锚点必须有可翻的出处、
 * 评价词必须留在引号里。
 *
 * 与视角层门的分工：validate-frame 管「立场写在哪、凭什么这么写」；
 * 本门管「被立场依赖的事实层地基还在不在」。两者判据不重叠，也不互相代管。
 *
 * 检查码：
 *   ACHV_LINE          成就线在 data/themes.js 里缺失或被改名（线没了，读者点不到）
 *   ACHV_GAP           成就线成员数／高权重锚点数／中国侧条数低于下限
 *   ACHV_PROV_RATCHET  成就维 w≥4 却只写到书名的条数越过基线（棘轮：只许降不许升）
 *   ACHV_STANCE        评价词出现在事实层且不在引号对内（立场只能写在视角层）
 *
 * 已知盲区，写在门里而不是藏在心里：
 *   ① 成员数按 js/themes.js 的关键词打分**复算**，本门不共享那段代码。
 *      一旦 js/themes.js 改了评分口径，这里算出的成员集会与界面不一致而双方都绿——
 *      改评分必须同时复核本门，二者没有编译期耦合。
 *   ② ACHV_STANCE 的扫描域是五个叙述字段，豁免只有「落在引号对内」一种。
 *      文献名/专名里带评价词而补引号救不回来的（典型是明末作者「吴伟业」），
 *      处理方式是把它从词表删掉并写明删除理由，而不是加特例豁免——
 *      名词性字段（tags/sources/figures/place/state）整域不扫，同一个道理。
 *   ③ 评价词表是有限枚举，写不出来的近义词（如「鼎盛」「巅峰」「不胫而走」）不会被抓到。
 *      这道门挡的是形容词漏写，挡不住整句的倾向；后者仍靠 §5 与人工审。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, useRoot } from "./geo-lib.mjs";
import { PRAISE, quoteSpans } from "./voice-lib.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArg = process.argv.indexOf("--root");
const ROOT = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : DEFAULT_ROOT;
if (rootArg > 0) useRoot(ROOT);

const errs = [];
const bad = (c, m) => errs.push(`${c} ${m}`);

function evalFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  return sb;
}

/* 九条成就线：本站明确要「呈现成就」的那几条主题线，与 silkwine 等世界线分开。
 * 名单钉在门里——新增成就线必须显式来这里登记，删线会当场变红。 */
const ACHV_LINES = [
  "bronze-ritual", "silk-ceramic", "hydraulic", "calendar-math", "medicine-agri",
  "exam-bureaucracy", "writing-painting", "grain-relief", "maritime"
];
/* 下限取 2026-11-05 实测值的下位整数：成员最少 19、w≥4 最少 3、w≥3 最少 16、中国侧最少 13。
 * 这是**回归检测线**，不是目标线——达标不代表成就补齐了。 */
const FLOOR = { members: 15, hi: 2, mid: 10, cn: 5 };

/* 成就维：这六维的 w≥4 条目要抬出来当锚点用，出处必须能翻。
 * politics/military/figure/disaster 不在此列——战争与灾荒的锚点不是「成就」，
 * 把它们算进来会让棘轮去追一批本就不该按成就标准要求的条目。 */
const ACHV_DIMS = ["science", "culture", "art", "institution", "explore", "economy"];
/* 棘轮基线：2026-11-05 复算 成就维 w≥4 共 630 条，其中溯源只到「仅书名」190 条。
 * 只许降不许升；清到 0 才是目标，但目标不是这条线。 */
const PROV_BASELINE = 190;

/* 只查叙述性字段（title/summary/background/process/impact）——那是本站对读者说话的口气。
 * tags / sources / figures / place / state 不查：它们是名词性片段不是句子，
 * 实测会把「吴伟业之纪事」「光荣之革命」报成违规，而这类误报补引号救不回来，
 * 只会教人来忽略这道门。
 * 词表里刻意不含「伟业」：吴伟业是真实存在的明末作者名，写进 background 就是误报，
 * 且无法靠加书名号消除。这是删词不是加豁免——被删的词由人工审兜着。
 * 「伟大」「光荣」保留：语料里的用例（「光荣三日」「伟大转折」）本来就是文献原话，
 * 加上引号对既让门变绿，也让记述更忠实——这一族违规是真能就地修好的。
 * 词表现在住在 tools/voice-lib.mjs：它与故事层、涟漪层是同一把尺子，
 * 各抄一份迟早会漂成两把，那时同一句话在这道门红、在那道门绿，读者就不信门了。 */

const corpus = loadCorpus();
const themes = (evalFile("data/themes.js") || {}).__CHRONICLE_THEMES || [];
const PV = evalFile("js/prov.js").ChronProv;

/* ---------- ACHV_LINE / ACHV_GAP ---------- */
/* 成员解析复刻 js/themes.js 的 resolve()（成对改动，见 DATA_SCHEMA §14B 与盲区①）：
 * 关键词命中 hay +2、命中标题 +3、命中标签 +2，minScore 起线；同年同维只留一条。
 * 计数用**截断前**的成员集：max 是给版面用的显示上限，不该拿它衡量语料有没有货。 */
function resolve(th) {
  const out = [];
  for (const e of corpus) {
    if (e.year < th.from || e.year > th.to) continue;
    if (th.tracks && th.tracks.indexOf(e.track) < 0) continue;
    let score = 0;
    const hay = (e.title + " " + e.summary + " " + (e.detail.tags || []).join(" ") + " " +
      (e.detail.figures || []).join(" ") + " " + (e.detail.state || ""));
    th.keywords.forEach((k) => {
      if (hay.indexOf(k) >= 0) score += 2;
      if (e.title.indexOf(k) >= 0) score += 3;
      if ((e.detail.tags || []).indexOf(k) >= 0) score += 2;
    });
    if (th.exclude && th.exclude.some((k) => hay.indexOf(k) >= 0)) continue;
    if (score >= (th.minScore || 4)) out.push({ ev: e, score });
  }
  out.sort((a, b) => a.ev.year - b.ev.year || b.score - a.score);
  const seen = {}, members = [];
  out.forEach((o) => {
    const k = o.ev.year + "|" + o.ev.dim;
    if (seen[k]) return;
    seen[k] = 1; members.push(o.ev);
  });
  return members;
}

const byId = new Map(themes.map((t) => [t.id, t]));
ACHV_LINES.forEach((id) => { if (!byId.has(id)) bad("ACHV_LINE", `成就线 ${id} 在 data/themes.js 里不存在——要么被删了，要么改了名`); });

const lineStat = [];
for (const th of themes) {
  if (!ACHV_LINES.includes(th.id)) continue;
  const m = resolve(th);
  const st = {
    id: th.id, label: th.label,
    members: m.length,
    hi: m.filter((e) => e.weight >= 4).length,
    mid: m.filter((e) => e.weight >= 3).length,
    cn: m.filter((e) => e.track === "cn").length,
  };
  lineStat.push(st);
  if (st.members < FLOOR.members) bad("ACHV_GAP", `${th.id}「${th.label}」成员 ${st.members} 条 < ${FLOOR.members}——这条成就线已经空到不值得挂在界面上`);
  if (st.hi < FLOOR.hi) bad("ACHV_GAP", `${th.id}「${th.label}」只有 ${st.hi} 条 w≥4 锚点 < ${FLOOR.hi}——成就线没有高光条目，只剩过程流水`);
  if (st.mid < FLOOR.mid) bad("ACHV_GAP", `${th.id}「${th.label}」w≥3 共 ${st.mid} 条 < ${FLOOR.mid}`);
  if (st.cn < FLOOR.cn) bad("ACHV_GAP", `${th.id}「${th.label}」中国侧只 ${st.cn} 条 < ${FLOOR.cn}——这条线名为中国成就，却几乎全是别国的故事`);
}

/* ---------- ACHV_PROV_RATCHET ---------- */
const anchors = corpus.filter((e) => e.weight >= 4 && ACHV_DIMS.includes(e.dim));
const titled = anchors.filter((e) => PV.tierOf(e) === "titled");
if (titled.length > PROV_BASELINE) {
  const sample = titled.slice(0, 6).map((e) => e.id).join("、");
  bad("ACHV_PROV_RATCHET",
    `成就维 w≥4 只写到书名的有 ${titled.length} 条，越过基线 ${PROV_BASELINE}（新样例：${sample}）。` +
    `棘轮只许降：要么把 sources 补到能直接翻到的位置（篇目/卷册/节页/日期/著录编号/链接），要么把权重降回 3。` +
    `目标不是 ${PROV_BASELINE}，是 0——基线只是「不许更差」的那条线。`);
}

/* ---------- ACHV_STANCE ---------- */
function spans(s) { return quoteSpans(String(s)); }
/* 事实层的**叙述字段**逐个查：一处漏网就报，且报出字段路径便于定位。
 * 名词性字段（tags/sources/figures/place/state）不在扫描域内，理由见 ACHV_STANCE 段注释。 */
function fieldsOf(e) {
  return [["title", e.title], ["summary", e.summary],
    ["detail.background", e.detail.background],
    ["detail.process", e.detail.process],
    ["detail.impact", e.detail.impact]];
}
const stanceHits = [];
for (const e of corpus) {
  for (const [field, val] of fieldsOf(e)) {
    if (typeof val !== "string") continue;
    const sp = spans(val);
    for (const word of val.match(new RegExp(PRAISE.source, "g")) || []) {
      let from = 0, covered = false;
      while (true) {
        const i = val.indexOf(word, from); if (i < 0) break;
        covered = sp.some(([a, b]) => a <= i && i + word.length <= b);
        if (!covered) { stanceHits.push({ id: e.id, field, word, ctx: val.slice(Math.max(0, i - 12), i + word.length + 12) }); break; }
        from = i + word.length;
      }
    }
  }
}
stanceHits.slice(0, 12).forEach((h) =>
  bad("ACHV_STANCE", `${h.id} 的 ${h.field} 里「${h.word}」不在引号对内（…${h.ctx}…）——评价词属于视角层；事实层要么改写成可核的事实，要么把它留在原文引号里`));
if (stanceHits.length > 12) bad("ACHV_STANCE", `另有 ${stanceHits.length - 12} 处同类违规未列出`);

/* ---------- 输出 ---------- */
if (process.argv.indexOf("--json") > 0) {
  console.log(JSON.stringify({
    errors: errs, lines: lineStat,
    anchors: anchors.length, titledAnchors: titled.length, stanceHits: stanceHits.length,
  }, null, 1));
} else {
  console.log(`成就线门 · 9 条成就线 · 语料 ${corpus.length} 条`);
  for (const s of lineStat) {
    console.log(`  ${s.id.padEnd(17)} 成员 ${String(s.members).padStart(3)}  w≥4 ${String(s.hi).padStart(2)}  w≥3 ${String(s.mid).padStart(3)}  中国侧 ${String(s.cn).padStart(3)}`);
  }
  console.log(`  成就维 w≥4 锚点 ${anchors.length} 条，其中只到书名 ${titled.length} 条（棘轮基线 ${PROV_BASELINE}，目标 0）`);
  console.log(`  事实层评价词越界 ${stanceHits.length} 处`);
}
if (errs.length) {
  console.log(`\n✗ ${errs.length} 项违规：`);
  errs.forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log("\n✅ 成就线全部通过");
