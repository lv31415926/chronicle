#!/usr/bin/env node
/* validate-annals.mjs | 明史编年层门：这一层唯一的承诺是「每个字都在那一卷里」
 * 用法: node tools/validate-annals.mjs [--json] [--root <目录>]
 *
 * 编年层与事实层（data/cn·wd）的根本差别在这里：事实层的 summary 是本站写的话，
 * 编年层的 q 声称是《明史》原文。一句原文写错卷次，读者按卷去翻就会翻不到——
 * 那不是排版错，是伪托。所以本层最硬的一条门不是 schema，是 ANNALS_QUOTE：
 * 每条 q 必须是它所声称那一卷底本里的连续子串，逐字，不许拼接、不许改字。
 * 底本本身又必须有维基文库修订号（revision），否则「核的是哪一版」答不出来，
 * 子串比对就退化成「跟我手里这份一样」——那是自证。两个字段缺一即红。
 *
 * 其余判据的存在理由：
 *   · 纪年只有两个来源，a 字段明写：b=本纪连续、s=句内自标。志传绝不继承纪年，
 *     所以「a=b 而 s≠ji」这种组合一旦出现就是口径被改坏了，红。
 *   · m/L/g/w 四个时锚字段全部可由 q 复算（同 tools/mingshi-lib.mjs 的表）。
 *     复算不出来的那一条，说明有人手改了盘上的分片而不是改抽取器。
 *   · k 是派生字段，同理必须等于 kindOf(q)。
 *   · 清单说多少节点、片里就有多少；census 与实盘重算必须逐项相等。
 *     这条看着琐碎，但 2026-11-09 那次「转写把卷九十三从第 372 字截断」的事故，
 *     最先露馅的地方就是逐卷账与实盘不符。
 *
 * 检查码：
 *   ANNALS_CORPUS   底本清单与磁盘不一一对应／卷次重复越界／chars·bytes 与实文不符／缺修订号
 *   ANNALS_MANIFEST 编年清单与磁盘不一一对应／census 复算不符／perJuan 漏记底本卷／抽取账缺项
 *   ANNALS_SCHEMA   字段集、类型、id 形态、q 长度、枚举值不合法
 *   ANNALS_DUP      同一 id 出现两次／同一(卷,年)的序号不是 1..n（重号或跳号）
 *   ANNALS_JUAN     节点声称的卷次没有底本／部类与该卷底本不符
 *   ANNALS_QUOTE    q 不是所 claim 卷底本的连续子串（＝「不得伪托」的机器面）
 *   ANNALS_DATE     年份越界／eraYear(e)≠y／年号串不成形／a 与部类·原文矛盾／m·L·g·w 互相矛盾
 *   ANNALS_ANCHOR   一个时锚都没有／时锚从 q 里复算不出（声称的月、干支、是年在原文里找不到）
 *   ANNALS_MERGE    并进来的尾句改写纪年：自带另一个年号（节点系于前句之年），
 *                   或志/传尾句自带月/干支/是年（那是本该弃掉的独立系年句）
 *   ANNALS_KIND     k ≠ kindOf(q)
 *   ANNALS_SHARD    片内节点数／首末年多报漏报／未按年排序／节点落错年代段／单片超字节预算
 *   ANNALS_BUDGET   新两层合计或 data/ 全站超过体积上限
 *   ANNALS_COVERAGE 底本卷数／有节点卷数／节点总数／分部类／覆盖年／分片数低于回归线
 *
 * 已知盲区，写在门里而不是藏在心里：
 *   ① 本门验的是「q 在这份底本里」，不验「这份底本对」。维基文库那一页若被改坏，
 *      门照样绿。唯一对冲是 revision 已入册——换版必须重跑 normalize→corpus→annals 三件。
 *   ② 系年算术（年号→公元）由 tools/mingshi-lib.mjs 的 ERAS 表决定，门只能复算
 *      「y 与 e 是否自洽」，验不出「洪武元年是不是 1368」。表错则全层同错，改表须人审。
 *   ③ 本纪 a=b 的节点继承上一句纪年，卷内一旦出现跨年叙述（如「明年春」），
 *      门看不出来——那需要一台文言时间表达式解析器。抽读时优先抽本纪岁末年初的节点。
 *   ④ COVERAGE 线取 2026-11-09 实测下位整数，只保证不缩水，不保证收得全。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import {
  useRoot, root, CORPUS_DIR, ANNALS_DIR,
  MAXQ, MINQ, SHARD_BYTES, YEAR_MIN, YEAR_MAX, GZ, MONTH_RE, MONTH_NUM, YEAR_WORD_RE,
  firstGz, kindOf, KIND_KEYS, eraYear, ERA_NAMES, COMMENTARY, eraIn, splitSegments,
  SECTION_CODE, SECTION_LABEL, CODE_SECTION, ID_RE, bucketOf, pad3, juanNum,
  loadCorpusManifest, loadAnnalsManifest, loadAnnalsChunk, evalFile,
  COVERAGE_FLOOR, BUDGET,
} from "./mingshi-lib.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArg = process.argv.indexOf("--root");
if (rootArg > 0) useRoot(path.resolve(process.argv[rootArg + 1]));

const errs = [];
const perCode = new Map();
const SHOW_PER_CODE = 8;
/* 一万个节点里若有八千条同码错（转写坏掉时就是这样），全打出来会把 CI 日志埋掉，
   反而看不见第二个真正的病因。所以每码只展示前若干条，余量报数。 */
function bad(code, msg) {
  const n = (perCode.get(code) || 0) + 1;
  perCode.set(code, n);
  if (n <= SHOW_PER_CODE) errs.push(`${code} ${msg}`);
  else if (n === SHOW_PER_CODE + 1) errs.push(`${code} …同码还有，见汇总`);
}

function safeLoad(rel, code, what) {
  const abs = path.isAbsolute(rel) ? rel : path.join(root(), rel);
  if (!fs.existsSync(abs)) { bad(code, `${rel} 不存在（${what}）`); return null; }
  try {
    return evalFile(abs);
  } catch (e) {
    bad(code, `${rel} 求值失败：${e.message}（${what}）`);
    return null;
  }
}

const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const NODE_KEYS = ["i", "y", "m", "L", "g", "w", "j", "s", "a", "e", "k", "q"];
const ERA_HEAD_RE = new RegExp(`^(${ERA_NAMES.join("|")})([元一二三四五六七八九十]{1,3})$`);

/* ───────────────────────── 1. 底本层 ───────────────────────── */
let corpusByJuan = new Map();
/* 卷题三形状的逐卷计数，随门一起报出来：README 里那句「326/3/1」是抄这一行的读数，
   不是人手数一遍——数的人换了载体（清单 title vs 文件头注）就会数出两个不同的数。 */
const titleShapes = { A: 0, B: 0, C: 0 };
{
  const sb = safeLoad(path.join(CORPUS_DIR, "manifest.js"), "ANNALS_CORPUS", "底本清单");
  const cm = sb && sb.__CHRONICLE_CORPUS_MANIFEST;
  if (!cm || !Array.isArray(cm.chunks) || !cm.chunks.length) {
    bad("ANNALS_CORPUS", "data/corpus/mingshi/manifest.js 缺失、不可求值或 chunks 为空——没有底本，编年层的每条引文都是无本之木");
  } else {
    const disk = fs.readdirSync(CORPUS_DIR).filter((f) => /^ms\d+\.js$/.test(f)).sort();
    const reg = new Set();
    for (const c of cm.chunks) {
      const at = `底本 ${c.id || "(无 id)"}`;
      if (!isInt(c.juan) || c.juan < 1 || c.juan > 332) { bad("ANNALS_CORPUS", `${at} 卷号非法：${c.juan}（明史共 332 卷）`); continue; }
      if (reg.has(c.juan)) { bad("ANNALS_CORPUS", `${at} 卷 ${c.juan} 在清单里出现两次`); continue; }
      reg.add(c.juan);
      if (c.id !== `ms${c.juan}`) bad("ANNALS_CORPUS", `${at} id 与卷号不符（应为 ms${c.juan}）`);
      if (c.file !== `ms${c.juan}.js`) bad("ANNALS_CORPUS", `${at} file 与卷号不符（应为 ms${c.juan}.js）`);
      if (!SECTION_CODE[c.section]) bad("ANNALS_CORPUS", `${at} 部类「${c.section}」不在 本纪/志/表/列传 之内`);
      if (typeof c.title !== "string" || !c.title.trim())
        bad("ANNALS_CORPUS", `${at} 缺卷题 title（读者按卷题核对，空的等于没核）`);
      /* 卷题只有三种合法形状，口径在 mingshi-normalize 的 classify（为什么只有这三种，注释里逐条写了）：
         A 页上照抄的「明史卷N＋篇目」；B 页内根本没有卷题，只报页上篇目并声明卷次依页名；
         C 页内卷题与页名冲突，只报冲突、不取那串题。
         这条判据的意义：title 是读者拿去翻页的那串字，形状之外的任何写法都只能是人手编的；
         而形状 A 若自报的卷号和清单卷号对不上，读者按题翻到的就是另一页——那是伪托。
         A 不能再往下一层：把 title 拿去和底本正文对勘，实测 0/326 命中——卷题不是正文里的字，
         它派生自页头导航行（build/mingshi/ledger.json 的 head，如「明史卷一本纪第一太祖一►本纪第二太祖二」），
         normalize 落盘时只把导航行以下的正文写进底本。所以 A 在机器上只能验卷号自洽；
         「这串题真在页上」可对勘的那份 head 在 build/ 里，被 gitignore、可再生而 clone 后无此物，
         门不能拿它当判据，否则发布面永远红。 */
      else if (/^明史(?:\[\d+\])?卷/.test(c.title)) {
        const quoted = juanNum((c.title.match(/卷([一二三四五六七八九十百千〇零\d]+)/) || [])[1]);
        if (quoted !== c.juan)
          bad("ANNALS_CORPUS", `${at} 卷题自称卷${quoted ?? "?"}，清单却记在卷${c.juan}——按题翻到的是另一页：${c.title}`);
        else titleShapes.A++;
      } else if (c.title.startsWith("（页内无卷题")) {
        const m = c.title.match(/^（页内无卷题，卷次依页名卷(\d+)）(.+)/);
        if (!m || Number(m[1]) !== c.juan)
          bad("ANNALS_CORPUS", `${at} 声明「页内无卷题」却没有写明依页名卷${c.juan}，或后面没有页上篇目：${c.title}`);
        else titleShapes.B++;
      } else if (c.title.startsWith("（页内卷题作")) {
        /* C 形状必须把冲突的那串题原样报出来，而且报出来的卷号不能就是本页：
           「声明冲突」本身可以被拿来 launder——把本页的卷号抄进声明体，读起来像核对过，
           实际一句也没核。所以这里判整串形状，不判 includes。 */
        const m = c.title.match(/^（页内卷题作「([^」]*卷[^」]*)」，与页名卷(\d+)不符，不取）$/);
        const inner = m && juanNum((m[1].match(/卷([一二三四五六七八九十百千〇零\d]+)/) || [])[1]);
        if (!m || Number(m[2]) !== c.juan)
          bad("ANNALS_CORPUS", `${at} 声明卷题与页名冲突，却没报出那串原题（含「卷」）、没点明本页卷次${c.juan}或没声明不取：${c.title}`);
        else if (inner === c.juan)
          bad("ANNALS_CORPUS", `${at} 声明「页内卷题与页名不符」，可报出来的题正是卷${c.juan}——没有冲突却写成冲突：${c.title}`);
        else titleShapes.C++;
      } else
        bad("ANNALS_CORPUS", `${at} 卷题「${c.title}」既不是页上原文（明史卷N…），也不是两种声明体之一（页内无卷题／页内卷题作…）——那只能是手写卷题`);
      if (!isInt(c.chars) || c.chars <= 0) bad("ANNALS_CORPUS", `${at} chars 应为正整数，实得 ${c.chars}`);
      if (!isInt(c.bytes) || c.bytes <= 0) bad("ANNALS_CORPUS", `${at} bytes 应为正整数，实得 ${c.bytes}`);
      /* 修订号：「不得伪托」的另一半。没有它，只能说「和我手里这份一样」，
         说不出「哪一版」——版本一旦悄悄变了，先前所有核对同时作废。 */
      if (!isInt(c.revision) || c.revision <= 0)
        bad("ANNALS_CORPUS", `${at} 缺维基文库修订号 revision：说不出核的是哪一版，引文无法复核`);
      const abs = path.join(CORPUS_DIR, c.file || "");
      if (!fs.existsSync(abs)) { bad("ANNALS_CORPUS", `${at} 清单登记了 ${c.file}，磁盘上没有（装载会 404，该卷引文全数悬空）`); continue; }
      const text = safeLoad(abs, "ANNALS_CORPUS", "底本卷文");
      const w = text && text.__CHRONICLE_CORPUS;
      if (!w || typeof w[`ms${c.juan}`] !== "string") { bad("ANNALS_CORPUS", `${at} ${c.file} 装载不到 window.__CHRONICLE_CORPUS["ms${c.juan}"]`); continue; }
      const s = w[`ms${c.juan}`];
      if ([...s].length !== c.chars) bad("ANNALS_CORPUS", `${at} 清单称 ${c.chars} 字，实文 ${[...s].length} 字（底本被改过而清单未重生成）`);
      if (Buffer.byteLength(fs.readFileSync(abs)) !== c.bytes) bad("ANNALS_CORPUS", `${at} 清单称 ${c.bytes} 字节，实文件 ${Buffer.byteLength(fs.readFileSync(abs))} 字节`);
      const head = fs.readFileSync(abs, "utf8").split("\n", 1)[0];
      if (isInt(c.revision) && !head.includes(`revision ${c.revision}`))
        bad("ANNALS_CORPUS", `${at} 文件头注里的修订号与清单不一致（人读的出处和机器记的出处必须同一个数）`);
      corpusByJuan.set(c.juan, { meta: c, text: s });
    }
    for (const f of disk) if (!reg.has(Number(f.match(/^ms(\d+)\.js$/)[1]))) bad("ANNALS_CORPUS", `磁盘上的 ${f} 未登记进清单（装载层按清单注入，这份永远不会被读到）`);
  }
}

/* ───────────────────────── 2. 编年清单 ───────────────────────── */
let annalsManifest = null;
{
  const sb = safeLoad(path.join(ANNALS_DIR, "manifest.js"), "ANNALS_MANIFEST", "编年清单");
  annalsManifest = sb && sb.__CHRONICLE_ANNALS_MANIFEST;
  if (!annalsManifest) bad("ANNALS_MANIFEST", "data/annals/manifest.js 缺失或不可求值");
  else if (!Array.isArray(annalsManifest.chunks) || !annalsManifest.chunks.length)
    bad("ANNALS_MANIFEST", "清单里没有 chunks（装载层按此表注入，空表等于整层不可见）");
  else if (!annalsManifest.census) bad("ANNALS_MANIFEST", "清单缺 census（逐卷抽取账——没有它，缩水只能靠肉眼发现）");
}

/* ───────────────────────── 3. 逐节点 ───────────────────────── */
const nodes = [];
if (annalsManifest && Array.isArray(annalsManifest.chunks)) {
  const diskShards = fs.existsSync(ANNALS_DIR)
    ? fs.readdirSync(ANNALS_DIR).filter((f) => /^annals-.*\.js$/.test(f)).sort() : [];
  const regFiles = new Set();
  for (const c of annalsManifest.chunks) {
    const at = `分片 ${c.id || "(无 id)"}`;
    if (!/^(ji|zhi|zhuan|biao)-\d+$/.test(String(c.id))) bad("ANNALS_SHARD", `${at} 片 id 形态应为 <部类码>-<年代段起年>`);
    if (c.file !== `annals-${c.id}.js`) bad("ANNALS_SHARD", `${at} file 应为 annals-${c.id}.js，实得 ${c.file}`);
    regFiles.add(c.file);
    if (!fs.existsSync(path.join(ANNALS_DIR, c.file || ""))) { bad("ANNALS_MANIFEST", `${at} 登记了 ${c.file}，磁盘上没有`); continue; }
    const list = loadAnnalsChunk(c.file, c.id);
    if (!list) { bad("ANNALS_MANIFEST", `${at} ${c.file} 装载不到 window.__CHRONICLE_ANNALS["${c.id}"]`); continue; }
    for (const nd of list) nodes.push({ nd, chunk: c });
  }
  for (const f of diskShards) if (!regFiles.has(f)) bad("ANNALS_MANIFEST", `磁盘上的 ${f} 未登记进清单（装载层读不到它，那片节点等于不存在）`);
}

const corpusMisses = new Map();     // juan → 这一卷有多少条 q 核不到（整卷烂掉时报一次，不刷 300 条同码）
/* 并句账（ANNALS_MERGE）用的段尾表：按卷算一次，缓存到本门结束。
 * 切法用 tools/mingshi-lib.mjs 的 splitSegments——抽取器分的段和门认的段必须同源，
 * 否则「引号内的句号」一边算断点、一边不算，门就会把《明史》本来说完的一句话判成并进来的。 */
const segEndsCache = new Map();
function segEnds(juan, text) {
  let e = segEndsCache.get(juan);
  if (!e) { e = splitSegments(text).map(([, b]) => b); segEndsCache.set(juan, e); }
  return e;
}
const seqByGroup = new Map();
const seenId = new Set();
const perJuanRecount = new Map();
const yearsSeen = new Set();
const bySection = {}, byKind = {}, byAnchor = {};

for (const { nd, chunk } of nodes) {
  const at = `${chunk.file} ${nd && nd.i ? nd.i : "(无 id)"}`;
  if (!nd || typeof nd !== "object") { bad("ANNALS_SCHEMA", `${at} 不是对象`); continue; }

  const keys = Object.keys(nd).sort().join(",");
  if (keys !== NODE_KEYS.slice().sort().join(","))
    bad("ANNALS_SCHEMA", `${at} 字段集应为 ${NODE_KEYS.join("/")}，实得 ${keys || "(空)"}（多一个字段装载层就得跟着改，少一个字段界面拿不到东西）`);

  if (typeof nd.i !== "string" || !ID_RE.test(nd.i)) bad("ANNALS_SCHEMA", `${at} id 形态应为 ms-<卷三位>-<年四位>-<当年序号三位>`);
  if (seenId.has(nd.i)) bad("ANNALS_DUP", `${at} id 重复`);
  seenId.add(nd.i);

  if (typeof nd.q !== "string" || !nd.q) { bad("ANNALS_SCHEMA", `${at} q 必须是非空字符串`); continue; }
  const qlen = [...nd.q].length;
  if (qlen > MAXQ) bad("ANNALS_SCHEMA", `${at} q ${qlen} 字 > 单节点上限 ${MAXQ}（长河上一屏读不完，抽取器本应在超长处断开）`);
  if (qlen < MINQ) bad("ANNALS_SCHEMA", `${at} q 仅 ${qlen} 字 < ${MINQ}：这么短的段抽取器应当并句而不是独立成节点`);
  if (nd.q !== nd.q.trim()) bad("ANNALS_SCHEMA", `${at} q 首尾有空白，不是底本切句该有的样子`);
  if (COMMENTARY.test(nd.q)) bad("ANNALS_SCHEMA", `${at} q 起首是史臣评述（赞曰／论曰），本层只收系日记事`);
  /* 断句按 UTF-16 偏移切，生僻字（Unicode 扩展 B 区，本层实测 53 条含之）正好落在
     切点两侧时会切出半个字。切点都在「。」之后，实测不会发生——但那是巧合不是性质。 */
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/.test(nd.q))
    bad("ANNALS_SCHEMA", `${at} q 含孤立代理对：断句把一个生僻字从中间切开了`);

  for (const k of ["y", "m", "L", "w", "j", "s", "a", "e", "k", "g"]) {
    const v = nd[k];
    if (k === "s" || k === "a" || k === "e" || k === "k" || k === "g") {
      if (typeof v !== "string") bad("ANNALS_SCHEMA", `${at} ${k} 应为字符串，实得 ${typeof v}`);
    } else if (!isInt(v)) bad("ANNALS_SCHEMA", `${at} ${k} 应为整数，实得 ${JSON.stringify(v)}`);
  }
  if (!CODE_SECTION[nd.s]) bad("ANNALS_SCHEMA", `${at} 部类码「${nd.s}」不在 ji/zhi/biao/zhuan 之内`);
  if (!["b", "s"].includes(nd.a)) bad("ANNALS_SCHEMA", `${at} 系年来源 a=「${nd.a}」只允许 b（本纪连续）或 s（句内自标）`);
  if (!KIND_KEYS.includes(nd.k)) bad("ANNALS_SCHEMA", `${at} 类别码「${nd.k}」不在派生表之内`);
  if (!isInt(nd.j) || nd.j < 1 || nd.j > 332) bad("ANNALS_SCHEMA", `${at} 卷次 ${nd.j} 越出 1—332`);
  if (!isInt(nd.y) || nd.y < YEAR_MIN || nd.y > YEAR_MAX)
    bad("ANNALS_DATE", `${at} 公元年 ${nd.y} 越出 [${YEAR_MIN}, ${YEAR_MAX}]（元统前／崇祯后不在本层口径内）`);
  if (!isInt(nd.m) || nd.m < 0 || nd.m > 12) bad("ANNALS_DATE", `${at} 月 ${nd.m} 不在 0—12（0 表示原文未记月）`);
  if (![0, 1].includes(nd.L)) bad("ANNALS_DATE", `${at} 闰标识 L=${nd.L} 只允许 0/1`);
  if (![0, 1].includes(nd.w)) bad("ANNALS_DATE", `${at} 以年计标识 w=${nd.w} 只允许 0/1`);
  if (nd.g && !GZ.has(nd.g)) bad("ANNALS_DATE", `${at} 干支「${nd.g}」不成对（六十甲表内没有）`);
  if (nd.L && !nd.m) bad("ANNALS_DATE", `${at} 标了闰（L=1）却没有月（m=${nd.m}）——闰附着于月，无月之闰不成立`);

  /* 年号串与年份必须互相算得回来。这是本层唯一一条「时间可复算」的硬闸：
     y 抄错一位、e 与 y 来自不同卷，都在这里现形。 */
  const em = ERA_HEAD_RE.exec(nd.e || "");
  if (!em) bad("ANNALS_DATE", `${at} 年号串「${nd.e}」不成形（应为 ${ERA_NAMES.slice(0, 3).join("/")}… + 汉数年份）`);
  else {
    const recalc = eraYear(nd.e);
    if (recalc === null) bad("ANNALS_DATE", `${at} 年号「${nd.e}」的年份数字解析不出`);
    else if (recalc !== nd.y) bad("ANNALS_DATE", `${at} 年号 ${nd.e} 推得 ${recalc}，节点却记 y=${nd.y}`);
  }
  /* 系年来源的两条硬关系（口径见 tools/mingshi-annals.mjs 头注） */
  if (nd.a === "b" && nd.s !== "ji")
    bad("ANNALS_DATE", `${at} a=b（继承上一句纪年）却出自${SECTION_LABEL[nd.s] || nd.s}：非编年体跨段即成追述，本层宁少收也不继承`);
  if (nd.a === "s" && !(typeof nd.e === "string" && nd.q.includes(nd.e + "年")))
    bad("ANNALS_DATE", `${at} a=s（句内自带年号）却在 q 里找不到「${nd.e}年」——这条其实是继承来的，口径不诚实`);

  /* 时锚：允许无锚句并入前节点，不允许独立成节点。且四个字段全部可由 q 复算。 */
  const head = nd.q.split("，")[0];
  const mm = head.match(MONTH_RE);
  const gz = firstGz(head);
  const yw = YEAR_WORD_RE.test(nd.q);
  const wantM = mm ? MONTH_NUM[mm[3]] : 0;
  const wantL = mm && mm[2] ? 1 : 0;
  const wantW = yw && !gz && !mm ? 1 : 0;
  if (!nd.m && !nd.g && !nd.w)
    bad("ANNALS_ANCHOR", `${at} 无月、无干支日、不以「是年／其年」起句——这样的句子在本层只能并入前节点，不能独立占一个时间位`);
  if (nd.g !== gz)
    bad("ANNALS_ANCHOR", `${at} 声称干支日「${nd.g}」，按同一张表从原文首句复算得「${gz || "(无)"}」（首句=${head.slice(0, 20)}）`);
  if (nd.m !== wantM)
    bad("ANNALS_ANCHOR", `${at} 声称月 ${nd.m}，原文首句复算得 ${wantM}（首句=${head.slice(0, 20)}）`);
  if (nd.L !== wantL) bad("ANNALS_ANCHOR", `${at} 闰标识与原文首句不符（复算 L=${wantL}，首句=${head.slice(0, 20)}）`);
  if (nd.w !== wantW) bad("ANNALS_ANCHOR", `${at} 「是年／其年」标记与原文起首不符（复算 w=${wantW}）`);

  if (kindOf(nd.q) !== nd.k) bad("ANNALS_KIND", `${at} k=${nd.k}，按派生表对最终 q 复算应为 ${kindOf(nd.q)}`);

  /* 出处：卷次必须真在底本里，且 q 是那一卷的连续子串。 */
  perJuanRecount.set(nd.j, (perJuanRecount.get(nd.j) || 0) + 1);
  yearsSeen.add(nd.y);
  bySection[nd.s] = (bySection[nd.s] || 0) + 1;
  byKind[nd.k] = (byKind[nd.k] || 0) + 1;
  byAnchor[nd.a] = (byAnchor[nd.a] || 0) + 1;

  const pre = `ms-${pad3(nd.j)}-${nd.y}-`;
  if (typeof nd.i === "string" && nd.i.startsWith(pre) && /^\d{3}$/.test(nd.i.slice(pre.length))) {
    const key = pre;
    const arr = seqByGroup.get(key) || [];
    arr.push(Number(nd.i.slice(pre.length)));
    seqByGroup.set(key, arr);
  } else if (typeof nd.i === "string") {
    bad("ANNALS_DUP", `${at} id 的前两段没有编码自己的卷次与年份（应为 ${pre}×××）——按卷核对时会指错卷`);
  }

  const cp = corpusByJuan.get(nd.j);
  if (!cp) {
    bad("ANNALS_JUAN", `${at} 声称出自明史卷${nd.j}，底本里没有这一卷——没有底本的卷次就是伪托`);
    continue;
  }
  if (SECTION_CODE[cp.meta.section] !== nd.s)
    bad("ANNALS_JUAN", `${at} 节点部类「${nd.s}」与底本卷${nd.j}（${cp.meta.section}）不符`);
  if (!cp.text.includes(nd.q)) {
    const n = (corpusMisses.get(nd.j) || 0) + 1;
    corpusMisses.set(nd.j, n);
    bad("ANNALS_QUOTE", `${at} q 不是底本卷${nd.j}的连续子串（逐字比对）——或改动了原文，或卷次写错了地方`);
  } else {
    /* 并句不得改写纪年：q 是「锚定句 + 若干无锚尾句」的连续切片，锚定句由 ANNALS_ANCHOR
       管，这里管尾句。尾句一旦自带年号又与 nd.y 不同，读者就会看到一句至正十三年的话
       立在至正十二年的时间位上——那是本站替《明史》改了纪年，比伪托更隐蔽。
       引号内的年号不算尾句（splitSegments 在深度>0 处不断句），因为那是原文一句里本来的话。
       同一句 q 在同一卷里可出现多次（2026-11-10 全量实测：7535 个节点里 274 个的 q 重复，涉及 105 句，
       中位 3 处、最多 10 处，如「洪武十五年三月为府。」）。只判第一处＝第一处合法就放行，
       别处捎了什么没人看——所以逐处判，判定取并集，同一条话只报一次。 */
    const msgs = new Set();
    for (let off = cp.text.indexOf(nd.q); off >= 0; off = cp.text.indexOf(nd.q, off + 1)) {
      const qEnd = off + nd.q.length;
      const inner = segEnds(nd.j, cp.text).filter((b) => b > off && b < qEnd);
      /* inner[i] 是第 i+1 句的止点；尾句共 inner.length 条，最后一条收到 q 末尾。 */
      for (let i = 0; i < inner.length; i++) {
        const tail = cp.text.slice(inner[i], i + 1 < inner.length ? inner[i + 1] : qEnd)
          .replace(/^[。，、\s]*/, "");
        const { own, era } = eraIn(tail);
        if (own != null && own !== nd.y)
          msgs.add(`并入的尾句自带年号「${era}」= ${own}，节点却系于 ${nd.y}：${tail.slice(0, 24)}`);
        /* 第二条判据（2026-11-10 补，同一批审查里的 P0）：志、传的尾句不许自带时锚。
           那两部的口径是「无年号即弃」，弃掉的句子若在盘上以尾句形式出现，说明抽取器
           只记了弃账、q 却按连续偏移把它捎了进来（断链漏在一处 continue 上）。
           危害比年号那条更隐蔽：裸「三年十二月置青州都卫」没有年号，eraIn 认不出 own，
           年号判据看不见，读者却把它读成节点之年。抽取器只把短于 MINQ 的段无条件尾随，
           所以 ≥MINQ 且首句带月/干支、或以「是年/其年」起句的尾句一律红。
           锚的判法与抽取器同口径：月与干支只看首读（split("，")[0]），是年看整句。 */
        if (nd.s !== "ji" && [...tail].length >= MINQ) {
          const head = tail.split("，")[0];
          const anchor = firstGz(head) || (head.match(MONTH_RE) || [])[0] || (YEAR_WORD_RE.test(tail) ? "是年" : "");
          if (anchor)
            msgs.add(`志/传节点系于 ${nd.y}，尾句却自带时锚「${anchor}」——那是被弃的独立系年句，不该在 q 里：${tail.slice(0, 24)}`);
        }
      }
    }
    for (const m of msgs) bad("ANNALS_MERGE", `${at} ${m}`);
  }
}

/* (卷,年) 组内序号必须恰好是 1..n：重号会被装载层覆盖，跳号说明有节点被手工删过。 */
for (const [key, arr] of seqByGroup) {
  arr.sort((a, b) => a - b);
  if (arr.length !== new Set(arr).size) bad("ANNALS_DUP", `${key}××× 组内序号出现重号（${arr.join(",")}）`);
  else if (arr[0] !== 1 || arr[arr.length - 1] !== arr.length)
    bad("ANNALS_DUP", `${key}××× 组内序号不是 1..${arr.length}（实得 ${arr.join(",")}）`);
}

/* ───────────────────────── 4. 分片级 ───────────────────────── */
if (annalsManifest && Array.isArray(annalsManifest.chunks)) {
  for (const c of annalsManifest.chunks) {
    if (!fs.existsSync(path.join(ANNALS_DIR, c.file || ""))) continue;
    const list = loadAnnalsChunk(c.file, c.id);
    if (!list) continue;
    const bytes = fs.statSync(path.join(ANNALS_DIR, c.file)).size;
    const at = `分片 ${c.id}`;
    if (c.count !== list.length) bad("ANNALS_SHARD", `${at} 清单称 ${c.count} 节点，片内实有 ${list.length}`);
    if (c.bytes !== bytes) bad("ANNALS_SHARD", `${at} 清单称 ${c.bytes} 字节，磁盘实为 ${bytes}`);
    if (list.length) {
      if (c.yearFrom !== list[0].y || c.yearTo !== list[list.length - 1].y)
        bad("ANNALS_SHARD", `${at} 清单称年代 ${c.yearFrom}—${c.yearTo}，片内首末为 ${list[0].y}—${list[list.length - 1].y}`);
      let inv = 0, wrong = 0;
      for (let i = 1; i < list.length; i++) if (list[i].y < list[i - 1].y) inv++;
      for (const nd of list) if (bucketOf(nd.s, nd.y) !== c.id) wrong++;
      if (inv) bad("ANNALS_SHARD", `${at} 片内有 ${inv} 处年份逆序（装载层按序二分定位，乱序会漏读）`);
      if (wrong) bad("ANNALS_SHARD", `${at} 有 ${wrong} 个节点不属于本片年代段（按 bucketOf 应在别片）`);
    }
    if (bytes > SHARD_BYTES) bad("ANNALS_SHARD", `${at} ${bytes} 字节 > 单片预算 ${SHARD_BYTES}（长河密层按片加载，大片会把首屏拖死）`);
  }
}

/* ───────────────────────── 5. census 对账 ───────────────────────── */
const census = annalsManifest && annalsManifest.census;
if (census) {
  const eq = (k, got, want) => { if (got !== want) bad("ANNALS_MANIFEST", `census.${k} 记 ${got}，实盘重算得 ${want}`); };
  eq("nodes", census.nodes, nodes.length);
  eq("years", census.years, yearsSeen.size);
  eq("from", census.from, yearsSeen.size ? Math.min(...yearsSeen) : null);
  eq("to", census.to, yearsSeen.size ? Math.max(...yearsSeen) : null);
  eq("bytes", census.bytes, annalsManifest.chunks.reduce((a, c) => a + (fs.existsSync(path.join(ANNALS_DIR, c.file || "")) ? fs.statSync(path.join(ANNALS_DIR, c.file)).size : 0), 0));
  const sameMap = (name, want) => {
    const got = census[name];
    if (!got || typeof got !== "object") { bad("ANNALS_MANIFEST", `census.${name} 缺失`); return; }
    const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
    for (const k of keys) if (got[k] !== want[k]) bad("ANNALS_MANIFEST", `census.${name}.${k} 记 ${got[k]}，实盘重算得 ${want[k]}`);
  };
  sameMap("bySection", bySection);
  sameMap("byKind", byKind);
  sameMap("byAnchor", byAnchor);
  for (const k of ["merged", "mergeConflict", "droppedNoAnchor", "overLong", "commentary"]) {
    if (!isInt(census[k]) || census[k] < 0) bad("ANNALS_MANIFEST", `census.${k} 应为非负整数（抽取时的弃句账），实得 ${JSON.stringify(census[k])}`);
  }
  /* 逐卷账：底本里每一卷（表除外）都必须在账上留一行，n 与实盘相等。
     漏记与实盘不符是两类完全不同的事故——前者是工具跳了卷，后者是盘被手改过。 */
  const perJuan = Array.isArray(census.perJuan) ? census.perJuan : null;
  if (!perJuan) bad("ANNALS_MANIFEST", "census.perJuan 缺失（逐卷抽取账是「哪一卷洗空了」唯一的可见处）");
  else {
    const rows = new Map(perJuan.map((r) => [r.j, r]));
    if (rows.size !== perJuan.length) bad("ANNALS_MANIFEST", "census.perJuan 有重复卷次");
    for (const [juan, cp] of corpusByJuan) {
      if (cp.meta.section === "表") {
        if (rows.has(juan)) bad("ANNALS_MANIFEST", `卷${juan} 是表，本期不入编年层，不该出现在 perJuan`);
        continue;
      }
      const r = rows.get(juan);
      if (!r) { bad("ANNALS_MANIFEST", `底本有卷${juan}（${cp.meta.section}）而 perJuan 漏记——抽取器跳过或未登记这一卷`); continue; }
      if (r.chars !== [...cp.text].length)
        bad("ANNALS_MANIFEST", `perJuan 卷${juan} 记 chars=${r.chars}，底本实为 ${[...cp.text].length} 字`);
      if (r.s !== SECTION_CODE[cp.meta.section])
        bad("ANNALS_MANIFEST", `perJuan 卷${juan} 部类记 ${r.s}，底本为 ${cp.meta.section}`);
      if (r.n !== (perJuanRecount.get(juan) || 0))
        bad("ANNALS_MANIFEST", `perJuan 卷${juan} 记 n=${r.n} 节点，盘上实有 ${perJuanRecount.get(juan) || 0}`);
      if (!isInt(r.merged) || r.merged < 0) bad("ANNALS_MANIFEST", `perJuan 卷${juan} 缺 merged 弃并账`);
    }
    for (const r of perJuan) if (!corpusByJuan.has(r.j)) bad("ANNALS_MANIFEST", `perJuan 记了卷${r.j}，底本里没有这一卷`);
  }
}

/* ───────────────────────── 6. 体积预算 ───────────────────────── */
function dirBytes(abs) {
  if (!fs.existsSync(abs)) return 0;
  let sum = 0;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, e.name);
    sum += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return sum;
}
let budgetRead = "";
{
  const dataDir = path.join(root(), "data");
  const layers = dirBytes(CORPUS_DIR) + dirBytes(ANNALS_DIR);
  const total = dirBytes(dataDir);
  const mb = (b) => `${(b / 1048576).toFixed(2)}MB`;
  /* 余量每次都要打出来：BUDGET 是硬顶，只在撞线时才说话，而底本还有 85 卷要补——
     撞线那一次才发现，就得回头决定砍哪几卷；读数常在，扩量就是按余额加减的算术。 */
  budgetRead = `｜两层 ${mb(layers)}/${mb(BUDGET.layersBytes)}｜data ${mb(total)}/${mb(BUDGET.dataBytes)}`;
  if (layers > BUDGET.layersBytes)
    bad("ANNALS_BUDGET", `底本+编年两层合计 ${mb(layers)} > 预算 ${mb(BUDGET.layersBytes)}（本期口径：纪+志全量、列传只收硬锚；超了要么收多了，要么该把底本改成按需分包）`);
  if (total > BUDGET.dataBytes)
    bad("ANNALS_BUDGET", `data/ 全站 ${mb(total)} > 上限 ${mb(BUDGET.dataBytes)}（这一期定下的硬顶，超线必须回到决策本身，不是把线抬高）`);
}

/* ───────────────────────── 7. 回归检测线 ───────────────────────── */
{
  const F = COVERAGE_FLOOR;
  const annalJuans = perJuanRecount.size;
  const line = (k, got) => { if (got < F[k]) bad("ANNALS_COVERAGE", `${k} 实得 ${got} < 回归线 ${F[k]}（线取 2026-11-09 实测下位整数，抓的是缩水不是催扩量）`); };
  line("corpusJuans", corpusByJuan.size);
  line("annalJuans", annalJuans);
  line("nodes", nodes.length);
  line("years", yearsSeen.size);
  line("chunks", annalsManifest && Array.isArray(annalsManifest.chunks) ? annalsManifest.chunks.length : 0);
  line("ji", bySection.ji || 0);
  line("zhi", bySection.zhi || 0);
  line("zhuan", bySection.zhuan || 0);
}

/* ───────────────────────── 输出 ───────────────────────── */
const out = {
  ok: errs.length === 0,
  errors: errs,
  codeCounts: Object.fromEntries(perCode),
  stats: {
    corpusJuans: corpusByJuan.size,
    nodes: nodes.length,
    chunks: annalsManifest && Array.isArray(annalsManifest.chunks) ? annalsManifest.chunks.length : 0,
    annalJuans: perJuanRecount.size,
    years: yearsSeen.size,
    titleShapes,
    from: yearsSeen.size ? Math.min(...yearsSeen) : null,
    to: yearsSeen.size ? Math.max(...yearsSeen) : null,
    bySection, byKind, byAnchor,
  },
};
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  for (const e of errs) console.log("FAIL " + e);
  /* 同码错到一定量，病因通常不在单条节点，而在那一卷底本整段被改坏——
     逐条列到 SHOW_PER_CODE 就断了，这里补一句归因，否则读者只看见八条引文错。 */
  for (const [juan, n] of [...corpusMisses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3))
    if (n > SHOW_PER_CODE) console.log(`!! 卷${juan} 有 ${n} 条 q 核不到，先重跑 normalize→corpus 再看这一卷`);
  const s = out.stats;
  const total = [...perCode.values()].reduce((a, b) => a + b, 0);
  console.log(
    `明史编年层：底本 ${s.corpusJuans} 卷｜节点 ${s.nodes}（有节点卷 ${s.annalJuans}）｜` +
    `${s.from}—${s.to} 共 ${s.years} 年｜卷题 照抄${s.titleShapes.A}／无题${s.titleShapes.B}／冲突${s.titleShapes.C}｜` +
    `分片 ${s.chunks}${budgetRead}` +
    (total ? ` → ${total} 处不合格（展示 ${errs.length} 条，每码最多 ${SHOW_PER_CODE} 条）\n   ` +
      Object.entries(out.codeCounts).map(([k, v]) => `${k}×${v}`).join(" ") : " → 全部合格（每条 q 逐字核在其声称卷的底本上）")
  );
}
process.exit(errs.length ? 1 : 0);
