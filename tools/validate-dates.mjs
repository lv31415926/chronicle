/* validate-dates.mjs | 「日」层门：日期只能从条目自己的文本里派生，且覆盖不许悄悄塌掉
 * 用法: node tools/validate-dates.mjs [--json] [--root <目录>]
 *
 * 为什么需要这道门：本站要把 1553 条「某年某月某日」端给读者看「历史上的今天」。
 * 这些日子不是编的，是从条目自己的 title/summary/detail.process/detail.sources 里取的，
 * 规则写在 tools/date-lib.mjs。但「派生一次就落盘」这件事本身没有持久效力：
 *   ① 有人手改 data/dates.js 里的一个数字 → 全库不会变红；
 *   ② 有人把条目正文里那句「1901年9月7日」改写成「1901年秋」→ 日层与正文从此各说各话；
 *   ③ 有人重跑生成器时口径没同步（date-lib 改了，data/dates.js 没重写）→ 界面拿旧日子配新账。
 * 三种都会让「历史上的今天」出现一个查不到出处的日期——比少收几条严重得多。
 * 所以本门的主体不是格式检查，而是**现算现比**：与 tools/date-candidates.mjs 共用同一份
 * date-lib，逐字对账；对不上就是红，不论哪一侧被改过。
 *
 * 检查码：
 *   DATES_FILE      data/dates.js 缺失／求值不出 __CHRONICLE_DATES／recs 不是数组
 *   DATES_RULE      文件里登记的口径串、历表分界 prolepticBefore、各月天数 mdays，
 *                   与 date-lib 当前值不一致
 *                   （改了口径没重生成；界面自己抄一份分界数字也算这一类）
 *   DATES_SCHEMA    单条记录字段缺失、类型不对、月日越界（如 2-30）、how 不在四层内、
 *                   mdays 不是 12 项历表
 *   DATES_DUP       同一 id 出现两次
 *   DATES_ID        id 在语料里不存在（条目被删而日层留着，界面点进去是空）
 *   DATES_DERIVE    盘上的 (m,d,how) 与现算结果不一致，或盘上有而现算不收（歧义／正文已无日），
 *                   或页脚要印的弃收条数 ambiguousCount、空格天数 blankDays 与现算不符
 *                   （blankDays 按各月真实天数数格子，自己数会数出 4/31 这种不存在的空日子）
 *   DATES_MISSING   现算该收却没登记上（生成器没跑完就提交了）
 *   DATES_COVERAGE  总条数／命中的日历格数／空格数越过回归线（少一批会红，多一批不逼你加）
 *
 * 已知盲区，写在门里而不是藏在心里：
 *   ① 本门只保证「日层与条目正文一致」，不保证正文自己写的那个日子是对的。
 *      正文纪日的核验属溯源层（prov）与人工核对的账，见 DATA_SCHEMA §14C。
 *   ② how=src 是**文书落款日**，不等于事件发生日；门管的是它别被当成事件日混淆——
 *      界面必须把这一层单独标出来，标没标由 test-units 的渲染用例看着。
 *   ③ 1583 年以前的纪日是后世历表推算（当时行儒略历），门不判其真伪，
 *      只要求界面带 isProleptic 的说明；这条由 date-lib 与界面共同承担。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, useRoot, ROOT as DEFAULT_ROOT } from "./geo-lib.mjs";
import { deriveAll, validMD, DATE_RULE, PROLEPTIC_BEFORE, blankCells, MDAYS } from "./date-lib.mjs";

const rootArg = process.argv.indexOf("--root");
const ROOT = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : DEFAULT_ROOT;
if (rootArg > 0) useRoot(ROOT);

const errs = [];
const bad = (c, m) => errs.push(`${c} ${m}`);
const HOWS = ["text", "process", "src", "text-cn"];

/* ---------- 读盘 ---------- */
const file = path.join(ROOT, "data/dates.js");
let D = null;
if (!fs.existsSync(file)) {
  bad("DATES_FILE", "data/dates.js 不存在（跑 node tools/date-candidates.mjs --apply）");
} else {
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  try {
    vm.runInContext(fs.readFileSync(file, "utf8"), sb, { filename: "data/dates.js" });
  } catch (e) {
    bad("DATES_FILE", `data/dates.js 求值失败：${e.message}`);
  }
  D = sb.__CHRONICLE_DATES;
  if (!D || !Array.isArray(D.recs)) bad("DATES_FILE", "data/dates.js 求值后没有 __CHRONICLE_DATES.recs 数组");
}

/* ---------- 现算 ---------- */
const corpus = loadCorpus();
const byId = new Map(corpus.map((e) => [e.id, e]));
const { recs: fresh, ambiguous } = deriveAll(corpus);
const freshById = new Map(fresh.map((r) => [r.id, r]));
const ambigById = new Map(ambiguous.map((a) => [a.id, a]));

const onDisk = new Map();
if (D && Array.isArray(D.recs)) {
  for (const r of D.recs) {
    /* 数组里多一个逗号就是一个洞（元素为 undefined）：JSON.stringify(undefined) 返回 undefined 本身，
     * 直接 .slice 会让门自己崩掉——崩了的门等于没有门，所以这里先把它变成一条 DATES_SCHEMA。 */
    if (!r || typeof r !== "object") { bad("DATES_SCHEMA", `记录不是对象（数组里多一个逗号就是个洞）：${String(JSON.stringify(r ?? null)).slice(0, 60)}`); continue; }
    const at = `${r.id || "(无 id)"}`;
    for (const k of ["id", "m", "d", "how"]) if (!(k in r)) bad("DATES_SCHEMA", `${at} 缺字段 ${k}`);
    if (typeof r.id !== "string" || !r.id) { bad("DATES_SCHEMA", `${at} id 不是非空字符串`); continue; }
    if (onDisk.has(r.id)) bad("DATES_DUP", `${at} 在同一文件里出现两次`);
    if (!Number.isInteger(r.m) || !Number.isInteger(r.d)) bad("DATES_SCHEMA", `${at} m/d 必须是整数`);
    else if (!validMD(r.m, r.d)) bad("DATES_SCHEMA", `${at} ${r.m}-${r.d} 不是合法月日（2 月最多 29，小月无 31）`);
    if (!HOWS.includes(r.how)) bad("DATES_SCHEMA", `${at} how=「${r.how}」不在四层（${HOWS.join("/")}）内`);
    onDisk.set(r.id, r);
  }
}

/* ---------- 口径与对账 ---------- */
if (D && typeof D.version !== "number") bad("DATES_FILE", "data/dates.js 缺 version");
if (D && D.rule !== DATE_RULE) {
  bad("DATES_RULE", `盘上口径「${D.rule}」≠ date-lib 当前「${DATE_RULE}」——改了派生规则必须重跑 --apply，否则界面拿旧日子配新账`);
}
/* 历表分界也跟着口径走：界面抄一份数字，date-lib 改了就一直用旧的那个说「这是推定日」 */
if (D && D.prolepticBefore !== PROLEPTIC_BEFORE) {
  bad("DATES_RULE", `盘上 prolepticBefore=${JSON.stringify(D && D.prolepticBefore)} ≠ date-lib 的 ${PROLEPTIC_BEFORE}——重跑 --apply`);
}
/* 页脚要印「有多少条因一年两日而不收」：这个数字是弃收的账，写错了就是当着读者的面虚报口径 */
if (D && "ambiguousCount" in D && D.ambiguousCount !== ambiguous.length) {
  bad("DATES_DERIVE", `盘上声明弃收 ${D.ambiguousCount} 条，现算弃收 ${ambiguous.length} 条——正文改过而日层没重生成`);
} else if (D && !("ambiguousCount" in D)) {
  bad("DATES_DERIVE", "盘上没有 ambiguousCount——页脚的弃收条数没处取，重跑 --apply");
}
/* 页脚还要印「空着几天」：这个数必须按各月真实天数数格子。
 * 自己写一遍 d<=31 的循环会把 4/31、6/31、9/31、11/31 当成空日子数进去——
 * 于是当着读者的面虚报这一页的缺口。口径只有 date-lib.blankCells 一份，界面不重算。 */
const blanksOnDisk = blankCells([...onDisk.values()]).length;
if (D && "blankDays" in D && D.blankDays !== blanksOnDisk) {
  bad("DATES_DERIVE", `盘上声明空 ${D.blankDays} 天，按盘上这份 recs 现算是 ${blanksOnDisk} 天——页脚的数字与名单不是同一份账，重跑 --apply`);
} else if (D && !("blankDays" in D)) {
  bad("DATES_DERIVE", "盘上没有 blankDays——页脚的空天数没处取（界面自己数格子就会把 4/31 数成空一天），重跑 --apply");
}
/* 各月天数这张表也在盘上：深链会点到 #/today/4/31 这种不存在的日子，
 * 界面要么照实说「这天不存在」，要么就得自己猜 4 月有几天——猜错就是当着读者画一个假日期。 */
if (D) {
  if (!Array.isArray(D.mdays) || D.mdays.length !== MDAYS.length) {
    bad("DATES_SCHEMA", `盘上 mdays 不是 12 项的历表（实为 ${JSON.stringify(D.mdays && D.mdays.length)}）——界面无法判断「4 月 31 日」存不存在，重跑 --apply`);
  } else if (D.mdays.some((v, i) => v !== MDAYS[i])) {
    bad("DATES_RULE", `盘上 mdays=[${D.mdays}] ≠ date-lib 的 [${MDAYS}]——历表改了而日层没重生成，深链校验按旧表判`);
  }
}

for (const [id, r] of onDisk) {
  const e = byId.get(id);
  if (!e) { bad("DATES_ID", `${id} 在语料里不存在（界面点进去是空，年份也无从派生）`); continue; }
  const f = freshById.get(id);
  if (!f) {
    if (ambigById.get(id)) {
      bad("DATES_DERIVE", `${id} 现算判为歧义（${ambigById.get(id).cands.map((c) => c.m + "/" + c.d).join(" 或 ")}），盘上却仍登记 ${r.m}/${r.d}——手挑一个就是造假，请回去把正文写清楚再 --apply`);
    } else {
      bad("DATES_DERIVE", `${id} 盘上记 ${r.m}/${r.d}，但条目正文里已经找不到与 year 同年的纪日（正文被改写而日层没跟着重生成）`);
    }
    continue;
  }
  if (f.m !== r.m || f.d !== r.d || f.how !== r.how) {
    bad("DATES_DERIVE", `${id} 盘上 ${r.m}/${r.d}(${r.how}) ≠ 现算 ${f.m}/${f.d}(${f.how})`);
  }
}
for (const r of fresh) if (!onDisk.has(r.id)) bad("DATES_MISSING", `${r.id} 现算该收（${r.m}/${r.d} ${r.how}）却没登记——--apply 没跑完就提交了`);

/* ---------- 覆盖回归线 ---------- */
/* 下限取 2026-11-06 实测值（1553 条 / 命中 356 格 / 空 10 天）的下方余量。
 * 这是回归检测线：删一批、把正文里的纪日改没，会红；多收不逼你加。 */
const MIN_RECS = 1400;
const MIN_SLOTS = 320;
const MAX_BLANKS = 45;
const slots = new Map();
for (const r of onDisk.values()) if (validMD(r.m, r.d)) slots.set(`${r.m}-${r.d}`, (slots.get(`${r.m}-${r.d}`) || 0) + 1);
const blanks = blanksOnDisk;
if (onDisk.size < MIN_RECS) bad("DATES_COVERAGE", `日层总条数 ${onDisk.size} < ${MIN_RECS}`);
if (slots.size < MIN_SLOTS) bad("DATES_COVERAGE", `命中的日历格 ${slots.size} < ${MIN_SLOTS}（「历史上的今天」会在某些日子直接空掉）`);
if (blanks > MAX_BLANKS) bad("DATES_COVERAGE", `日历空格 ${blanks} 天 > ${MAX_BLANKS}`);

const how = {};
for (const r of onDisk.values()) how[r.how] = (how[r.how] || 0) + 1;

if (process.argv.includes("--json")) {
  /* 每个检查码只带 PER_CODE 条样句，但**保证每个发过的码都有一条**：
   * 全量铺开时这份 JSON 能到十几万字，而调用方（自审脚本、CI）读到的 stdout 会在 64 KB 处被截断，
   * 截断的 JSON 解析不了，于是「门没按 --json 输出」——那是回执在撒谎，实况是门好好的。
   * 计数放 codes 里不丢，样句只裁展示，判据一条没少。 */
  const PER_CODE = 20;
  const byCode = {};
  for (const e of errs) { const c = e.split(" ")[0]; (byCode[c] = byCode[c] || []).push(e); }
  const codes = {};
  const sampled = [];
  for (const [c, list] of Object.entries(byCode)) {
    codes[c] = list.length;
    sampled.push(...list.slice(0, PER_CODE));
  }
  console.log(JSON.stringify({ ok: !errs.length, recs: onDisk.size, slots: slots.size, blanks, how,
    ambiguous: ambiguous.length, errTotal: errs.length, codes, errors: sampled, errorsTruncated: errs.length - sampled.length }, null, 2));
} else if (errs.length) {
  console.log(`日层门：${errs.length} 项不合格`);
  const byCode = {};
  for (const e of errs) { const c = e.split(" ")[0]; (byCode[c] = byCode[c] || []).push(e); }
  for (const [c, list] of Object.entries(byCode)) {
    console.log(`\n${c} ×${list.length}`);
    for (const m of list.slice(0, 8)) console.log("   " + m);
    if (list.length > 8) console.log(`   …另 ${list.length - 8} 项`);
  }
} else {
  console.log(`日层：${onDisk.size} 条 / 命中 ${slots.size} 格 / 空 ${blanks} 天（${Object.entries(how).map(([k, v]) => `${k} ${v}`).join("、")}），另有 ${ambiguous.length} 条因正文同年两日而不收 → 全部合格`);
}
process.exit(errs.length ? 1 : 0);
