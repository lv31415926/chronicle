#!/usr/bin/env node
/* test-annals.mjs | validate-annals 的可红性自审：每一个检查码都要被定向打红一次
 * 用法: node tools/test-annals.mjs
 *
 * 编年层的命门只有一句话：q 是《明史》原文，且核在它声称的那一卷。
 * 所以这里最重的一条用例是 ANNALS_QUOTE 的「改一个字」——门若抓不住换字，
 * 整层就退化成本站自己写句子还谎称引书，那是比没有这一层更糟的状态。
 *
 * 夹具为什么要铺到 7700 多节点：COVERAGE 线住在 tools/mingshi-lib.mjs，
 * 夹具从同一份常量把数读出来并按生产形态铺满（24 卷本纪 × 240 节点、志 73 卷 × 22、
 * 列传 131 卷 × 3 另有 89 卷零节点、表 5 卷不入账，年份跨 340 个）。小夹具永远站在红线以下，
 * 那样的「变红」证明不了任何事——只能证明夹具本来就小。
 *
 * mustGreen 那几条也不是凑数：闰月、是年、生僻字（UTF-16 代理对）、
 * 恰好等于 MAXQ 的长句、志卷自标纪年、引语内含句号、表卷不入逐卷账——这些边界一旦被写坏，
 * 门会从「抓错」变成「一直叫」，那和没有门一样糟。
 *
 * ANNALS_MERGE 管的是并句，两条判据各一条变异：尾句不许自带另一个年号（否则「至正十三年春，
 * 贾鲁死」会被摆在至正十二年的时间位上），志/传的尾句更不许自带任何时锚（裸「三年十二月置青州都卫」
 * 没有年号，只有这一条看得见——它抓的是抽取器弃了却没断链、下一句把弃句捎回 q）。
 * 两条变异都同时改底本与分片，并用 isolate 要求只红这一码——红在别的码上只能说明用例自己没把派生账跟着改。
 */
import fs from "node:fs";
import os from "os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MAXQ, SHARD_BYTES, ERAS, GZ, eraIn, MONTH_NUM, MONTH_RE, YEAR_WORD_RE, firstGz, kindOf,
  SECTION_CODE, CODE_SECTION, SECTION_LABEL, KIND_LABEL, bucketOf, pad3, COVERAGE_FLOOR, BUDGET, numeral,
} from "./mingshi-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const failures = [];
const codesRed = new Set(); let greens = 0;
function ok(c, n) { if (c) pass++; else { fail++; failures.push("✗ " + n); } }

/* ───────────────────────── 夹具语料生成 ─────────────────────────
 * 全部句子由本文件造，底本与节点同源，因此「q 是底本子串」这条性质
 * 在基线夹具里恒真——只有变异动作能把它掰弯，这正是用例要做的事。 */
const CN_U = "一二三四五六七八九";
function toCN(n) {
  if (n === 1) return "元";
  if (n < 10) return CN_U[n - 1];
  if (n === 10) return "十";
  if (n < 20) return "十" + CN_U[n - 11];
  return CN_U[Math.floor(n / 10) - 1] + "十" + (n % 10 ? CN_U[n % 10 - 1] : "");
}
const ERA_ORDER = Object.keys(ERAS);
/* 给定公元年，挑一个能算得回来的年号串（门的 ANNALS_DATE 会用 eraYear 反算） */
function eraStr(y) {
  for (const name of ERA_ORDER) {
    const n = y - ERAS[name] + 1;
    if (n >= 1 && n <= 99 && numeral(toCN(n)) === n) return name + toCN(n);
  }
  throw new Error("夹具年份无年号可用：" + y);
}
/* 填充语：刻意不含干支字、月字与「是年」，否则锚点复算会被填充内容污染 */
const FILL = ["京师议定营建之制", "诏儒臣纂修日书", "遣官祭告岳镇", "户部条上转饷之策",
  "巡按御史陈便宜数事", "工部修复坛壝", "诏赎罪输俸有差", "集廷臣议典礼"];
const SEASON = ["春", "夏", "秋", "冬"];
/* 月名必须带「月」字，MONTH_RE 认的是 X月；一月原文作「正月」，
 * 其余按中文数字（十一、十二照写，MONTH_NUM 都有键）。 */
function monthName(n, oneFallback = "正") {
  return (n === 1 ? oneFallback : toCN(n)) + "月";
}

/* 一卷的节点：mode 轮转，保证月/干支/是年/闰月/并句/引语六种形态都出现过 */
function mkSentences(count, years, juan) {
  const out = [];
  for (let i = 0; i < count; i++) {
    /* 下标必须让每一卷都落到年代池的不同段上——曾用 (i*7+juan)，列传 64 卷
       齐刷刷挤在 1385—1469，夹具只剩 2 个列传分片，COVERAGE 的片数线就白立了。 */
    const y = years[(i * 97 + juan * 31) % years.length];
    const e = eraStr(y);
    const mode = (i + juan) % 8;
    const fill = FILL[(i + juan) % FILL.length];
    if (mode === 3) out.push({ y, e, a: "b", q: `是年，${fill}。` });
    else if (mode === 6) {
      /* 并句形态：锚定句后面连排一句无年号的话。抽取器把两句切成一个节点，
         尾句不许自带年号——门（ANNALS_MERGE）要在基线上真的走一遍这条路，
         夹具自己就得有这种节点，否则那条判据是空转的。 */
      const nxt = FILL[(i + juan + 3) % FILL.length];
      out.push({ y, e, a: "s", q: `${e}年${SEASON[i % 4]}${monthName(i % 12 + 1)}，${fill}。${nxt}。`, mg: 1 });
    }
    else if (mode === 7) {
      /* 引语里的年号不算尾句：「帝曰「…年，河复决。…」」的句号在引号内，
         按裸句号切会把它当成并进来的第二句并判红——那是假门。这条留着防那一步。 */
      const other = y > 1300 ? y - 13 : y + 13;
      out.push({ y, e, a: "s",
        q: `${e}年${SEASON[i % 4]}${monthName(i % 12 + 1)}，翰林进讲，帝曰「${eraStr(other)}年，河复决。议者以为缺政」。` });
    }
    else if (mode === 4) out.push({ y, e, a: "s", q: `${e}年${SEASON[i % 4]}${monthName(i % 12 + 1)}，${fill}。` });
    else if (mode === 5) out.push({ y, e, a: "s", q: `${e}年闰${monthName(i % 11 + 2)}，${fill}。` });
    else if (mode === 0) out.push({ y, e, a: "s", q: `${e}年${[...GZ][i % 60]}，${fill}。` });
    else out.push({ y, e, a: "s", q: `${e}年${SEASON[i % 4]}${monthName(i % 12 + 1)}${[...GZ][(i * 13) % 60]}，${fill}。` });
  }
  return out;
}

/* 生产形态的卷计划：数量按 COVERAGE_FLOOR 反推，永远比线高出一截但不虚高 */
const YEAR_POOL = (() => {
  const a = [];
  for (let y = 1272; y <= 1611; y += 1) a.push(y);   // 340 个不同年，分片数与覆盖年都留出余量
  return a;
})();
const PLAN = [
  { section: "本纪", from: 1, count: 24, per: 240 },
  /* 志 73 卷 = 25—99 减去薄卷 34、39（页在而正文不足 500 字，底本不收，逐卷账也不记）。
     留出这两个真空，ANNALS_JUAN 才有隔离的靶：节点挪进去，只可能红在「没有底本的卷次」上。 */
  { section: "志", from: 25, count: 9, per: 22 },
  { section: "志", from: 35, count: 4, per: 22 },
  { section: "志", from: 40, count: 60, per: 22 },
  { section: "列传", from: 113, count: 131, per: 3 },
  { section: "列传", from: 244, count: 89, per: 0 },   // 有底本无节点：零节点卷必须照常入账
  { section: "表", from: 100, count: 5, per: 0 },      // 表不入编年层，也不该进 perJuan
];
/* 铺法照 2026-11-10 全量底本的生产形态取整：本纪 24×236、志 73 卷里 39 卷有节点（均 40）、
   列传 220 卷里 131 卷有节点（均 2.4）。夹具一律取整偏高（本纪 240、志 每卷都有 22、
   列传 131×3），所以四道线 nodes/ji/zhi/zhuan 都被顶住但不虚高——线一抬，夹具跟着抬，
   这才是「变红能证明什么」的答案。 */

function buildModel() {
  const juans = [];
  for (const p of PLAN) {
    for (let k = 0; k < p.count; k++) {
      const juan = p.from + k;
      /* 本纪之外的卷只许句内自标纪年（a=s）；把 mode 3 的「是年」留给本纪 */
      const list = mkSentences(p.per, YEAR_POOL, juan).map((nd) => {
        if (p.section !== "本纪" && nd.a === "b") {
          const y = nd.y, e = nd.e, fill = FILL[(y + juan) % FILL.length];
          return { y, e, a: "s", q: `${e}年${[...GZ][y % 60]}，${fill}。` };
        }
        return nd;
      });
      const text = list.map((x) => x.q).join("") || `明史卷${juan}。`.repeat(90);
      juans.push({ juan, section: p.section, text, list });
    }
  }
  return { juans };
}

/* 节点字段全部按门的同一套口径派生（表在 mingshi-lib，两边同一份） */
function finalize(juan, section, raw) {
  const nodes = [];
  const seq = new Map();
  for (const r of raw) {
    const head = r.q.split("，")[0];
    const mm = head.match(MONTH_RE);
    const gz = firstGz(head);
    const yw = YEAR_WORD_RE.test(r.q);
    const nd = {
      i: `ms-${pad3(juan)}-${r.y}-${pad3((seq.get(r.y) || 0) + 1)}`,
      y: r.y, m: mm ? MONTH_NUM[mm[3]] : 0, L: mm && mm[2] ? 1 : 0, g: gz,
      w: yw && !gz && !mm ? 1 : 0, j: juan, s: SECTION_CODE[section], a: r.a,
      e: r.e, k: kindOf(r.q), q: r.q,
    };
    seq.set(r.y, (seq.get(r.y) || 0) + 1);
    nodes.push(nd);
  }
  return nodes;
}

/* ───────────────────────── 落盘为文件表 ───────────────────────── */
function corpusFile(c) {
  const body = `/* 明史卷${c.juan}·${c.title}｜底本：维基文库 revision ${c.revision}｜公有领域 */\n`
    + `window.__CHRONICLE_CORPUS = window.__CHRONICLE_CORPUS || {};\n`
    + `window.__CHRONICLE_CORPUS["ms${c.juan}"] = ${JSON.stringify(c.text)};\n`;
  return body;
}
/* 夹具里少数几卷的卷题按页上的汉字写法原样登记（这几串抄自 data/corpus/mingshi/manifest.js），
   为的是让 juanNum 的「一百四五／二百〇一／二百一八／三百零五」四条例法在自审里承重：
   夹具若全写阿拉伯数字，juanNum 改坏了自审照样 82 通过——那条判据就只验了自己不用的那一支。 */
const WIKI_NUM = { 45: "四十五", 145: "一百四五", 201: "二百〇一", 218: "二百一八", 245: "二百四十五", 305: "三百零五" };
function fileTable(model) {
  const files = new Map();
  const chunks = [];
  for (const c of model.juans) {
    const title = `明史卷${WIKI_NUM[c.juan] || pad3(c.juan).replace(/^0+/, "")}${c.section}`;
    const rec = { id: `ms${c.juan}`, juan: c.juan, file: `ms${c.juan}.js`, section: c.section, title,
      chars: [...c.text].length, bytes: 0, revision: 1000000 + c.juan };
    const body = corpusFile({ ...rec, text: c.text });
    rec.bytes = Buffer.byteLength(body);
    files.set(`data/corpus/mingshi/ms${c.juan}.js`, body);
    chunks.push(rec);
  }
  files.set("data/corpus/mingshi/manifest.js",
    `window.__CHRONICLE_CORPUS_MANIFEST = ${JSON.stringify({ version: 1, label: "明史底本", chunks }, null, 1)};\n`);

  const all = [];
  for (const c of model.juans) all.push(...finalize(c.juan, c.section, c.list));
  all.sort((x, y) => x.y - y.y || x.m - y.m || x.j - y.j || (x.i < y.i ? -1 : 1));
  const buckets = new Map();
  for (const nd of all) {
    const id = bucketOf(nd.s, nd.y);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(nd);
  }
  const meta = [];
  for (const [id, list] of [...buckets.entries()].sort()) {
    const body = `/* annals-${id}.js | 夹具分片 */\n`
      + `window.__CHRONICLE_ANNALS = window.__CHRONICLE_ANNALS || {};\n`
      + `window.__CHRONICLE_ANNALS["${id}"] = ${JSON.stringify(list)};\n`;
    files.set(`data/annals/annals-${id}.js`, body);
    meta.push({ id, file: `annals-${id}.js`, count: list.length, bytes: Buffer.byteLength(body),
      yearFrom: list[0].y, yearTo: list[list.length - 1].y });
  }
  const merged = model.juans.reduce((a, c) => a + c.list.filter((x) => x.mg).length, 0);
  const census = {
    nodes: all.length, years: new Set(all.map((n) => n.y)).size,
    from: Math.min(...all.map((n) => n.y)), to: Math.max(...all.map((n) => n.y)),
    bySection: tally(all, (n) => n.s), byKind: tally(all, (n) => n.k), byAnchor: tally(all, (n) => n.a),
    /* 弃句账不是编出来的：merged 由夹具自己数（带 mg 标记的并句节点），
       其余三项夹具不跑抽取器、产不出这四类弃句，就照实记 0。
       写一个像真的假数字，比写 0 更坏——下一个人会拿它当基线。 */
    merged, droppedNoAnchor: 0, mergeConflict: 0, overLong: 0, commentary: 0,
    bytes: meta.reduce((a, c) => a + c.bytes, 0),
    perJuan: model.juans.filter((c) => c.section !== "表").map((c) => ({
      j: c.juan, s: SECTION_CODE[c.section], n: c.list.length,
      merged: c.list.filter((x) => x.mg).length, chars: [...c.text].length,
    })),
  };
  files.set("data/annals/manifest.js",
    `window.__CHRONICLE_ANNALS_MANIFEST = ${JSON.stringify({ version: 1, label: "明史编年层（夹具）", census, chunks: meta }, null, 1)};\n`);
  return files;
}
const tally = (list, f) => { const o = {}; for (const x of list) o[f(x)] = (o[f(x)] || 0) + 1; return o; };

/* ───────────────────────── 跑门 ───────────────────────── */
function materialize(files, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-annals-"));
  for (const [rel, text] of files) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, "utf8");
  }
  if (extra) extra(dir);
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-annals.mjs"), "--root", dir], { encoding: "utf8" });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
/* 夹具是「文件表」，变异是对文件表做定点手术（就地改，不返回新表）。
   曾经写成 mutate(fileTable(...)) 指望它返回文件表，而所有用例都只改不返回，
   于是每个变异用例都变成「files is not iterable」——那是夹具自己抛错，
   不是门变红，红得毫无意义。 */
function build(mutate) {
  const files = fileTable(buildModel());
  if (mutate) mutate(files);
  return files;
}
let isolatedTry = 0;
function mustRed(name, code, mutate, extra, isolate) {
  let dir;
  try {
    dir = materialize(build(mutate), extra);
    const { rc, out } = run(dir);
    let hit = rc === 1 && out.includes(code);
    /* isolate：这道用例只想打红一个码。别的码跟着红，说明变异改动溢出到了
       其它判据上（用例没把自己的派生字段跟着改），或者门与门互相咬——
       两种都得当场看见，不然「红了」并不等于「这条门抓住了这件事」。 */
    if (isolate) isolatedTry++;
    if (hit && isolate) {
      const others = [...new Set([...out.matchAll(/^FAIL (ANNALS_[A-Z_]+)/gm)].map((m) => m[1]))].filter((c) => c !== code);
      if (others.length) {
        hit = false;
        failures.push(`    ${code} 红了，但同时红 ${others.join(",")}——变异溢出，用例没隔离`);
      }
    }
    if (hit) codesRed.add(code);
    ok(hit, `${name} → 变红并点名 ${code}${isolate ? "（且只红这一码）" : ""}`);
    if (!hit && !isolate) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 5).join(" | "));
  } catch (e) {
    ok(false, `${name} → 夹具本身抛错：${e.message}`);
  } finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
}
function mustGreen(name, mutate, extra) {
  let dir;
  try {
    dir = materialize(build(mutate), extra);
    const { rc, out } = run(dir);
    if (rc === 0) greens++;
    ok(rc === 0, `${name} → 判绿（rc=${rc}）`);
    if (rc !== 0) failures.push("    应当绿而红：" + out.split("\n").slice(0, 5).join(" | "));
  } catch (e) {
    ok(false, `${name} → 夹具本身抛错：${e.message}`);
  } finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
}

/* 文件表上的定点手术工具 */
const M = {
  json(text) { return JSON.parse(text.slice(text.indexOf("{")).replace(/;\s*$/, "")); },
  manifest(files) { return M.json(files.get("data/annals/manifest.js")); },
  putManifest(files, o) { files.set("data/annals/manifest.js", `window.__CHRONICLE_ANNALS_MANIFEST = ${JSON.stringify(o, null, 1)};\n`); },
  corpusManifest(files) { return M.json(files.get("data/corpus/mingshi/manifest.js")); },
  putCorpusManifest(files, o) { files.set("data/corpus/mingshi/manifest.js", `window.__CHRONICLE_CORPUS_MANIFEST = ${JSON.stringify(o, null, 1)};\n`); },
  shardList(files, id) {
    const rel = `data/annals/annals-${id}.js`;
    const body = files.get(rel);
    const arr = JSON.parse(body.slice(body.lastIndexOf("] = ") + 4).replace(/;\s*$/, ""));
    return { rel, arr };
  },
  putShard(files, rel, id, arr) {
    files.set(rel, `/* annals-${id}.js | 夹具分片 */\nwindow.__CHRONICLE_ANNALS = window.__CHRONICLE_ANNALS || {};\n`
      + `window.__CHRONICLE_ANNALS["${id}"] = ${JSON.stringify(arr)};\n`);
  },
  /* 底本正文的定点手术：改了卷文就同步 chars/bytes，否则 ANNALS_CORPUS 会替我们红，
     用例红得不是地方（红隔离：一次变异只该打红一道门）。 */
  corpusText(files, juan) {
    const body = files.get(`data/corpus/mingshi/ms${juan}.js`);
    return JSON.parse(/window\.__CHRONICLE_CORPUS\["ms\d+"\] = (.*);\n?$/.exec(body)[1]);
  },
  putCorpusText(files, juan, text) {
    const cm = M.corpusManifest(files);
    const rec = cm.chunks.find((c) => c.juan === juan);
    if (!rec) throw new Error(`夹具底本清单里没有卷${juan}`);
    const changed = rec.text !== text;
    rec.text = text;
    const body = corpusFile({ ...rec });
    rec.bytes = Buffer.byteLength(body);
    rec.chars = [...text].length;
    files.set(`data/corpus/mingshi/ms${juan}.js`, body);
    if (changed) M.putCorpusManifest(files, cm);
  },
  /* 变异动到节点内容后，把 census 里由节点派生的读数全部重算。
     不算这一步，用例会被 ANNALS_MANIFEST 的 byKind/byAnchor 账误红——
     那是用例没跟上自己的变异，不是门在抓错。 */
  recensus(files) {
    const man = M.manifest(files);
    const all = [];
    for (const c of man.chunks) all.push(...M.shardList(files, c.id).arr);
    man.census.nodes = all.length;
    man.census.years = new Set(all.map((n) => n.y)).size;
    man.census.from = Math.min(...all.map((n) => n.y));
    man.census.to = Math.max(...all.map((n) => n.y));
    man.census.bySection = tally(all, (n) => n.s);
    man.census.byKind = tally(all, (n) => n.k);
    man.census.byAnchor = tally(all, (n) => n.a);
    M.putManifest(files, man);
    M.resync(files);
  },
  /* 改完分片正文后，把清单里由正文派生的读数一起对齐磁盘。
     不做这一步，「生僻字仍算原文子串」这类用例会被 SHARD/MANIFEST 的字节账误红，
     看起来像门在挑刺，实际是用例没把派生字段跟着改。 */
  resync(files) {
    const man = M.manifest(files);
    for (const c of man.chunks) c.bytes = Buffer.byteLength(files.get(`data/annals/${c.file}`));
    man.census.bytes = man.chunks.reduce((a, c) => a + c.bytes, 0);
    M.putManifest(files, man);
  },
  /* 找第一个满足条件的节点，就地改掉并回写 */
  editNode(files, pred, fix) {
    const man = M.manifest(files);
    for (const c of man.chunks) {
      const { rel, arr } = M.shardList(files, c.id);
      const i = arr.findIndex(pred);
      if (i >= 0) { fix(arr[i]); M.putShard(files, rel, c.id, arr); return { nd: arr[i], chunk: c }; }
    }
    throw new Error("夹具里找不到满足条件的节点");
  },
};

/* ───────────────────────── 基线 ───────────────────────── */
const BASE = fileTable(buildModel());
{
  const dir = materialize(BASE);
  const { rc, out } = run(dir);
  ok(rc === 0, `生产形态夹具（未变异）判绿`);
  if (rc !== 0) failures.push("    基线就红，后面所有用例的结论都不可信：" + out.split("\n").slice(0, 8).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}
/* 夹具自己先要像生产：铺得够大、字段口径与门同源 */
{
  const man = M.manifest(BASE);
  ok(man.census.nodes >= COVERAGE_FLOOR.nodes, `夹具节点数 ${man.census.nodes} ≥ 回归线 ${COVERAGE_FLOOR.nodes}`);
  ok(man.census.perJuan.filter((r) => r.n > 0).length >= COVERAGE_FLOOR.annalJuans, `其中有节点卷 ${man.census.perJuan.filter((r) => r.n > 0).length} ≥ ${COVERAGE_FLOOR.annalJuans}`);
  ok(man.chunks.length >= COVERAGE_FLOOR.chunks, `夹具分片 ${man.chunks.length} ≥ ${COVERAGE_FLOOR.chunks}`);
  ok(man.chunks.every((c) => c.bytes <= SHARD_BYTES), "夹具没有哪一片天生超字节预算");
}

/* ───────────────────────── 逐码定向打红 ───────────────────────── */
mustRed("底本卷说不出核的是哪一版（删修订号）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  cm.chunks[3].revision = null;
  M.putCorpusManifest(f, cm);
});
mustRed("磁盘上多一份未登记的底本卷（装载层永远读不到）", "ANNALS_CORPUS", (f) => {
  f.set("data/corpus/mingshi/ms999.js", corpusFile({ juan: 999, title: "夹具多出来的卷", revision: 1, text: "明史卷九百九十九。".repeat(80) }));
});
/* 卷题形状的三条：title 是读者拿去翻页的那串字，所以除了「页上照抄且卷号对得上」
   和两种明示的声明体，其余写法都只能是人手编的。真数据里三种形状都在
   （卷326/327/328 页内无卷题、卷154 页内卷题写成卷157），门必须认得它们各自的样子。 */
mustRed("卷题自称的卷号和清单不是同一卷（照抄了别卷的题）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[2];
  c.title = `明史卷${c.juan + 3}${c.section}`;
  M.putCorpusManifest(f, cm);
}, null, true);
mustRed("卷题既不是页上原文也不是声明体（手写了一个题）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  cm.chunks[4].title = "外国七";
  M.putCorpusManifest(f, cm);
}, null, true);
mustRed("声明「页内无卷题」却不写依页名卷几（读者不知道卷次从哪来）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[6];
  c.title = "（页内无卷题）列传第二百十四";
  M.putCorpusManifest(f, cm);
}, null, true);
/* C 形状的两条：光写「与页名不符，不取」不构成核对——那串被否掉的题必须原样报出来，
   否则读者只知道「有人说过冲突」，不知道冲突的是什么；而报出来的卷号若恰好就是本页，
   「冲突」声明本身就成了 launder 手写卷题的皮。 */
mustRed("卷题是空串（读者按题翻页，空的等于没核）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  cm.chunks[3].title = "   ";
  M.putCorpusManifest(f, cm);
}, null, true);
mustRed("声明「页内无卷题」却不给页上可核的尾巴（只有声明，没有篇目）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[5];
  c.title = `（页内无卷题，卷次依页名卷${c.juan}）`;
  M.putCorpusManifest(f, cm);
}, null, true);
mustRed("声明卷题冲突却没报出原题（只说不符，不说不符的是什么）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[2];
  c.title = `（页内卷题作「本纪」，与页名卷${c.juan}不符，不取）`;
  M.putCorpusManifest(f, cm);
}, null, true);
mustRed("声明卷题冲突，报出的却是本页自己的卷号（拿冲突声明给手写卷题套皮）", "ANNALS_CORPUS", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[4];
  c.title = `（页内卷题作「明史卷${c.juan}本纪」，与页名卷${c.juan}不符，不取）`;
  M.putCorpusManifest(f, cm);
}, null, true);
mustGreen("页上连篇目也没有时，B 形状声明「页上无篇目」仍判绿（normalize 的兜底口径两侧同形）", (f) => {
  const cm = M.corpusManifest(f);
  const c = cm.chunks[4];
  c.title = `（页内无卷题，卷次依页名卷${c.juan}）页上无篇目`;
  M.putCorpusManifest(f, cm);
});
mustGreen("卷题三种合法形状各自判绿（照抄／页内无卷题／页内卷题冲突）", (f) => {
  const cm = M.corpusManifest(f);
  for (const [i, mk] of [[2, (c) => `明史卷${c.juan}${c.section}`],
                         [4, (c) => `（页内无卷题，卷次依页名卷${c.juan}）列传第二百十四 外国七`],
                         [6, (c) => `（页内卷题作「明史卷${c.juan + 3}本纪」，与页名卷${c.juan}不符，不取）`]])
    Object.assign(cm.chunks[i], { title: mk(cm.chunks[i]) });
  M.putCorpusManifest(f, cm);
});
mustRed("编年清单漏登记一片（盘上有片而装载表里没有）", "ANNALS_MANIFEST", (f) => {
  const man = M.manifest(f);
  man.chunks.splice(man.chunks.length - 1, 1);
  M.putManifest(f, man);
});
mustRed("逐卷账少记一卷（抽取器跳卷最先是这里露馅）", "ANNALS_MANIFEST", (f) => {
  const man = M.manifest(f);
  const rows = man.census.perJuan.filter((r) => r.n > 0);
  const victim = rows[5].j;
  man.census.perJuan = man.census.perJuan.filter((r) => r.j !== victim);
  M.putManifest(f, man);
});
mustRed("节点字段被删（装载层拿到 undefined）", "ANNALS_SCHEMA", (f) => {
  M.editNode(f, () => true, (nd) => { delete nd.g; });
});
mustRed("史臣评述混进来了（赞曰不是系日记事）", "ANNALS_SCHEMA", (f) => {
  const man = M.manifest(f);
  const { rel, arr } = M.shardList(f, man.chunks[0].id);
  arr[0].q = "赞曰：「盛哉，乎其言之。」";
  arr[0].k = kindOf(arr[0].q);
  arr[0].m = 0; arr[0].L = 0; arr[0].g = ""; arr[0].w = 0;
  M.putShard(f, rel, man.chunks[0].id, arr);
});
mustRed("同一年同卷出现重号 id", "ANNALS_DUP", (f) => {
  M.editNode(f, (nd) => nd.m > 0, (nd) => { nd.i = `ms-${pad3(nd.j)}-${nd.y}-000`; });
});
mustRed("节点伪托到没有底本的卷", "ANNALS_JUAN", (f) => {
  /* 挪进薄卷34（夹具刻意留空：无底本、无逐卷账行），同时把原卷的 n 减一、
     分片字节重算——不跟着改派生账的话，红会摊到 MANIFEST 上，用例就没在证这件事了。 */
  let oldJ = null;
  M.editNode(f, (nd) => nd.s === "zhi", (nd) => {
    oldJ = nd.j; nd.j = 34; nd.i = `ms-034-${nd.y}-001`;
  });
  const man = M.manifest(f);
  const row = man.census.perJuan.find((r) => r.j === oldJ);
  if (row) row.n -= 1;
  M.putManifest(f, man);
  M.resync(f);
}, null, true);
mustRed("引文改一个字（原文伪托的机器面）", "ANNALS_QUOTE", (f) => {
  const man = M.manifest(f);
  let done = false;
  for (const c of man.chunks) {
    if (done) break;
    const { rel, arr } = M.shardList(f, c.id);
    for (const nd of arr) {
      /* 挑一个改后既不动首句锚点、也不动类别派生的字，保证红只由 QUOTE 引起 */
      const tail = [...nd.q].slice(6, -2);
      const at = tail.findIndex((ch) => ch !== "，" && ch !== "。" && !GZ.has(ch));
      if (at < 0) continue;
      const cut = 6 + at;
      const made = nd.q.slice(0, cut) + "某" + nd.q.slice(cut + 1);
      if (kindOf(made) !== nd.k) continue;
      nd.q = made;
      M.putShard(f, rel, c.id, arr);
      done = true;
      break;
    }
  }
  if (!done) throw new Error("夹具里没有可改单字而不牵动锚点/类别的节点");
});
mustRed("年号串与公元年不再互为逆运算", "ANNALS_DATE", (f) => {
  M.editNode(f, (nd) => nd.e !== "崇祯十七", (nd) => { nd.e = "崇祯十七"; });
});
mustRed("非编年体却继承了上一句纪年（a=b 出在志）", "ANNALS_DATE", (f) => {
  M.editNode(f, (nd) => nd.s === "zhi", (nd) => { nd.a = "b"; });
});
mustRed("声称的月被抹掉（时锚从原文里复算不出来）", "ANNALS_ANCHOR", (f) => {
  M.editNode(f, (nd) => nd.m > 0 && nd.L === 0 && nd.g !== "", (nd) => { nd.m = 0; });
});
mustRed("节点无任何时锚却独立成条", "ANNALS_ANCHOR", (f) => {
  /* q 换成底本里真存在的一句填充语（QUOTE 保持绿），本纪句改判 a=b 继承纪年
     （DATE 保持绿），只留「没有时锚」这一件事给 ANCHOR 抓。 */
  M.editNode(f, (nd) => nd.s === "ji" && nd.g === "" && nd.m > 0, (nd) => {
    nd.q = `${FILL[0]}。`;
    nd.m = 0; nd.L = 0; nd.g = ""; nd.w = 0;
    nd.a = "b"; nd.k = kindOf(nd.q);
  });
  M.recensus(f);
}, null, true);
/* 把变异后的 q 同时写回底本与分片，并把跟着漂移的逐卷字数、派生账一起补齐。
 * 三段用例（年号尾句、志传带锚尾句）都要做同一件事，漏一步就多红一个别的码。 */
function splice(f, id, nd, next) {
  const { rel, arr } = M.shardList(f, id);
  const i = arr.findIndex((x) => x.i === nd.i);
  if (i < 0) throw new Error(`夹具分片 ${id} 里找不到 ${nd.i}`);
  const text = M.corpusText(f, nd.j);
  if (!text.includes(nd.q)) throw new Error(`夹具卷${nd.j}底本里找不到该节点原文，变异无从下刀`);
  M.putCorpusText(f, nd.j, text.replace(nd.q, next));
  arr[i].q = next; arr[i].k = kindOf(next);
  M.putShard(f, rel, id, arr);
  const man2 = M.manifest(f);
  const per = man2.census.perJuan.find((r) => r.j === nd.j);
  if (per) per.chars = [...M.corpusText(f, nd.j)].length;
  M.putManifest(f, man2);
  M.recensus(f);
}
mustRed("并进来的尾句自带另一个年号（并句改写纪年）", "ANNALS_MERGE", (f) => {
  /* 挑一个夹具里本来就是并句的节点（q 内有两个 depth-0 句号、无引号），
     往尾句头上补一个与前景点不同年的年号，底本同步改——于是 QUOTE 仍然绿，
     只有「尾句改年纪」这一件事留给 ANNALS_MERGE 抓。 */
  for (const c of M.manifest(f).chunks) {
    const { arr } = M.shardList(f, c.id);
    const nd = arr.find((x) => x.m > 0 && !/[「」]/.test(x.q) && x.q.indexOf("。") < x.q.lastIndexOf("。"));
    if (!nd) continue;
    const cut = nd.q.indexOf("。") + 1;
    splice(f, c.id, nd, nd.q.slice(0, cut) + `${eraStr(nd.y + 7)}年，` + nd.q.slice(cut));
    return;
  }
  throw new Error("夹具里没有可用的并句节点（mode 6 失效），ANNALS_MERGE 无用武之地");
}, null, true);
mustRed("志/传的尾句自带月份（被弃的独立系年句捎进了 q）", "ANNALS_MERGE", (f) => {
  /* 断链漏在一处 continue 上时，症状不是「尾句多一个年号」，而是「q 里冒出一句自带月份的活」。
     裸「三年十二月置青州都卫」没有年号，eraIn 认不出 own，上面那条判据看不见它——
     2026-11-10 审查席就是靠这条抓出现盘 84 处错系年（卷四十一地理志最密）。
     所以用例接一句「某月＋填词」在非本纪节点尾巴上，底本同步：年号判据不红，
     只有「志传尾句不得自带时锚」红。 */
  for (const c of M.manifest(f).chunks) {
    const { arr } = M.shardList(f, c.id);
    for (const nd of arr) {
      if (nd.s === "ji" || /[「」]/.test(nd.q) || [...nd.q].length + 13 > MAXQ) continue;
      const text = M.corpusText(f, nd.j);
      if (text.indexOf(nd.q) !== text.lastIndexOf(nd.q)) continue;   // 接龙要唯一下刀处，否则变异打到别处那句
      const tail = `${monthName((nd.y % 12) + 1)}，${FILL[(nd.y + 5) % FILL.length]}。`;
      if (eraIn(tail).own != null) continue;                         // 别顺手踩到年号那条判据
      splice(f, c.id, nd, nd.q + tail);
      return;
    }
  }
  throw new Error("夹具里没有可接尾句的非本纪节点，ANNALS_MERGE 第二条判据无用武之地");
}, null, true);
mustRed("同一句在底本里出现多处，门只判第一处就漏掉别处的夹带", "ANNALS_MERGE", (f) => {
  /* 并集判据（2026-11-10）：q 在同一卷里可能原样出现多处（全量实测 7535 个节点里 274 个的 q 重复，涉及 105 句，
     中位 3 处、最多 10 处，如「洪武十五年三月为府。」），只看第一处＝第一处干净就放行，
     别处那一份捎了什么没人看。变异把同一串 bad 写两遍：
     第一遍整句包在「」里——splitSegments 在深度>0 处不断句，窗口内一条尾句都没有，判绿；
     第二遍裸写，尾句自带异年年号，只有逐处取并集才看得见它。
     QUOTE 仍绿（bad 确实在底本里连续存在），ANCHOR/DATE 仍绿（句首一字未动）。 */
  for (const c of M.manifest(f).chunks) {
    const { rel, arr } = M.shardList(f, c.id);
    const nd = arr.find((x) => x.m > 0 && !/[「」“”]/.test(x.q)
      && x.q.indexOf("。") < x.q.lastIndexOf("。") && [...x.q].length + 14 <= MAXQ);
    if (!nd) continue;
    const text = M.corpusText(f, nd.j);
    if (text.indexOf(nd.q) !== text.lastIndexOf(nd.q)) continue;   // 基线得唯一，否则「第一处」未必是我们写的
    const cut = nd.q.indexOf("。") + 1;
    const bad = nd.q.slice(0, cut) + `${eraStr(nd.y + 7)}年，` + nd.q.slice(cut);
    const i = arr.findIndex((x) => x.i === nd.i);
    /* 顺序要紧：先按原 q 在底本里换出两遍 bad，再动分片——nd 就是 arr[i]，
       先写 arr[i].q 会把 nd.q 一起改掉，replace 的靶子当场消失（QUOTE 假红）。 */
    M.putCorpusText(f, nd.j, text.replace(nd.q,
      `「${bad}」${FILL[nd.y % FILL.length]}。${bad}。`));
    arr[i].q = bad; arr[i].k = kindOf(bad);
    M.putShard(f, rel, c.id, arr);
    const man2 = M.manifest(f);
    const per = man2.census.perJuan.find((r) => r.j === nd.j);
    if (per) per.chars = [...M.corpusText(f, nd.j)].length;
    M.putManifest(f, man2);
    M.recensus(f);
    return;
  }
  throw new Error("夹具里没有可重复书写的并句节点，ANNALS_MERGE 并集判据无用武之地");
}, null, true);
mustRed("生僻字被从中间切开（半个代理对落进 q）", "ANNALS_SCHEMA", (f) => {
  /* 断句按 UTF-16 偏移切，切点若落在代理对中间，盘上会出现「半个𤋮」。
     这种字面看起来正常、JSON 也装得下，只有这一条判据看得见——所以必须证明它不是死码。
     变异同时改底本与分片，QUOTE 保持绿；长度不变，MAXQ 也不跟着红。 */
  const man = M.manifest(f);
  for (const c of man.chunks) {
    const { rel, arr } = M.shardList(f, c.id);
    const i = arr.findIndex((nd) => [...nd.q].length + 1 <= MAXQ && !/[\uD800-\uDFFF]/.test(nd.q));
    if (i < 0) continue;
    const nd = arr[i];
    const next = nd.q.replace(/。$/, "\ud83d。");      // 只留高位代理，低位丢掉
    const text = M.corpusText(f, nd.j);
    if (!text.includes(nd.q)) throw new Error(`夹具卷${nd.j}底本里找不到该节点原文，变异无从下刀`);
    M.putCorpusText(f, nd.j, text.replace(nd.q, next));
    nd.q = next;
    M.putShard(f, rel, c.id, arr);
    const man2 = M.manifest(f);
    const per = man2.census.perJuan.find((r) => r.j === nd.j);
    if (per) per.chars = [...M.corpusText(f, nd.j)].length;
    M.putManifest(f, man2);
    M.resync(f);
    return;
  }
  throw new Error("夹具里没有一个节点能容下半个代理字的变异");
}, null, true);
mustRed("类别字段与派生表脱钩（有人手改了 k）", "ANNALS_KIND", (f) => {
  M.editNode(f, (nd) => nd.k !== "za" && kindOf(nd.q) !== "za", (nd) => { nd.k = "za"; });
  M.recensus(f);
}, null, true);
mustRed("清单虚报片内节点数", "ANNALS_SHARD", (f) => {
  const man = M.manifest(f);
  man.chunks[0].count += 3;
  M.putManifest(f, man);
});
mustRed("节点被挪到不属于它的年代段", "ANNALS_SHARD", (f) => {
  const man = M.manifest(f);
  const src = man.chunks[0], dst = man.chunks[1];
  const s = M.shardList(f, src.id), d = M.shardList(f, dst.id);
  const [nd] = s.arr.splice(s.arr.length - 1, 1);
  d.arr.push(nd);
  M.putShard(f, s.rel, src.id, s.arr);
  M.putShard(f, d.rel, dst.id, d.arr);
  dst.yearTo = Math.max(dst.yearTo, nd.y);
  M.putManifest(f, man);
});
mustRed("data/ 全站顶破本期体积上限", "ANNALS_BUDGET", undefined, (dir) => {
  fs.writeFileSync(path.join(dir, "data", "pad.js"), "// 体积垫子\n" + "x".repeat(BUDGET.dataBytes));
});
mustRed("成片分节点消失（编年层被洗掉一半）", "ANNALS_COVERAGE", (f) => {
  const man = M.manifest(f);
  const keep = man.chunks.filter((c, i) => i % 2 === 0);
  for (const c of man.chunks) if (!keep.includes(c)) f.delete(`data/annals/${c.file}`);
  man.chunks = keep;
  M.putManifest(f, man);
});

/* ───────────────────────── 边界必须判绿 ───────────────────────── */
mustGreen("闰月节点是合法时锚形态", (f) => {
  if (!M.manifest(f).chunks.some((c) => M.shardList(f, c.id).arr.some((nd) => nd.L === 1)))
    throw new Error("夹具本应包含闰月节点");
});
mustGreen("「是年」节点（w=1、无月无干支）合法", (f) => {
  if (!M.manifest(f).chunks.some((c) => M.shardList(f, c.id).arr.some((nd) => nd.w === 1 && !nd.m && !nd.g)))
    throw new Error("夹具本应包含「是年」节点");
});
mustGreen("生僻字走 UTF-16 代理对也仍是底本子串", (f) => {
  const man = M.manifest(f);
  const c = man.chunks[0];
  const { rel, arr } = M.shardList(f, c.id);
  const nd = arr[0];
  const cm = M.corpusManifest(f);
  const rec = cm.chunks.find((x) => x.juan === nd.j);
  const cref = `data/corpus/mingshi/ms${nd.j}.js`;
  const old = nd.q;
  const next = old.replace(/。$/, "𤋮。");
  const cb = f.get(cref);
  const text = JSON.parse(cb.slice(cb.lastIndexOf("] = ") + 4).replace(/;\s*$/, ""));
  const nt = text.replace(old, next);
  const body = `/* 明史卷${nd.j}·${rec.title}｜底本：维基文库 revision ${rec.revision}｜公有领域 */\n`
    + `window.__CHRONICLE_CORPUS = window.__CHRONICLE_CORPUS || {};\n`
    + `window.__CHRONICLE_CORPUS["ms${nd.j}"] = ${JSON.stringify(nt)};\n`;
  f.set(cref, body);
  rec.chars = [...nt].length; rec.bytes = Buffer.byteLength(body);
  M.putCorpusManifest(f, cm);
  const per = man.census.perJuan.find((r) => r.j === nd.j);
  if (per) per.chars = rec.chars;
  nd.q = next; nd.k = kindOf(next);
  M.putShard(f, rel, c.id, arr);
  M.putManifest(f, man);   /* 先把 perJuan.chars 的改动写回，resync 是从盘上重读的 */
  M.resync(f);
});
mustGreen("单句恰好顶到 MAXQ 上限不算越界", (f) => {
  const man = M.manifest(f);
  const c = man.chunks[0];
  const { rel, arr } = M.shardList(f, c.id);
  const nd = arr[0];
  const pad = MAXQ - [...nd.q].length - 1;
  const next = nd.q.replace(/。$/, "。".padEnd(1) + "制".repeat(Math.max(0, pad)) + "。");
  const cm = M.corpusManifest(f);
  const rec = cm.chunks.find((x) => x.juan === nd.j);
  const cref = `data/corpus/mingshi/ms${nd.j}.js`;
  const cb = f.get(cref);
  const text = JSON.parse(cb.slice(cb.lastIndexOf("] = ") + 4).replace(/;\s*$/, ""));
  const nt = text.replace(nd.q, next);
  const body = `/* 明史卷${nd.j}·${rec.title}｜底本：维基文库 revision ${rec.revision}｜公有领域 */\n`
    + `window.__CHRONICLE_CORPUS = window.__CHRONICLE_CORPUS || {};\n`
    + `window.__CHRONICLE_CORPUS["ms${nd.j}"] = ${JSON.stringify(nt)};\n`;
  f.set(cref, body);
  rec.chars = [...nt].length; rec.bytes = Buffer.byteLength(body);
  M.putCorpusManifest(f, cm);
  const per = man.census.perJuan.find((r) => r.j === nd.j);
  if (per) per.chars = rec.chars;
  nd.q = next; nd.k = kindOf(next);
  M.putShard(f, rel, c.id, arr);
  M.putManifest(f, man);   /* 先把 perJuan.chars 的改动写回，resync 是从盘上重读的 */
  M.resync(f);
});
mustGreen("志卷句内自标纪年（a=s）是合法形态", (f) => {
  /* 门只禁「非本纪却继承上一句纪年」，不许顺手把整类志/传都判死。
     若哪天把条件写反成 s!=="ji" 就要求 a==="b"，这条会红。 */
  const man = M.manifest(f);
  let hit = 0;
  for (const c of man.chunks)
    hit += M.shardList(f, c.id).arr.filter((nd) => nd.s === "zhi" && nd.a === "s").length;
  if (hit < 100) throw new Error(`夹具里志卷自标纪年节点仅 ${hit} 个，不足以证明这条通路是活的`);
});
mustGreen("引号里的年号不算「并进来的尾句」（引语追述不是本站并句）", (f) => {
  /* 「帝曰「…年，河复决。…」」里的句号在引号内，是《明史》一句话本来说完的话。
     若哪天把 splitSegments 换成裸按句号切，这条会红——那是把原文自己说的话
     当成我们并进去的，门就从抓错变成一直叫。 */
  const man = M.manifest(f);
  let hit = 0;
  for (const c of man.chunks)
    hit += M.shardList(f, c.id).arr.filter((nd) => /[「].+[」]/.test(nd.q) && nd.q.indexOf("。") < nd.q.lastIndexOf("。")).length;
  if (hit < 50) throw new Error(`夹具里引语内含句号的节点仅 ${hit} 个，不足以证明这条通路是活的`);
});
mustGreen("表卷不入逐卷账是口径而非漏记", (f) => {
  const cm = M.corpusManifest(f), man = M.manifest(f);
  const biao = cm.chunks.filter((c) => c.section === "表").map((c) => c.juan);
  if (biao.length < 5) throw new Error("夹具本应包含表卷");
  if (man.census.perJuan.some((r) => biao.includes(r.j))) throw new Error("表卷混进了逐卷账");
});

/* 浏览器那份标签表与判据那份必须逐字相同（js/annals.js 头部注释当众许了这个诺）：
 * 抄两份是本项目的既有做法，代价由这条门付——改名不同步时，界面显示的部类/类别
 * 与 tools 算的口径就不是同一件事了，读者看到的「兵事」在账上可能叫别的。 */
{
  const uiSrc = fs.readFileSync(path.join(ROOT, "js", "annals.js"), "utf8");
  const uiTable = (name) => {
    const m = new RegExp("var " + name + "\\s*=\\s*\\{([\\s\\S]*?)\\};").exec(uiSrc);
    if (!m) return null;
    try { return new Function("return {" + m[1] + "}")(); } catch { return null; }
  };
  for (const [name, shared] of [["SECTION_LABEL", SECTION_LABEL], ["KIND_LABEL", KIND_LABEL]]) {
    const ui = uiTable(name);
    ok(!!ui && Object.keys(ui).length >= 4,
      `js/annals.js 里解析到 ${name}（取空了下面的对账就在空转，实得 ${ui ? Object.keys(ui).length : 0} 键）`);
    if (!ui) continue;
    const keys = [...new Set([...Object.keys(shared), ...Object.keys(ui)])];
    const drift = keys.filter((k) => shared[k] !== ui[k]);
    ok(drift.length === 0,
      `${name} 两侧逐字相同（漂移 ${drift.length} 项：${drift.map((k) => `${k}→tools「${shared[k]}」/界面「${ui[k]}」`).join("；")}）`);
    ok(Object.keys(ui).length === Object.keys(shared).length,
      `${name} 两侧键数相同（界面 ${Object.keys(ui).length} / 判据 ${Object.keys(shared).length}：多一个键=界面上有个筛选项永远筛不到东西）`);
  }
}

/* 门的检查码清单与自审器覆盖必须同源：加码不加用例，这里立刻红 */
{
  const src = fs.readFileSync(path.join(ROOT, "tools", "validate-annals.mjs"), "utf8");
  const codes = new Set([...src.matchAll(/bad\("(ANNALS_[A-Z_]+)"/g)].map((m) => m[1]));
  const documented = [...src.matchAll(/^ \* {3}(ANNALS_[A-Z_]+)\s/gm)].map((m) => m[1]);
  for (const c of codes) ok(documented.includes(c), `检查码 ${c} 在文件头有登记（没有就说明文案与判据开始分家）`);
  for (const c of documented) ok(codes.has(c), `文件头写了 ${c} 但代码里没人调用它（说明这条门已被拆掉而文案还留着）`);
  for (const c of codes) ok(codesRed.has(c), `${c} 被定向打红过`);
  const untried = [...codes].filter((c) => !codesRed.has(c));
  if (untried.length) failures.push("    以下检查码从未被用例打红（可能已死）：" + untried.join(" "));
}

console.log(failures.join("\n"));
console.log(`明史编年层自审：${pass} 通过 / ${fail} 失败｜打红过 ${codesRed.size} 个码｜边界判绿 ${greens} 条｜隔离承重用例 ${isolatedTry} 条`);
if (fail) {
  console.log("!! 结论：门有假绿风险，先修门再落数据");
  process.exit(1);
}
console.log(`✅ ${codesRed.size} 码逐个可红，边界不误伤`);
