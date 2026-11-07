/* test-chain.mjs | validate-chain 的可红性自审：十七个检查码都要被定向打红一次
 * 用法: node tools/test-chain.mjs
 *
 * 这一层是全站的危险层：它说的是「因为 A 所以后来有 B」，而读者分不清
 * 「史书这样写了」和「本站这样连的」。所以这里的用例全是「一句话怎么写成造假」的动作：
 * 把顺序编倒、把小事换成大事、把没有的材料名写成出处、把本站的推断写成有凭、
 * 把紧挨着的两件事排成涟漪、把套话写成存疑。
 *
 * 夹具为什么要 2 片 × 6 条：COVERAGE 线是 2 片 / 10 条 / 单片 3 条，CROSS 线是跨轨 5 条，
 * 小夹具永远站在红线以下，那样的「变红」只证明夹具本来就小，不证明门有效。
 * 所以夹具按生产形态铺满（12 条链，跨轨 6 条），再用删除与替换把它推下去。
 *
 * mustGreen 那几条不是凑数：「本站的连接」允许没有凭据、「有出处」允许多条材料、
 * 落点允许 w=2、引号对里的评价词允许出现——这四条边界如果被写坏，
 * 门会从「抓造假」变成「一直叫」，那和没有门一样糟。
 *
 * 所有变异只发生在 mkdtemp 的副本上，工作区一个字节都不写。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0; const failures = [];
/* 汇总报的是「实际打红过几个码、验过几条豁免」，不写死数字——
 * 写死的计数会在下一次加码时变成一句假话。 */
const codesRed = new Set(); let greens = 0;
function ok(c, n) { if (c) pass++; else { fail++; failures.push("✗ " + n); } }

const CK = ["ancient", "earlymodern"], PER = 6;   /* 2 片 × 6 条 = 12，压在 10 条线之上 */
const LOC = "《夹具书·卷三》";                      /* 两端条目的 sources 里都有它，故可做凭据 */
const GROUNDED = "有出处", INFERRED = "本站的连接";
const CAVEAT = "此链为夹具用例：两处相连的因果是推定，先后可考而中间环节缺乏，或出后人附会。";

/* 环的年份按全局序号铺开：每环隔 40 年，保证 SPAN（每环 ≥3 年）永远有余量。 */
function ringYear(j, k) { return 100 + j * 160 + k * 40; }
function ringTrack(j, k) { return j % 2 === 0 ? (k % 2 === 0 ? "cn" : "world") : "cn"; }
function ringId(j, k) { return `${ringTrack(j, k)}--y${ringYear(j, k)}--r${k}`; }
function ringCount(j) { return 3 + (j % 4); }      /* 3–6 环，全部落在合法区间 */

function mkAnchor(j, k) {
  const last = k === ringCount(j) - 1;
  return {
    id: ringId(j, k), track: ringTrack(j, k), year: ringYear(j, k), yearApprox: false,
    dim: "politics", weight: last ? 1 : 4,
    title: `夹具条目${j}-${k}`, summary: `夹具摘要${j}-${k}`,
    detail: { background: "缘起。", process: "经过。", impact: "影响。",
      figures: [], place: "某地", state: "某", sources: [LOC], tags: ["夹具"] },
    related: [],
  };
}
/* 单层用的锚点：只给年月与权重，其余按夹具口径补齐（sources 里有 LOC，凭据才不至于无处落）。 */
function mkFlatAnchor(id, year, weight, track) {
  return {
    id, track: track || "cn", year, yearApprox: false, dim: "politics", weight,
    title: "夹具补环" + id, summary: "夹具摘要。",
    detail: { background: "缘起。", process: "经过。", impact: "影响。",
      figures: [], place: "某地", state: "某", sources: [LOC], tags: ["夹具"] },
    related: [],
  };
}
/* 默认全合规：用例在它上面做减法或做替换。 */
function mkChain(j, k0) {
  const n = ringCount(j);
  const links = [];
  for (let k = 0; k < n; k++) {
    if (k === n - 1) { links.push({ ev: ringId(j, k) }); continue; }
    const infer = k % 3 === 2;      /* 每三条边留一条「本站的连接」，其余有凭 */
    const L = { ev: ringId(j, k), claim: `夹具说法${j}-${k}：此事之后，彼事遂起。`, basis: infer ? INFERRED : GROUNDED };
    if (!infer) L.prov = [LOC];
    links.push(L);
  }
  /* id 里的分片键必须等于「这条链实际被写进哪一片」：c = floor(j / PER)。
   * 早先按 j % 2 取键，夹具自己就先犯了 SCHEMA 要抓的错，于是每条 mustGreen 都红。 */
  return { id: `ch-${CK[Math.floor(j / PER)]}-${String(k0 + 1).padStart(3, "0")}`, title: `夹具涟漪${j}-${k0}`, links, caveat: CAVEAT };
}

function dumpChunk(id, list) {
  /* 守卫行必须逐片都写——漏了它，浏览器里前一片把全局建好，毛病就藏住了。 */
  return `window.__CHRONICLE_CHAIN_CHUNK = window.__CHRONICLE_CHAIN_CHUNK || {};\n` +
    `window.__CHRONICLE_CHAIN_CHUNK[${JSON.stringify(id)}] = ${JSON.stringify(list, null, 1)};\n`;
}

function fixture(mutate, opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-chain-"));
  fs.mkdirSync(path.join(dir, "data/cn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/wd"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/chain"), { recursive: true });

  const anchors = [], chunks = [];
  for (let j = 0; j < CK.length * PER; j++) {
    for (let k = 0; k < ringCount(j); k++) anchors.push(mkAnchor(j, k));
  }
  for (let c = 0; c < CK.length; c++) {
    const list = [];
    for (let i = 0; i < PER; i++) list.push(mkChain(c * PER + i, i));
    chunks.push({ id: CK[c], file: CK[c] + ".js", label: "夹具片" + CK[c], list });
  }
  const data = { anchors, chunks };
  if (mutate) mutate(data);

  if (o.dropCorpus) { fs.rmSync(path.join(dir, "data/cn"), { recursive: true, force: true }); }
  fs.writeFileSync(path.join(dir, "data/cn/cn-01.js"),
    `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
    `window.__CHRONICLE_CHUNK["cn-01"] = ${JSON.stringify(data.anchors.filter((a) => a.track === "cn"), null, 1)};\n`);
  fs.writeFileSync(path.join(dir, "data/wd/wd-01.js"),
    `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\n` +
    `window.__CHRONICLE_CHUNK["wd-01"] = ${JSON.stringify(data.anchors.filter((a) => a.track === "world"), null, 1)};\n`);
  for (const c of data.chunks) if (!o.skipFile || c.file !== o.skipFile) fs.writeFileSync(path.join(dir, "data/chain", c.file), dumpChunk(c.id, c.list));
  fs.writeFileSync(path.join(dir, "data/chain/manifest.js"),
    `window.__CHRONICLE_CHAIN_MANIFEST = ${JSON.stringify(
      { version: 1, label: "夹具", chunks: data.chunks.filter((c) => c.reg !== false && !o.dropManifest).map((c) => ({ id: c.id, file: c.reg || c.file, label: c.label })) }, null, 1)};\n`);
  if (o.dropManifest) fs.rmSync(path.join(dir, "data/chain/manifest.js"), { force: true });
  if (o.dropDir) fs.rmSync(path.join(dir, "data/chain"), { recursive: true, force: true });
  return dir;
}
function run(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-chain.mjs"), "--root", dir], { encoding: "utf8" });
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
  const p = path.join(dir, "data/chain", file);
  fs.writeFileSync(p, edit(fs.readFileSync(p, "utf8")));
  const { rc, out } = run(dir);
  const hit = rc === 1 && out.includes(code);
  if (hit) codesRed.add(code);
  ok(hit, `${name} → 变红并点名 ${code}`);
  if (!hit) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 6).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}
/* 夹具里的第 c 片第 i 条链的第 k 环 / 第 j 条全局链 */
function L(d, c, i, k) { return d.chunks[c].list[i].links[k]; }

/* ---------- ⓪ 正控制 ---------- */
mustGreen("夹具基线判绿（12 条链 / 2 片 / 跨轨 6 条）");

/* ---------- ① 注入器自审：门真在读这几份文件 ---------- */
mustRed("data/chain 目录整层缺失", "CHAIN_FILE", null, { dropDir: true });
mustRed("manifest 不在盘上", "CHAIN_FILE", null, { dropManifest: true });
mustRedFile("分片全局名写错", "CHAIN_SCHEMA", "ancient.js",
  (t) => t.replace(/__CHRONICLE_CHAIN_CHUNK/g, "__CHRONICLE_CHAIN_CHUNKZ"));
mustRedFile("manifest 全局名写错", "CHAIN_FILE", "manifest.js",
  (t) => t.replace("__CHRONICLE_CHAIN_MANIFEST", "__CHRONICLE_CHAIN_MANIFESTZ"));
/* 浏览器里不发作、只有逐片单独求值才现形的那颗雷。 */
mustRedFile("分片少了 window.__CHRONICLE_CHAIN_CHUNK = ... || {} 守卫", "CHAIN_SCHEMA", "earlymodern.js",
  (t) => t.replace("window.__CHRONICLE_CHAIN_CHUNK = window.__CHRONICLE_CHAIN_CHUNK || {};\n", ""));
mustRedFile("分片有语法错误时门仍出结论", "CHAIN_SCHEMA", "ancient.js", (t) => t.replace(/\];\n$/, "\n"));
mustRedFile("分片写了两个分片键", "CHAIN_SCHEMA", "ancient.js",
  (t) => t + `window.__CHRONICLE_CHAIN_CHUNK["extra"] = [];\n`);

/* ---------- ② MANIFEST：登记与磁盘双向 ---------- */
mustRed("磁盘上有分片但没登记（界面永远加载不到）", "CHAIN_MANIFEST",
  (d) => { d.chunks[1].reg = false; });
mustRed("登记了磁盘上没有的分片（注入 404）", "CHAIN_MANIFEST",
  (d) => { d.chunks[0].reg = "ghost.js"; }, { skipFile: "ancient.js" });

/* ---------- ③ SCHEMA：字段与形态 ---------- */
mustRed("链存了 year（年份的第二份口径）", "CHAIN_SCHEMA",
  (d) => { d.chunks[0].list[0].year = 1500; });
mustRed("环存了 weight（权重的第二份口径）", "CHAIN_SCHEMA",
  (d) => { L(d, 0, 0, 0).weight = 1; });
mustRed("id 前缀与分片键不符（深链与清单对不上）", "CHAIN_SCHEMA",
  (d) => { d.chunks[1].list[0].id = "ch-ancient-009"; });
mustRed("id 形态不合（缺三位序号）", "CHAIN_SCHEMA",
  (d) => { d.chunks[0].list[1].id = "ch-ancient-X"; });
mustRed("title 超 40 字（抽屉一行放不下）", "CHAIN_SCHEMA",
  (d) => { d.chunks[0].list[2].title = "夹".repeat(41); });
mustRed("末环私带 basis（没有下一环就没有这条边）", "CHAIN_SCHEMA",
  (d) => { const s = L(d, 0, 0, ringCount(0) - 1); s.basis = INFERRED; });
mustRed("links 不是数组", "CHAIN_SCHEMA",
  (d) => { d.chunks[0].list[3].links = {}; });

/* ---------- ④ DUP ---------- */
mustRed("两条链同 id", "CHAIN_DUP",
  (d) => { d.chunks[0].list[1].id = d.chunks[0].list[0].id; });
mustRed("同一条链里同一个事件出现两次", "CHAIN_DUP",
  (d) => { L(d, 0, 2, 1).ev = L(d, 0, 2, 0).ev; });

/* ---------- ⑤ ANCHOR / ANCHOR_PROV ---------- */
mustRed("环的 ev 不在语料里", "CHAIN_ANCHOR",
  (d) => { L(d, 0, 4, 0).ev = "cn--y99999--r0"; });
mustRed("环的锚点自己没有任何出处（这一环悬空）", "CHAIN_ANCHOR_PROV",
  (d) => { for (const a of d.anchors) if (a.id === L(d, 0, 4, 0).ev) a.detail.sources = []; });
mustGreen("锚点存在且自己带出处（上面两条红的反面）",
  (d) => {
    /* 把一条链的落点换成另一条真实在盘、sources 非空的锚点：
     * ANCHOR 与 ANCHOR_PROV 同时给出「怎么做才算对」，而不只是「怎么做算错」。 */
    const c = d.chunks[0].list[5];
    const ev = "cn--yalt--r7";
    d.anchors.push(mkFlatAnchor(ev, 1980, 1));
    c.links[c.links.length - 1].ev = ev;
  });

/* ---------- ⑥ ORDER：顺序与同年 ---------- */
mustRed("环序倒退（把后事写在前事之下）", "CHAIN_ORDER",
  (d) => { const l = L(d, 0, 1, 1); const t = l.ev; l.ev = L(d, 0, 1, 2).ev; L(d, 0, 1, 2).ev = t; });
mustRed("两环同年（同年谁先谁后，本站不替读者猜）", "CHAIN_ORDER",
  (d) => { L(d, 0, 1, 1).ev = ringId(1, 0); /* 与第 0 环同一条：同时触发 DUP，但 ORDER 必须一起红 */ });

/* ---------- ⑦ LINKS：环数与 claim 的位置 ---------- */
mustRed("只有两环（两环不成链）", "CHAIN_LINKS",
  (d) => { d.chunks[0].list[0].links = d.chunks[0].list[0].links.slice(0, 2); });
mustRed("七环以上（多半是在硬凑）", "CHAIN_LINKS",
  (d) => {
    /* 整条换成七环：环数判据要在「其余全合规」的前提下被单独推下去，
     * 在原有的 3–6 环上修修补补会同时踩到 ORDER/SMALL，结论就说不清了。 */
    const c = d.chunks[0].list[0];
    c.links = [];
    for (let k = 0; k < 7; k++) {
      const ev = `cn--y7-${k}--r0`;
      if (k < 6) d.anchors.push(mkFlatAnchor(ev, 1700 + k * 20, 4));
      else d.anchors.push(mkFlatAnchor(ev, 1700 + k * 20, 1));
      c.links.push(k < 6
        ? { ev, claim: `夹具第七环链第${k + 1}接：由此及彼。`, basis: GROUNDED, prov: [LOC] }
        : { ev });
    }
  });
mustRed("末环带了 claim（它后面本站没有再连任何东西）", "CHAIN_LINKS",
  (d) => { L(d, 0, 3, ringCount(3) - 1).claim = "夹具多写的一句。"; });
mustRed("中环缺 claim（说了半句「于是」没有下文）", "CHAIN_LINKS",
  (d) => { delete L(d, 0, 3, 0).claim; });

/* ---------- ⑧ SPAN ---------- */
mustRed("三环只跨两年（紧挨着的事排成一行）", "CHAIN_SPAN",
  (d) => {
    const c = d.chunks[0].list[0], base = 1900;
    ["cn--ys1", "cn--ys2", "cn--ys3"].forEach((id, k) => {
      d.anchors.push(mkFlatAnchor(id, base + k, k === 2 ? 1 : 4));
    });
    c.links = [
      { ev: "cn--ys1", claim: "夹具第一接。", basis: GROUNDED, prov: [LOC] },
      { ev: "cn--ys2", claim: "夹具第二接。", basis: GROUNDED, prov: [LOC] },
      { ev: "cn--ys3" }
    ];
  });

/* ---------- ⑨ SMALL：落点必须是小事件 ---------- */
mustRed("末环是大事（w=5），这条链只是另一份大事年表", "CHAIN_SMALL",
  (d) => {
    const c = d.chunks[0].list[0];
    const big = "cn--ybig--r0";
    d.anchors.push(mkFlatAnchor(big, 1990, 5));
    c.links[c.links.length - 1].ev = big;
  });
mustGreen("末环 w=2 仍算小事（SMALL 的边界：≤2 放行）",
  (d) => {
    const c = d.chunks[0].list[1];
    const e2 = "cn--yw2--r0";
    d.anchors.push(mkFlatAnchor(e2, 1995, 2));
    c.links[c.links.length - 1].ev = e2;
  });

/* ---------- ⑩⑪⑫ BASIS / PROV / GROUNDED ---------- */
mustRed("basis 自造第三档", "CHAIN_BASIS",
  (d) => { L(d, 0, 0, 0).basis = "史载"; });
mustRed("标「有出处」却不给材料名", "CHAIN_BASIS",
  (d) => { delete L(d, 0, 0, 0).prov; });
mustRed("标「本站的连接」却列出了材料名", "CHAIN_BASIS",
  (d) => { const l = L(d, 0, 1, 2); l.prov = [LOC]; });   /* j=1 的第 3 环本就是 INFERRED 边，只补 prov 不动 basis */
mustRed("材料名不在这边两端条目的 sources 里（本站造了个书名）", "CHAIN_PROV",
  (d) => { L(d, 0, 0, 0).prov = ["《夹伪造书·卷九》"]; });
mustRed("一条链全是本站的连接（还不该进这一层）", "CHAIN_GROUNDED",
  (d) => { const c = d.chunks[0].list[0]; for (let k = 0; k < c.links.length - 1; k++) { c.links[k].basis = INFERRED; delete c.links[k].prov; } });
mustGreen("一条链只有一边有凭，其余全是本站的连接",
  (d) => {
    const c = d.chunks[0].list[2];
    for (let k = 0; k < c.links.length; k++) {
      if (k === c.links.length - 1) continue;
      if (k === 0) { c.links[k].basis = GROUNDED; c.links[k].prov = [LOC]; }
      else { c.links[k].basis = INFERRED; delete c.links[k].prov; }
    }
  });

/* ---------- ⑬ CAVEAT ---------- */
mustRed("整条链没有 caveat", "CHAIN_CAVEAT",
  (d) => { delete d.chunks[0].list[0].caveat; });
mustRed("caveat 是句套话（没有存疑词）", "CHAIN_CAVEAT",
  (d) => { d.chunks[0].list[1].caveat = "此事影响深远，值得读者记住这条链的因果。"; });
mustRed("caveat 只怀疑事件真伪，没有一句说这条连接", "CHAIN_CAVEAT",
  (d) => { d.chunks[0].list[2].caveat = "两处系年或有出入，所记人数未必准确，此说尚待核对。"; });
mustRed("caveat 太短（18 字不算一句存疑）", "CHAIN_CAVEAT",
  (d) => { d.chunks[0].list[3].caveat = "此链因果出于推定，先后可考。"; });

/* ---------- ⑭ CROSS ---------- */
mustRed("跨轨链只剩 4 条（这一层不再讲影响后续世界）", "CHAIN_CROSS",
  (d) => {
    /* 跨轨链是 j 为偶数的那 6 条；它们的落点恒在 cn（环数 3 或 5，末环序号为偶），
     * 所以改落点推不动跨轨数——这里改的是「环所属的那一轨」：把两条链中间的
     * world 环改挂到 cn 轨上，年代、权重、凭据全不变，只有跨轨这条判据被推下去。 */
    const ids = [];
    for (const j of [0, 2]) {
      const c = d.chunks[Math.floor(j / PER)].list[j % PER];
      c.links.forEach((l, k) => { if (l.ev && l.ev.indexOf("world--") === 0) ids.push(l.ev); });
    }
    for (const a of d.anchors) if (ids.includes(a.id)) a.track = "cn";
  });
mustRed("某一片的首环全挤在同一世纪（链没铺开）", "CHAIN_CROSS",
  (d) => {
    /* 把 earlymodern 片里每条链的首环换成同一年的一条 cn 锚点：只让 CENTURIES
     * 这一条判据被推下去，落点与其余环全部原样保留。 */
    const ev = "cn--yf1500--r0";
    d.anchors.push(mkFlatAnchor(ev, 1500, 4));
    for (const c of d.chunks[1].list) c.links[0].ev = ev;
  });

/* ---------- ⑮ STANCE ---------- */
mustRed("claim 里替史料夸（评价词不在引号内）", "CHAIN_STANCE",
  (d) => { L(d, 0, 0, 0).claim = "这是一项辉煌的成就，于是有了后事。"; });
mustGreen("同一句夸落在引号对内（文献原话豁免）",
  (d) => { L(d, 0, 0, 0).claim = "时人称之「辉煌的成就」，此事遂见于后文。"; });
mustRed("title 里写评价词", "CHAIN_STANCE",
  (d) => { d.chunks[0].list[4].title = "伟大的西行与它的余波"; });

/* ---------- ⑯ COVERAGE ---------- */
mustRed("总链数掉到 9（< 10）", "CHAIN_COVERAGE",
  (d) => { d.chunks[1].list.length = 3; });   /* 6 + 3 = 9：单片 3 条仍在线上，只有总数被推下去 */
mustRed("单片只剩 2 条（< 3）", "CHAIN_COVERAGE",
  (d) => { d.chunks[1].list.length = 2; });
mustRed("分片数只剩 1（< 2）", "CHAIN_COVERAGE",
  (d) => { d.chunks.length = 1; });
mustRed("同一个事件被 5 条链当环（在凑链不是在记涟漪）", "CHAIN_COVERAGE",
  (d) => {
    /* 首环换成同一条：101 年小于这五条链各自的第二环，所以只有复用这一条红。
     * 分散在两片（3 + 2），免得某一片首环全落同一世纪把 CROSS 一起带红。 */
    const shared = "cn--yshared--r0";
    d.anchors.push(mkFlatAnchor(shared, 101, 4));
    [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]].forEach(([c, i]) => {
      d.chunks[c].list[i].links[0].ev = shared;
    });
  });

/* ---------- ⑰ 生产数据实测 ---------- */
{
  const { rc, out } = run(ROOT);
  ok(rc === 0, `真实涟漪层判绿\n${out.split("\n").slice(-2).join("\n")}`);
  const m = /涟漪层：(\d+) 条链 \/ (\d+) 环 \/ (\d+) 片（跨轨 (\d+) 条、有凭的边 (\d+) 条、涉及事件 (\d+) 个）/.exec(out);
  ok(!!m, `汇总行解析得到（解析不到＝这条实测只是看着绿）：${out.split("\n").pop()}`);
  if (m) {
    ok(Number(m[1]) >= 10, `真实链数 ${m[1]} ≥ 10`);
    ok(Number(m[2]) >= Number(m[1]) * 3, `环数 ${m[2]} ≥ 链数 × 3（每条链至少三环）`);
    ok(Number(m[3]) === 2, `分片 ${m[3]} 片，与 manifest 一致`);
    ok(Number(m[4]) >= 5, `跨轨链 ${m[4]} ≥ 5：这一层讲的确实是「影响后续世界」而不是内部分支`);
    ok(Number(m[5]) >= Number(m[1]), `有凭的边 ${m[5]} ≥ 链数 ${m[1]}（每条链至少一边有凭）`);
    /* 这里原来写的是「涉及事件 ＝ 环数」，把 2026-11-06 那天零复用的快照当成了不变量。
     * 两条链共用一个两端都真的相连的事件是合法的（滥用由硬门的 MAX_TIMES_USED 管），
     * 等式只会把合法复用判红。改回它本来想盯的东西：复用必须还是稀的——
     * 一处都不许复用做不到，但「复用比链还多」就是拿同一个事件反复当环来凑链了。 */
    const reuse = Number(m[2]) - Number(m[6]);
    ok(Number(m[6]) > 0 && reuse <= Number(m[1]),
      `真实链复用 ${reuse} 处 ≤ 链数 ${m[1]}（涉及事件 ${m[6]} / 环数 ${m[2]}）：环几乎各属一事`);
  }
}

/* ---------- ⑱ 用例对检查码清单的覆盖率 ---------- */
/* 清单不在这里抄一份——抄的那份会在下一个人加码时静默过期，于是「十七个码全打红」
 * 变成一句假话。两个来源现取并核对：头部注释里登记的，和 bad() 里真发出去的。
 * 只加注释不发码（写了不做的门）与只发码不注释（做了不说的门）都会在这里露出。 */
{
  const src = fs.readFileSync(path.join(ROOT, "tools", "validate-chain.mjs"), "utf8");
  const declared = [...src.matchAll(/^\s+\*\s+(CHAIN_[A-Z_]+)\s{2,}\S/gm)].map((m) => m[1]);
  const emitted = [...src.matchAll(/\bbad\(\s*"(CHAIN_[A-Z_]+)"/g)].map((m) => m[1]);
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

/* ---------- ⑲ 词表同源：三道门共用一把尺子 ---------- */
/* 立场词表从 validate-achv / validate-story / validate-chain 各自的内联抄本迁到了
 * tools/voice-lib.mjs。迁完之后必须钉住「没人再抄回来」：多一个抄本，
 * 同一句话就会在这道门红、在那道门绿。判据从三份文件现取，不写死词表内容。 */
{
  const lib = fs.readFileSync(path.join(ROOT, "tools", "voice-lib.mjs"), "utf8");
  const has = (n) => new RegExp("(?:const|var|let|\\b)" + n + "\\s*=\\s*/").test(lib);
  ok(has("PRAISE") && has("QUOTES"), `voice-lib 里 PRAISE／QUOTES 都定义得到（取不到下面的对账是空对账）`);
  for (const f of ["validate-achv.mjs", "validate-story.mjs", "validate-chain.mjs"]) {
    const s = fs.readFileSync(path.join(ROOT, "tools", f), "utf8");
    const own = /(?:const|var|let)\s+PRAISE\s*=\s*\//.test(s);
    ok(!own, `${f} 没有自己重抄 PRAISE（有＝第四把尺子，改一处漏两处）`);
    ok(/voice-lib\.mjs/.test(s), `${f} 从 voice-lib 取词表`);
  }
}

/* ---------- ⑳ 界面接线：门判得再对，没人渲染就等于这一层不存在 ----------
 * 上面的用例全在 data/chain 上做文章；这一节盯着 js/ 与 index.html。
 * 涟漪层比故事层多一条风险：读者把「本站的连接」读成「史料的说法」。
 * 所以这里不只验「有没有接上」，还验两档 basis 在界面与门两侧同名、
 * 并且排版上没有把其中一档做成弱一档的脚注。判据一律从文件里现取，不抄行数、不抄 z 值。 */
{
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const html = read("index.html");
  const app = read("js/app.js"), detail = read("js/detail.js"),
        route = read("js/router.js"), keys = read("js/interaction.js"),
        chain = read("js/chain.js"), css = read("css/chain.css");

  ok(html.includes('<script src="js/chain.js"></script>') && html.includes('href="css/chain.css"'),
     "涟漪层的模块与样式都被 index.html 挂上（孤儿文件＝功能不存在）");
  ok(/ChronChain\.block\(/.test(detail) && /if \(window\.ChronChain\) html \+= ChronChain\.block\(ev\);/.test(detail),
     "详情抽屉里画了「此事牵出的涟漪」：因果要贴着条目出现，不是只有抽屉");
  ok(/ChronChain\.handleDetailClick\(/.test(detail) && /\[data-ch\]/.test(detail),
     "详情的点击委托把 ch-* 那一笔交回涟漪层（选择器里没有 data-ch 就永远轮不到它）");
  ok(/name === "chain"/.test(route) && /ChronChain\.open\(\{ chain: r\.params\.id/.test(route),
     "路由认得 #/chain：parse 有分支、apply 有落点（缺一个就是打不开的深链）");
  ok(/ChronChain\.isOpen\(\)[\s\S]{0,40}ChronChain\.close\(\)/.test(keys),
     "Esc 阶梯里有涟漪抽屉（不收它，键盘用户关不掉这一层）");
  ok(/case "b": case "B":/.test(keys) && /ChronRouter\.go\("#\/chain"\)/.test(keys),
     "有 b/B 开关涟漪抽屉，且与顶栏按钮同一条路由路径（只在回调里 open，地址栏就跟屏幕分家）");
  ok(/\$\("btn-chain"\)\.addEventListener/.test(app) && /\$\("btn-chain"\)\.classList\.toggle/.test(app),
     "顶栏有涟漪按钮的点击落点，且亮灭在 syncToggles 里由状态反推（只在回调里改类名会停在写死的默认值上）");

  /* 故事与涟漪两个抽屉同宽同侧，同时开着只剩最上面那个还点得动：两侧必须互相收。 */
  ok(/r\.name === "story"[\s\S]{0,400}ChronChain\.close\(\)/.test(route) &&
     /r\.name === "chain"[\s\S]{0,400}ChronStory\.close\(\)/.test(route),
     "路由进故事分支会收涟漪、进涟漪分支会收故事（不收就成了两个抽屉叠在同一块屏幕上）");
  /* close() 必须把 hash 也收掉：只收屏幕不改地址，刷新一次这一层自己弹回来。 */
  ok(/function close\(\)[\s\S]{0,400}resetHash\(\["#\/chain"\]\)/.test(chain),
     "ChronChain.close() 调 resetHash([\"#/chain\"])（关掉后地址栏还指着 #/chain＝刷新就复开）");

  /* basis 名单两侧必须同源：门改了三档而界面还用两档，卡上就会出现一类没人判定过的连接，
   * 或者出现一个门从没见过的 class 兜底样式。 */
  const vSrc = read("tools/validate-chain.mjs");
  const gv = [...vSrc.matchAll(/const (?:GROUNDED|INFERRED) = "([^"]+)"/g)].map((m) => m[1]);
  const gsM = /var BASES = \[([^\]]+)\]/.exec(chain);
  ok(gv.length === 2 && !!gsM, `两侧的二选一名单都解析得到（门 ${gv.length} 个／界面 ${gsM ? 2 : 0} 个：解析不到下面的对账就是空对账）`);
  if (gv.length === 2 && gsM) {
    const gs = gsM[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    ok(gs.slice().sort().join("|") === gv.slice().sort().join("|"),
       `界面 BASES 与门的两档逐字相同（界面「${gs.join("|")}」／门「${gv.join("|")}」：改名必须两侧同步）`);
    /* 每一档都要有排版归宿：漏一档就落进兜底样式，两档看起来一样，这一层就白标了。 */
    const miss = gs.filter((b) => !new RegExp('BASIS_CLS\\["?' + b).test(chain) &&
      !new RegExp('"' + b + '":\\s*"').test(chain));
    ok(!miss.length, `两档 basis 都在界面有样式键${miss.length ? `（缺：${miss.join("、")}）` : ""}`);
  }

  /* 层叠：抽屉压在详情之上，但不能高过投稿弹窗——投稿入口就在详情里。 */
  const zof = (sel) => { const m = new RegExp(sel + "\\s*\\{[^}]*z-index:\\s*(\\d+)").exec(css); return m ? Number(m[1]) : null; };
  const zCh = zof(".chain-drawer");
  const zDetail = Number((/\.detail\s*\{[^}]*z-index:\s*(\d+)/.exec(read("css/layout.css")) || [])[1]);
  const zContrib = Number((/\.contrib-modal\s*\{[^}]*z-index:\s*(\d+)/.exec(read("css/components.css")) || [])[1]);
  ok(zCh !== null && Number.isFinite(zDetail) && Number.isFinite(zContrib),
     `三层的 z-index 都读得到（涟漪 ${zCh}／详情 ${zDetail}／投稿 ${zContrib}：读不到就没法比大小）`);
  if (zCh !== null && Number.isFinite(zDetail) && Number.isFinite(zContrib)) {
    ok(zCh > zDetail, `涟漪抽屉(${zCh})压在详情(${zDetail})之上：从详情点开的链不能被详情盖住`);
    ok(zCh < zContrib, `涟漪抽屉(${zCh})仍在投稿弹窗(${zContrib})之下：补一条链也要填得进表单`);
  }
  /* 本仓的抽屉都用 hidden 属性收放，而 [hidden] 的 UA 样式会被作者写的 display:flex 顶掉。 */
  ok(/\.chain-drawer\[hidden\]\s*\{[^}]*display:\s*none/.test(css),
     ".chain-drawer[hidden] 显式 display:none（只有 hidden 属性时，class 上的 display:flex 会赢过 UA，关掉后抽屉还杵在屏上）");

  /* 两档标记在样式里必须同字号：这一层的风险不是「不好看」，而是读者把本站的推断当史料。
   * 把「本站的连接」写得比「有出处」小或淡，等于劝读者别看它。
   * 字号只有一份（.ch-basis），两档变体只许改线型与色相：变体里再出现 font/font-size
   * 就是在给某一档单独调大小，这里按「变体不许带字号」判。 */
  {
    const body = (sel) => {
      const m = new RegExp("\\." + sel + "\\s*\\{([^}]*)\\}").exec(css.replace(/\/\*[\s\S]*?\*\//g, ""));
      return m ? m[1] : null;
    };
    const shared = body("ch-basis");
    const fsh = shared && (/font:\s*[^;{}]*?(\d+(?:\.\d+)?)px/.exec(shared) || /font-size:\s*(\d+(?:\.\d+)?)px/.exec(shared));
    ok(!!fsh, `.ch-basis 的共同字号读得到（${fsh ? fsh[1] + "px" : "读不到"}：读不到就没法说两档一样大）`);
    const bad = ["ch-basis-gp", "ch-basis-self"].filter((s) => {
      const b = body(s);
      return b === null || /\bfont(?:-size)?\s*:/.test(b);
    });
    ok(!bad.length, `两档 basis 变体都不带字号（${bad.join("、") || "全部只改线型与色相"}：谁单独带字号，谁就被排得比另一档小或大）`);
    /* 色相也不能一浓一淡到看不出是同级：两档必须都落在成文的强调色上，而不是其中一档走 --ink-faint。 */
    const cols = ["ch-basis-gp", "ch-basis-self"].map((s) => (body(s) || "").replace(/\s/g, ""));
    const faint = cols.filter((c) => /color:var\(--ink-faint\)/.test(c));
    ok(!faint.length, `没有哪一档 basis 走弱字色 --ink-faint（弱字色是这一层里「可以不看」的颜色）`);
  }

  /* 权重账：components.css 的 .detail .para p 是「两类一型」，
   * 任何写成 .detail .某类（两类）的覆盖根本压不住它。名单从 chain.js 的
   * <p class="..."> 现取，不手写：换了标签或加了段落，这条自动跟着变。 */
  const comps = read("css/components.css");
  const paraP = /\.detail \.para p\s*\{[^}]*\}/.exec(comps);
  const spec = (s) => ((s.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length) * 10 +
    ((s.replace(/\.[\w-]+|\[[^\]]+\]/g, "").match(/[a-zA-Z][\w-]*/g) || []).length);
  const need = spec(".detail .para p");
  ok(!!paraP && need > 0,
     `.detail .para p 在 components.css 里读得到且权重算得出（${paraP ? "读到了，权重 " + need : "没读到"}：算不出来下面的对账就是空账）`);
  const pCls = [...new Set([...chain.matchAll(/<p class="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)))];
  ok(pCls.length >= 2, `解析到链卡上 ${pCls.length} 个挂在 <p> 里的类（少于 2 个＝这条门空转：${pCls.join(",")}）`);
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
      `详情里覆盖到 <p> 段落字色/字号的规则有 ${checked.length} 条（0 条=链卡在详情里全靠 .para p 的默认，两处同色无从谈起：${checked.join(" / ")}）`);
    ok(!losing.length,
      `每条 .detail 的段落覆盖权重都不低于 .detail .para p（${losing.join(" / ") || "全部达标"}：写轻了压不住，抽屉与详情会给出两个色/两个字号）`);
  }

  /* 小字标签的字色下限：这一层有两句话是 10px 的——环号（详情里「在链上第 2、4 环」就靠它对上）
   * 和「据以连接的材料」（唯一说明这句话凭什么的字）。实测 --ink-faint 在深墨题下对面板底只有
   * 3.5:1，读到那个亮度等于劝读者跳过，而这两句正是本层最不该被跳过的。
   * 判据先自证：拿一段故意写错的样式喂给它，抓不到就是空转（下面那条「哨兵能红」）。 */
  {
    const LABELS = ["ch-lab", "ch-no"];
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s/g, "");
    const faintIn = (s) => {
      const m = new RegExp("\\." + s + "\\{([^}]*)\\}").exec(flat);
      return m === null ? "MISSING" : /color:var\(--ink-faint\)/.test(m[1]);
    };
    const probe = faintIn("ch-lab@zz");
    ok(probe === "MISSING",
      `弱字色哨兵的取样读得到规则（取样结果 ${JSON.stringify(probe)}：读不到下面的「不走弱字色」就是空账）`);
    ok(faintIn("ch-basis-gp") === false && /color:var\(--ink-faint\)/.test(".ch-basis-self{color:var(--ink-faint)}".replace(/\s/g, "")),
      "弱字色哨兵能红：读不到规则会报 MISSING，写错的样式会被判真（两条各打一侧，缺一侧下面的绿灯不可信）");
    const dim = LABELS.filter((s) => faintIn(s) === true);
    const gone = LABELS.filter((s) => faintIn(s) === "MISSING");
    ok(!gone.length, `链卡的小标签类都在样式里读得到（${gone.join("、") || "全部读到"}：读不到说明界面改了类名而这条门还在绿灯）`);
    ok(!dim.length,
      `环号与「据以连接的材料」都不走 --ink-faint（${dim.join("、") || "全部落在可读字色上"}：10px 小字配弱字色实测 3.5:1，读者会整句跳过）`);
  }
}

console.log(`\n涟漪层门自审：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) { console.log(failures.join("\n")); process.exitCode = 1; }
else console.log(`✅ ${codesRed.size} 个检查码都被定向打红过一次，${greens} 条豁免边界都验过，真实涟漪层判绿`);
