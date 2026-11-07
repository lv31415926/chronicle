/* validate-story.mjs | 故事层门：小故事可以不有趣，但不能没有底本
 * 用法: node tools/validate-story.mjs [--json] [--root <目录>]
 *
 * 为什么这一层需要一道单独的门：故事层是本站唯一**自己写句子**的层。
 * 事实层的条目来自书，出处错了指得回原书；故事层的 scene 是本站的白话复述，
 * 一句「他临死说」写歪了，读者翻遍史料也找不到那句话在哪。所以本层不能只靠
 * 人工审——审得完一批，审不完后来追加的那一批。
 *
 * 六条硬判据（写在 data/story/preqin.js 文件头，这里是它的机器版本）：
 *   ① ev 必须真在 data/cn·data/wd 里，且锚点自己要有出处（年份由锚点派生，故事层不存年份）
 *   ② kind 四选一，不许自造
 *   ③ quoteState=verbatim ⇒ src 至少一条能直接翻到位置
 *   ④ 笔记异闻／后世附会 ⇒ 必须写 caveat；出土文献与档案 ⇒ 必须写 find
 *   ⑤ 评价词不许漏进 scene（立场只写在视角层与引号里）
 *   ⑥ 极值语（最早／第一／之最…）必须有 caveat 兜住限定或争议
 *
 * 检查码：
 *   STORY_MANIFEST     data/story/manifest.js 与磁盘分片不一一对应（漏登记的分片界面永远加载不到）
 *   STORY_SCHEMA       字段缺失、类型不对、多存了 year/era、id 形态不合
 *   STORY_DUP          同一 id 出现两次
 *   STORY_ANCHOR       ev 指向的条目不存在
 *   STORY_ANCHOR_PROV  ev 指向的条目自己没有任何出处（锚不住年份，等于故事悬空）
 *   STORY_KIND         kind 不在四选一之内
 *   STORY_QUOTE        quote 与 quoteState 不配对（有引无态、有态无引）
 *   STORY_PROV         标了 verbatim 却给不出可定位的出处
 *   STORY_CAVEAT       笔记异闻／后世附会缺 caveat
 *   STORY_FIND         出土文献与档案缺 find
 *   STORY_STANCE       评价词出现在 scene 且不在引号对内
 *   STORY_SUPERLATIVE  极值语缺 caveat
 *   STORY_COVERAGE     分片条目数或分片数低于下限（回归检测线，不是目标线）
 *
 * 已知盲区，写在门里而不是藏在心里：
 *   ① 本门只验「出处形态」，不验「出处真假」。把《明史·于谦传》写成《明史·朱元璋传》
 *      照样能过 chapter 正则；引文是否逐字，只有真去翻书的人才知道（§「已核」不由本门生成）。
 *   ② scene 是白话复述，本门不比对复述与原文是否一致——那需要一台古籍全文比对器。
 *      这条只能靠 caveat 密度与人工抽读，门挡的是结构错，不挡意思错。
 *   ③ 极值表与评价词表都是有限枚举，近义说法抓不全；同 validate-frame 的口径。
 *   ④ COVERAGE 的下限是 2026-11-05 实测值的下位整数，只保证「不缩水」，
 *      不保证「收得全」——补充条目时该抬的是内容，不是先把这条线抬高。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, useRoot } from "./geo-lib.mjs";
import { PRAISE, SUPER, stripQuoted } from "./voice-lib.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArg = process.argv.indexOf("--root");
const ROOT = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : DEFAULT_ROOT;
if (rootArg > 0) useRoot(ROOT);

const errs = [];
const bad = (c, m) => errs.push(`${c} ${m}`);

function evalFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!abs || !fs.existsSync(abs)) return null;
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  /* 每个分片都要在全新沙箱里独立求值：浏览器按顺序注入，前一个文件建好的
   * window.__CHRONICLE_STORY_CHUNK 会把后一个文件缺守卫的毛病盖住。
   * 求值抛异常本身就是结论（多半是少了 `|| {}` 那一行），不许让它炸掉整道门。 */
  try {
    vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  } catch (e) {
    bad("STORY_SCHEMA", `${rel} 单独求值失败：${e.message}（分片必须自带 window.__CHRONICLE_STORY_CHUNK = ... || {} 守卫，且不许有语法错误）`);
    return null;
  }
  return sb;
}

/* 定位证据的六类判据与 js/prov.js、tools/validate-frame.mjs 同一套形态。
 * 抄第三份之前先想清楚：这里必须与 prov.js 一致，否则「界面说可定位、门说不可」
 * 会同时成立。改 prov.js 的 KINDS 必须同步这里 —— test-story 用同值用例看着。 */
const LOCATORS = [
  { key: "chapter", re: /《[^》]+·[^》]+》/ },
  { key: "juan", re: /[卷册部编]\s*[一二三四五六七八九十百千零〇两0-9]+|第\s*[一二三四五六七八九十百千零〇两0-9]+\s*[卷册部编]/ },
  { key: "section", re: /第\s*[一二三四五六七八九十百千零〇两0-9]+\s*[节章条页]|[:：]\s*\d{1,4}\s*[-—]\s*\d{1,4}|\bp\.?\s*\d{1,4}\b/i },
  { key: "dated", re: /\d{3,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/ },
  { key: "numbered", re: /》\s*\d{1,6}(?:\s*[、,，.．]\s*\d{1,6})+|》\s*\d{1,6}\s*(?:[—–~－]|至)\s*\d{1,6}\s*[章条款篇号节项]|》\s*\d{1,6}\s*[章条款篇号节项]|》\s*\d{1,4}[a-z](?![a-z])|》\s*\d{2,6}(?![\d.])[^\s\d年月日—–~－/、，.．)）】至与]|》\s*\d{1,4}\s*年第\s*[0-9一二三四五六七八九十]{1,3}\s*期/ },
  { key: "link", re: /https?:\/\/|www\.|\bISBN\b/i }
];
function locatable(list) {
  const ss = (list || []).map(String);
  return LOCATORS.some((k) => ss.some((s) => k.re.test(s)));
}

const KINDS = ["史载", "笔记异闻", "后世附会", "出土文献与档案"];
/* 这两类不参与「当史料用」，所以必须自带一句「为什么还值得看」。 */
const CAVEAT_KINDS = ["笔记异闻", "后世附会"];
const REQ = ["id", "ev", "kind", "title", "people", "scene", "src"];
/* 年份与朝代一律由锚点派生。存了一份就有第二份，两份打架时没人知道该信哪个。 */
const FORBIDDEN = ["year", "era", "dynasty", "date", "weight"];
const ID_RE = /^st-[a-z][a-z0-9]*-\d{3}$/;

/* 立场词表与引号豁免住在 tools/voice-lib.mjs：成就门、故事门、涟漪门必须同一把尺子。
 * 三份各抄一份迟早漂开，那时同一句话在这道门红、在那道门绿，读者就不信门的话了。
 * 故事层里唯一的叙述字段是 scene。 */

/* ---------- 分片装载 ---------- */
const storyDir = path.join(ROOT, "data/story");
if (!fs.existsSync(storyDir)) {
  bad("STORY_MANIFEST", "data/story 目录不存在，故事层整层缺失");
}
const diskFiles = fs.existsSync(storyDir)
  ? fs.readdirSync(storyDir).filter((f) => f.endsWith(".js") && f !== "manifest.js").sort()
  : [];

const sbMan = evalFile("data/story/manifest.js");
const MAN = sbMan && sbMan.__CHRONICLE_STORY_MANIFEST;
if (!MAN || !Array.isArray(MAN.chunks)) {
  bad("STORY_MANIFEST", "data/story/manifest.js 缺失或没有 chunks 数组");
} else {
  const declared = MAN.chunks.map((c) => c.file);
  for (const f of diskFiles) {
    if (!declared.includes(f)) bad("STORY_MANIFEST", `${f} 在磁盘上但没登记进 manifest（界面按 manifest 注入，这条分片永远加载不到）`);
  }
  for (const f of declared) {
    if (!diskFiles.includes(f)) bad("STORY_MANIFEST", `manifest 登记了 ${f} 但磁盘上没有（注入会 404，故事层出现空洞）`);
  }
}

const entries = [];
const byFile = new Map();
for (const f of diskFiles) {
  const sb = evalFile(path.join("data/story", f).replace(/\\/g, "/"));
  const C = sb && sb.__CHRONICLE_STORY_CHUNK;
  if (!C) { bad("STORY_SCHEMA", `${f} 求值后没有 window.__CHRONICLE_STORY_CHUNK`); continue; }
  const keys = Object.keys(C);
  if (keys.length !== 1) { bad("STORY_SCHEMA", `${f} 应只写一个分片键，实得 ${keys.length} 个：${keys.join(",")}`); continue; }
  const key = keys[0];
  if (!Array.isArray(C[key])) { bad("STORY_SCHEMA", `${f} 的键 ${key} 不是数组`); continue; }
  byFile.set(f, { key, n: C[key].length });
  for (const e of C[key]) entries.push({ e, f, key });
}

/* ---------- 锚点 ---------- */
const corpus = loadCorpus();
const byId = new Map(corpus.map((e) => [e.id, e]));

const seenId = new Set();
for (const { e, f } of entries) {
  const at = `${f} ${e && e.id ? e.id : "(无 id)"}`;
  if (!e || typeof e !== "object") { bad("STORY_SCHEMA", `${at} 不是对象`); continue; }

  for (const k of REQ) {
    if (!(k in e)) { bad("STORY_SCHEMA", `${at} 缺必填字段 ${k}`); }
  }
  for (const k of FORBIDDEN) {
    if (k in e) bad("STORY_SCHEMA", `${at} 存了 ${k}：年份与朝代由 ev 锚点派生，故事层不许各存一份`);
  }
  if (typeof e.id !== "string" || !ID_RE.test(e.id)) bad("STORY_SCHEMA", `${at} id 形态应为 st-<分片>-<三位数字>`);
  if (seenId.has(e.id)) bad("STORY_DUP", `${at} id 重复`);
  seenId.add(e.id);
  for (const k of ["ev", "kind", "title", "scene"]) {
    if (k in e && (typeof e[k] !== "string" || !e[k].trim())) bad("STORY_SCHEMA", `${at} ${k} 必须是非空字符串`);
  }
  for (const k of ["people", "src"]) {
    if (!(k in e)) continue;
    if (!Array.isArray(e[k]) || !e[k].length) { bad("STORY_SCHEMA", `${at} ${k} 必须是非空数组`); continue; }
    if (e[k].some((x) => typeof x !== "string" || !x.trim())) bad("STORY_SCHEMA", `${at} ${k} 含空项`);
  }
  if (typeof e.title === "string" && e.title.length > 40) bad("STORY_SCHEMA", `${at} title ${e.title.length} 字，超 40（抽屉一行放不下）`);

  if (!KINDS.includes(e.kind)) bad("STORY_KIND", `${at} kind=「${e.kind}」不在四选一（${KINDS.join("/")}）内`);
  if (CAVEAT_KINDS.includes(e.kind) && !(typeof e.caveat === "string" && e.caveat.trim()))
    bad("STORY_CAVEAT", `${at} kind=${e.kind} 必须写 caveat，否则读者会把它当史料用`);
  if (e.kind === "出土文献与档案" && !(typeof e.find === "string" && e.find.trim()))
    bad("STORY_FIND", `${at} 出土文献与档案必须写 find（出土地／藏地／入藏号），否则「原件」二字无凭`);

  const hasQuote = typeof e.quote === "string" && e.quote.trim();
  const hasState = typeof e.quoteState === "string" && e.quoteState.trim();
  if (hasQuote && !hasState) bad("STORY_QUOTE", `${at} 有 quote 却没有 quoteState：界面无法决定标「原文」还是「大意」，宁可不引`);
  if (!hasQuote && hasState) bad("STORY_QUOTE", `${at} 有 quoteState 却没有 quote`);
  if (hasState && !["verbatim", "paraphrase"].includes(e.quoteState))
    bad("STORY_QUOTE", `${at} quoteState=「${e.quoteState}」只允许 verbatim 或 paraphrase`);
  if (hasQuote && e.quoteState === "verbatim" && !locatable(e.src))
    bad("STORY_PROV", `${at} 标了 verbatim 但 src 没有一条能定位到位置（篇目/卷册/节页/日期/著录编号/链接）——逐字引文必须翻得到`);

  /* 立场：scene 是本站自己的话，不许替史料夸，也不许替史料贬。 */
  if (typeof e.scene === "string") {
    const bare = stripQuoted(e.scene);
    const hit = bare.match(PRAISE);
    if (hit) bad("STORY_STANCE", `${at} scene 出现评价词「${hit[0]}」且不在引号对内——复述不评价，要夸请写进视角层`);
    const sup = bare.match(SUPER);
    if (sup && !(typeof e.caveat === "string" && e.caveat.trim()))
      bad("STORY_SUPERLATIVE", `${at} scene 出现极值语「${sup[0]}」却没有 caveat：本站允许说「最早」，不允许不说凭什么`);
  }

  /* 锚点：ev 必须真在，且锚点自己得有出处。 */
  const a = byId.get(e.ev);
  if (!a) { bad("STORY_ANCHOR", `${at} 的 ev=「${e.ev}」在 data/cn·data/wd 里不存在`); continue; }
  const srcs = (a.detail && Array.isArray(a.detail.sources)) ? a.detail.sources : [];
  if (!srcs.length) bad("STORY_ANCHOR_PROV", `${at} 的锚点 ${e.ev} 本身没有任何出处，年份与场面都锚不住`);
}

/* ---------- 覆盖 ---------- */
/* 下限取 2026-11-05 实测值（292 条 / 9 片，单片最少 15 条：preqin）的下位整数。
 * 这是回归检测线：删一批会红，加一批不逼你加。总量线留 12 条余量，
 * 是因为分片内部的条目常有「合并两条重复」「某条挪去别的分片」这类合法减项。 */
const MIN_TOTAL = 280;
const MIN_CHUNKS = 9;
const MIN_PER_CHUNK = 14;
if (entries.length < MIN_TOTAL) bad("STORY_COVERAGE", `故事层总条数 ${entries.length} < ${MIN_TOTAL}`);
if (byFile.size < MIN_CHUNKS) bad("STORY_COVERAGE", `分片数 ${byFile.size} < ${MIN_CHUNKS}`);
for (const [f, v] of byFile) {
  if (v.n < MIN_PER_CHUNK) bad("STORY_COVERAGE", `${f}（${v.key}）仅 ${v.n} 条 < ${MIN_PER_CHUNK}`);
}

/* ---------- kind 分布 ---------- */
/* 全库若 100% 是「史载」，说明写条目的人在回避判断。这一条不是错误，是提醒，
 * 因此只在史载占比 > 0.9 时红——阈值故意留得很宽，正常补充不会撞到它。 */
const nShi = entries.filter((x) => x.e && x.e.kind === "史载").length;
if (entries.length >= 40 && nShi / entries.length > 0.9)
  bad("STORY_KIND", `史载占比 ${(nShi / entries.length * 100).toFixed(1)}% > 90%：异闻与附会一条都没有，等于本层没做过任何史料学判断`);

const out = {
  ok: errs.length === 0,
  errors: errs,
  stats: {
    entries: entries.length,
    chunks: byFile.size,
    perChunk: [...byFile].map(([f, v]) => `${f}:${v.key}=${v.n}`).join(" "),
    shi: nShi,
    verbatim: entries.filter((x) => x.e && x.e.quoteState === "verbatim").length,
    withCaveat: entries.filter((x) => x.e && x.e.caveat).length
  }
};
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  for (const e of errs) console.log("FAIL " + e);
  console.log(
    `故事层：${out.stats.entries} 条 / ${out.stats.chunks} 片（史载 ${out.stats.shi}、逐字引 ${out.stats.verbatim}、含注 ${out.stats.withCaveat}）` +
    (errs.length ? ` → ${errs.length} 处不合格` : " → 全部合格")
  );
}
process.exit(errs.length ? 1 : 0);
