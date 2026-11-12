#!/usr/bin/env node
/* 明史编年层 · 节点抽取
 *
 * 输入：data/corpus/mingshi/*.js（tools/mingshi-corpus.mjs 产出的底本，已入库、可复核）
 * 输出：data/annals/annals-<部类>-<年代段>.js   每片 window.__CHRONICLE_ANNALS["id"] = [节点…]
 *       data/annals/manifest.js                 分片清单 + 普查账
 *
 * 四条口径（它们是判红依据，不是注释；表与阈值一律从 tools/mingshi-lib.mjs 取，门用同一份）：
 *  1) 系年来源只有两种，节点 a 字段明写：
 *     a="b" 本纪连续纪年——本纪按日月顺序书写，年号标记可跨句继承，句内无年号亦可系年。
 *     a="s" 句内自带年号——志、传非编年体，年号跨段即为追述，绝不继承，宁可少收。
 *  2) 时锚只有三种：干支日 g、月 m、「是年／其年」起句（w=1）。皆无者若与前一锚定句在原文里
 *     连续且合并后 ≤MAXQ，则并入前节点；否则弃。门的 ANNALS_ANCHOR 保证没有第四种混进来。
 *  3) q 一律按字符偏移从底本切出，不拼接、不改字，所以「q 在不在底本里」这道门
 *     不会因为转述或排版而误红。
 *  4) 分类 k 是派生字段，由 KINDS 表自上而下第一条命中定；k、y、e 三者可被门独立复算，
 *     任何手改都会在 tools/validate-annals.mjs 处变红。
 *
 * 用法：
 *   node tools/mingshi-annals.mjs            全量重抽并落盘
 *   node tools/mingshi-annals.mjs --check    重抽后与盘上分片逐节点比对，只报差异不写盘
 *   node tools/mingshi-annals.mjs --report   只出普查账
 */
import fs from "node:fs";
import path from "node:path";
import {
  root, ANNALS_DIR, MAXQ, MINQ, SHARD_BYTES, MONTH_RE, MONTH_NUM, YEAR_WORD_RE, firstGz, kindOf,
  eraIn, splitSegments,
  SECTION_CODE, SECTION_LABEL, KIND_LABEL, COMMENTARY, evalFile, bucketOf, pad3,
  loadCorpusManifest, loadAnnalsShard,
} from "./mingshi-lib.mjs";

function extract(ch, corpusText) {
  const code = SECTION_CODE[ch.section];
  const carry = code === "ji";                    // 只有本纪允许跨句继承纪年
  const nodes = [];
  const stat = { juan: ch.juan, section: ch.section, kept: 0, merged: 0, noAnchor: 0, overLong: 0, commentary: 0, mergeConflict: 0 };
  let year = null, era = "";
  let prev = null, prevStart = -1;

  /* 并入前节点的唯一条件是「这句话不改变自己声称的年」。
   * 曾经漏了这一道：无时锚的句子一律尾随并入，于是自带新年号的句子被塞进旧年节点，
   * 读者看到「至正十三年春，贾鲁死」立在至正十二年名下——那是本站替《明史》改了纪年。
   * 志、传更严重：那两部的年号跨段即追述，口径写明绝不继承，并入就是旁路。
   * 现在宁可少收，也不收一句对不上年的话；少收的句数单独入账（mergeConflict），
   * 这样「口径变严导致内容变少」在普查账上是看得见的一笔，不会静默蒸发。 */
  const mergeInto = (own, s1) => {
    const fits = !!prev && [...corpusText.slice(prevStart, s1)].length <= MAXQ;
    if (fits && (own == null || own === prev.y)) {
      prev.q = corpusText.slice(prevStart, s1); stat.merged++; return true;
    }
    if (fits) {
      /* 断链：q 是按字符偏移切出来的连续段，不断开的话，下一句无锚句并入时会把
         这句被拒的话一并捎进前节点——门面上拒了，实际又收了回去。 */
      stat.mergeConflict++; prev = null;
    } else stat.noAnchor++;
    return false;
  };

  for (const [a0, s1] of splitSegments(corpusText)) {
    const q0 = a0 + corpusText.slice(a0).match(/^[。，、\s]*/)[0].length;
    const r = corpusText.slice(q0, s1);
    if (COMMENTARY.test(r)) { stat.commentary++; prev = null; continue; }
    if ([...r].length < MINQ) {
      /* 短句与长句同口径：句内自带年号就先采纳，再决定并/弃。
         否则一句「XX元年。」被拒并之后，本纪后续无锚句仍继承着旧年——年号在原文里
         明明换过了，账上却没换。长句路径先更新后判定，这里也必须一样。 */
      const sr = eraIn(r);
      if (sr.own != null) { year = sr.own; era = sr.era; }
      mergeInto(sr.own, s1); continue;
    }
    const { own, era: ownEra } = eraIn(r);
    if (own != null) { year = own; era = ownEra; }
    if (year == null) continue;                   // 尚未进入任何纪年（如卷首先世叙述）
    /* 志、传里不带年号的长句整句弃。弃的时候必须同时断链：
       q 是 slice(prevStart, s1) 切出来的连续段，不断链的话，后面任何一次并入都会
       把这里弃掉的句子一并捎进前一个节点的 q——账面记着"弃了"，盘上却收着，
       而且收进的是别的年的话（如地理志「三年十二月置青州都卫」挂在洪武元年名下）。
       同 mergeInto 的冲突分支一个道理，只是这一次连年号都没有，门更难看见。 */
    if (!carry && own == null) { stat.noAnchor++; prev = null; continue; }

    const head = r.split("，")[0];
    const mm = head.match(MONTH_RE);
    const gz = firstGz(head);
    const yw = YEAR_WORD_RE.test(r);
    if (!gz && !mm && !yw) { mergeInto(own, s1); continue; }
    if ([...r].length > MAXQ) { stat.overLong++; prev = null; continue; }
    nodes.push({
      i: "", y: year, m: mm ? MONTH_NUM[mm[3]] : 0, L: mm && mm[2] ? 1 : 0,
      g: gz, w: yw && !gz && !mm ? 1 : 0, j: ch.juan, s: code, a: own != null ? "s" : "b",
      e: era, k: kindOf(r), q: r,
    });
    prev = nodes[nodes.length - 1]; prevStart = q0;
    stat.kept++;
  }
  const perYear = {};
  for (const nd of nodes) nd.k = kindOf(nd.q);   // 并入后的 q 才是最终原文，k 以它复算
  for (const nd of nodes) {
    perYear[nd.y] = (perYear[nd.y] || 0) + 1;
    nd.i = `ms-${pad3(ch.juan)}-${nd.y}-${pad3(perYear[nd.y])}`;
  }
  return { nodes, stat };
}

/* ── 主流程 ─────────────────────────────────────────────────── */
const MODE = process.argv.includes("--check") ? "check" : process.argv.includes("--report") ? "report" : "write";
const corpusManifest = loadCorpusManifest();
if (!corpusManifest || !Array.isArray(corpusManifest.chunks)) {
  console.error("!! 缺 data/corpus/mingshi/manifest.js —— 先跑 node tools/mingshi-corpus.mjs");
  process.exit(1);
}

const all = [], stats = [], perJuan = [];
for (const ch of corpusManifest.chunks) {
  if (ch.section === "表") continue;             // 表是矩阵，需按单元格另行解析，本期不入编年层
  const text = evalFile(path.join(root(), "data/corpus/mingshi", ch.file)).__CHRONICLE_CORPUS[`ms${ch.juan}`];
  if (typeof text !== "string") { console.error(`!! 底本缺失 ms${ch.juan}`); process.exit(1); }
  const { nodes, stat } = extract(ch, text);
  all.push(...nodes); stats.push(stat);
  perJuan.push({ j: ch.juan, s: SECTION_CODE[ch.section], n: stat.kept, merged: stat.merged, chars: [...text].length });
}
all.sort((x, y) => x.y - y.y || x.m - y.m || x.j - y.j || (x.i < y.i ? -1 : 1));

const buckets = new Map();
for (const nd of all) {
  const id = bucketOf(nd.s, nd.y);
  if (!buckets.has(id)) buckets.set(id, []);
  buckets.get(id).push(nd);
}

const census = {
  nodes: all.length, years: new Set(all.map((n) => n.y)).size,
  from: all.length ? all[0].y : null, to: all.length ? all[all.length - 1].y : null,
  bySection: {}, byKind: {}, byAnchor: {},
  merged: stats.reduce((a, s) => a + s.merged, 0),
  droppedNoAnchor: stats.reduce((a, s) => a + s.noAnchor, 0),
  mergeConflict: stats.reduce((a, s) => a + (s.mergeConflict || 0), 0),
  overLong: stats.reduce((a, s) => a + s.overLong, 0),
  commentary: stats.reduce((a, s) => a + (s.commentary || 0), 0),
};
for (const nd of all) {
  census.bySection[nd.s] = (census.bySection[nd.s] || 0) + 1;
  census.byKind[nd.k] = (census.byKind[nd.k] || 0) + 1;
  census.byAnchor[nd.a] = (census.byAnchor[nd.a] || 0) + 1;
}

const chunksMeta = [];
let overBudget = 0;
for (const [id, list] of [...buckets.entries()].sort()) {
  const body = `/* annals-${id}.js | 明史编年层分片（${list[0].y}—${list[list.length - 1].y}，${list.length} 节点）
 *
 * 由 tools/mingshi-annals.mjs 从 data/corpus/mingshi 派生，请勿手改。
 * 改口径改 tools/mingshi-lib.mjs，然后重跑；q 为《明史》原文连续句，出处见每节点 j（卷次）。
 */
window.__CHRONICLE_ANNALS = window.__CHRONICLE_ANNALS || {};
window.__CHRONICLE_ANNALS["${id}"] = ${JSON.stringify(list)};
`;
  const bytes = Buffer.byteLength(body);
  overBudget += bytes > SHARD_BYTES ? 1 : 0;
  chunksMeta.push({ id, file: `annals-${id}.js`, count: list.length, bytes, yearFrom: list[0].y, yearTo: list[list.length - 1].y });
  if (MODE === "write") {
    fs.mkdirSync(ANNALS_DIR, { recursive: true });
    fs.writeFileSync(path.join(ANNALS_DIR, `annals-${id}.js`), body, "utf8");
  }
}
census.bytes = chunksMeta.reduce((a, c) => a + c.bytes, 0);

if (MODE === "write") {
  const manifestBody = `/* manifest.js | 明史编年层分片清单
 *
 * 由 tools/mingshi-annals.mjs 生成，请勿手改。装载层只按此表注入分片。
 * 逐卷抽取账 census.perJuan：j 卷次｜s 部类｜n 节点数｜merged 并入前句数｜chars 底本字数
 * 节点字段：i 编号｜y 公元年｜m 月(0=未记)｜L 闰｜g 干支日｜w 以年计(是年)｜j 卷次｜s 部类｜
 *          a 系年来源(b=本纪连续/s=句内自标)｜e 年号｜k 类别｜q 原文
 */
window.__CHRONICLE_ANNALS_MANIFEST = ${JSON.stringify({ version: 1, label: "明史编年层", census: { ...census, perJuan }, chunks: chunksMeta }, null, 1)};
`;
  fs.mkdirSync(ANNALS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ANNALS_DIR, "manifest.js"), manifestBody, "utf8");
}

if (MODE === "check") {
  let diff = 0;
  for (const c of chunksMeta) {
    const p = path.join(ANNALS_DIR, c.file);
    if (!fs.existsSync(p)) { console.log(`!! 盘上缺片 ${c.file}`); diff++; continue; }
    const disk = loadAnnalsShard(c.file, c.id);
    const fresh = buckets.get(c.id);
    if (JSON.stringify(disk) !== JSON.stringify(fresh)) {
      console.log(`!! ${c.id} 与重抽不一致：盘上 ${Array.isArray(disk) ? disk.length : "?"} 节点，重抽 ${fresh.length}`);
      diff++;
    }
  }
  console.log(diff ? `--check 红：${diff} 片需重抽` : `--check 绿：${chunksMeta.length} 片与底本重抽逐节点一致`);
  process.exit(diff ? 1 : 0);
}

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`节点 ${census.nodes}｜分片 ${chunksMeta.length}｜${census.from}—${census.to} 共 ${census.years} 年｜${(census.bytes / 1048576).toFixed(2)}MB`);
console.log("  部类：" + Object.entries(census.bySection).map(([k, v]) => `${SECTION_LABEL[k] || k} ${v}`).join("｜"));
console.log("  系年来源：" + Object.entries(census.byAnchor).map(([k, v]) => `${k === "b" ? "本纪连续" : "句内自标"} ${v}(${pct(v, census.nodes)})`).join("｜"));
console.log("  类别：" + Object.entries(census.byKind).map(([k, v]) => `${KIND_LABEL[k]} ${v}`).join("｜"));
console.log(`  非锚定句并入前节点 ${census.merged}｜年号冲突拒并 ${census.mergeConflict}｜无锚定弃 ${census.droppedNoAnchor}｜超长弃 ${census.overLong}｜评述段弃 ${census.commentary}`);
const empty = perJuan.filter((x) => x.s !== "zhuan" && x.n === 0).map((x) => x.j);
if (empty.length) console.log(`  零节点卷（非列传）：${empty.join(",")}——卷在而无可系年句，或抽取口径不覆盖该体例`);
if (overBudget) console.log(`!! 超预算分片 ${overBudget} 个（>${SHARD_BYTES / 1024}KB）`);
if (MODE === "write") console.log(`已写 data/annals/（${chunksMeta.length} 片 + manifest.js）`);
