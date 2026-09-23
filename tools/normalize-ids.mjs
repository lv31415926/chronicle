/* normalize-ids.mjs | 把全局撞车的 id 重排为唯一，并让 related 跟上
 * 用法: node tools/normalize-ids.mjs [--write] [--verbose]
 *
 * 为什么必须重排而不是删事件：id 是按「年+维度」编码的位置串（cn--b475--p01），
 * 两个分片各自覆盖同一年同一维时都会从 01 开始编号 → 字符串撞车。loader 按 id
 * 去重，撞车的后到事件会被改名或丢弃（DUP_ID 的实质是丢数据），而 related 指向
 * 撞车串时语义本身就不确定。所以只能给后到者换号，不能删。
 *
 * 最小扰动原则：一个事件只有在「它的 id 全局唯一、且确实编码了自己的年前缀/年/
 * 维度」时才保留原号；其余成员按分片顺序补最小空位。这样绝大多数事件不动，
 * related 需要改写的次数最少。
 *
 * 三道闸门（沿用 split-shard 的教训）：
 *   1. 逐行认出的条数必须等于垫片加载的条数，否则拒绝落盘（防空集守恒假证）。
 *   2. 改完重新加载，逐条比对 JSON 严格等于「原事件 + 只替换 id/related」，
 *      证明正文零误伤；再断言全局唯一 id 数 == 事件总数。
 *   3. 读盘与写盘之间比对 sha，有代理正在写这个文件就停手。 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const VERBOSE = process.argv.includes("--verbose");
const DIM_INIT = { politics: "p", figure: "f", science: "s", culture: "c", art: "a", military: "m", economy: "e", institution: "i", explore: "x", disaster: "d" };
const ID_SHAPE = /^(cn|world)--(b?)(\d+)--([a-z])(\d{2,})$/;
/* 数据集里有两种行编码：JS 对象字面量 `{id:` / `{ id:`，以及整行 JSON 的 `{"id":"`
 * （cn-01/02/03/04/08 与部分分片的追加尾巴）。只认一种会把另一类整片漏认。 */
const HEAD_RE = /^\s*\{\s*"?id"?\s*:/;
const fail = (m) => { console.error("ABORT: " + m); process.exit(1); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

const DIRS = [["cn", "data/cn", "cn"], ["wd", "data/wd", "world"]];

/* ---------- 1. 读入 ---------- */
const files = [];
for (const [, sub, prefix] of DIRS) {
  const dir = path.join(ROOT, sub);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".js")).sort()) {
    const rel = path.join(sub, name);
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const key = path.basename(name, ".js");
    const w = { window: {} };
    try { new Function("window", buf.toString("utf8"))(w.window); } catch (e) { fail(`${rel} 垫片解析失败: ${e.message}`); }
    const arr = (w.window.__CHRONICLE_CHUNK || {})[key];
    if (!Array.isArray(arr)) fail(`${rel} 没加载出 __CHRONICLE_CHUNK["${key}"]`);
    const lines = buf.toString("utf8").split("\n");
    const rowIdx = [];
    lines.forEach((ln, i) => { if (HEAD_RE.test(ln)) rowIdx.push(i); });
    if (rowIdx.length === 0) fail(`${rel} 行首正则没认出任何事件行，但垫片加载了 ${arr.length} 条`);
    if (rowIdx.length !== arr.length) fail(`${rel} 逐行认出 ${rowIdx.length} 条 ≠ 垫片加载 ${arr.length} 条，有条目跨行或未被识别`);
    files.push({ rel, key, prefix, lines, rowIdx, text: buf.toString("utf8"), h: sha(buf), arr });
  }
}
if (!files.length) fail("一个分片都没读到——这是空跑，不是「无需重排」");
const total = files.reduce((s, f) => s + f.arr.length, 0);

/* ---------- 2. 分桶 + 最小扰动定号 ---------- */
const enc = (prefix, e, n) => `${prefix}--${e.year < 0 ? "b" : ""}${Math.abs(e.year)}--${DIM_INIT[e.dim]}${String(n).padStart(2, "0")}`;
const idCount = new Map();
for (const f of files) for (const e of f.arr) idCount.set(e.id, (idCount.get(e.id) || 0) + 1);

const buckets = new Map();
files.forEach((f, fi) => f.arr.forEach((e, ei) => {
  const k = `${f.prefix}|${e.year}|${DIM_INIT[e.dim]}`;
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push({ fi, ei, e, prefix: f.prefix });
}));

const finalId = new Map();          // "fi|ei" -> 定稿 id
const used = new Set();             // 全局已占用的定稿 id
/* 第一遍：可信的原号先占位（全局唯一 + 确实编码自身） */
for (const [, members] of buckets) {
  for (const m of members) {
    const cur = m.e.id;
    const mm = ID_SHAPE.exec(cur);
    const own = mm && mm[1] === m.prefix && (mm[2] === "b") === (m.e.year < 0)
      && Number(mm[3]) === Math.abs(m.e.year) && mm[4] === DIM_INIT[m.e.dim];
    if (own && idCount.get(cur) === 1 && !used.has(cur)) { finalId.set(`${m.fi}|${m.ei}`, cur); used.add(cur); }
  }
}
/* 第二遍：其余成员补本桶最小空位 */
let renumbered = 0;
const movedSamples = [];
for (const [k, members] of buckets) {
  const taken = new Set(members.map((m) => finalId.get(`${m.fi}|${m.ei}`)).filter(Boolean));
  const free = [];
  for (let n = 1; taken.size + free.length < members.length; n++) {
    const cand = enc(members[0].prefix, members[0].e, n);
    if (!taken.has(cand) && !used.has(cand)) free.push(cand);
  }
  let j = 0;
  for (const m of members) {
    const key = `${m.fi}|${m.ei}`;
    if (finalId.has(key)) continue;
    if (j >= free.length) fail(`桶 ${k} 找不到足够空位（成员 ${members.length}）`);
    finalId.set(key, free[j]); used.add(free[j]); j++;
    if (free[j - 1] !== m.e.id) {
      renumbered++;
      if (movedSamples.length < 6) movedSamples.push(`${m.e.id} → ${free[j - 1]}  [${files[m.fi].key}] ${m.e.title}`);
    }
  }
}

/* ---------- 3. related 解析表 ---------- */
/* 老 id -> 持有者列表（按全局顺序）。唯一持有者直接映射；撞车的按「同分片优先，
 * 其次全局先到」判定，判定过的都要上报，因为这一条本身是历史遗留的歧义链接。 */
const holders = new Map();
files.forEach((f, fi) => f.arr.forEach((e, ei) => {
  if (!holders.has(e.id)) holders.set(e.id, []);
  holders.get(e.id).push({ fi, ei });
}));
const ambiguous = [];
function resolveTarget(r, selfFi) {
  const list = holders.get(r);
  if (!list) return null;                                  // 悬空：原样保留，交给 dangling 门
  if (list.length === 1) return finalId.get(`${list[0].fi}|${list[0].ei}`);
  const same = list.find((h) => h.fi === selfFi) || list[0];
  return finalId.get(`${same.fi}|${same.ei}`);
}

/* ---------- 4. 逐行改写（一行一事件，定义与 related 同行，天然不需要跨行处理） ---------- */
const idDefRe = /\{\s*"?id"?\s*:\s*(["'])([^"']+)\1/;
const REL_RE = /"?related"?\s*:\s*\[[^\]]*\]/g;
const outputs = [];
let relatedRewritten = 0;
let danglingBefore = 0;
for (const f of files) for (const e of f.arr) for (const r of e.related || []) if (!holders.has(r)) danglingBefore++;
for (const [fi, f] of files.entries()) {
  const newLines = f.lines.slice();
  f.rowIdx.forEach((li, ri) => {
    const ln = f.lines[li];
    const m = idDefRe.exec(ln);
    if (!m) fail(`${f.rel} 有一行认作事件却提不出 id：${ln.slice(0, 60)}`);
    if (m[2] !== f.arr[ri].id) fail(`${f.rel} 第 ${ri} 行 id=${m[2]} 与垫片第 ${ri} 条 id=${f.arr[ri].id} 不同序`);
    const oldId = m[2];
    const key = `${fi}|${ri}`;
    const nid = finalId.get(key);
    if (!nid) fail(`${f.rel} 行 ${oldId} 没有定稿 id（索引失败）`);
    let out = ln.replace(idDefRe, (mm) => mm.replace(oldId, nid));
    out = out.replace(REL_RE, (seg) => {
      const next = seg.replace(/(["'])((?:cn|world)--(?:b?\d+)--[a-z]\d{2,})\1/g, (_s, q, r) => {
        if (r === oldId) return q + nid + q;                 // 自指随定义一起走
        const t = resolveTarget(r, fi);
        if (!t) return _s;                                          // 悬空：原样保留，交给 dangling 门
        if (holders.get(r).length > 1) ambiguous.push({ from: nid, to: r, cand: holders.get(r).length });
        if (t === r) return _s;
        relatedRewritten++;
        return q + t + q;
      });
      return next;
    });
    newLines[li] = out;
  });
  outputs.push({ f, lines: newLines });
}

/* ---------- 5. 落盘前复验：重新加载，逐条比对「只换了 id/related」 ---------- */
function projection(e) {
  const o = { ...e };
  delete o.id; delete o.related;
  const sorted = {};
  for (const k of Object.keys(o).sort()) sorted[k] = o[k];
  return JSON.stringify(sorted);
}
function verify(texts) {
  const bad = [], seen = new Set();
  let n = 0, dang = 0;
  for (const [fi, t] of texts.entries()) {
    const w = { window: {} };
    try { new Function("window", t)(w.window); } catch (e) { return [`${files[fi].rel} 重新加载失败: ${e.message}`]; }
    const arr = w.window.__CHRONICLE_CHUNK[files[fi].key];
    if (!Array.isArray(arr)) return [`${files[fi].rel} 重新加载后没有 chunk key`];
    if (arr.length !== files[fi].arr.length) return [`条数变了 ${files[fi].rel}: ${files[fi].arr.length} → ${arr.length}`];
    arr.forEach((e, ei) => {
      n++;
      const old = files[fi].arr[ei];
      const wantId = finalId.get(`${fi}|${ei}`);
      if (e.id !== wantId) bad.push(`${files[fi].rel}#${ei} id 定稿不符：期望 ${wantId} 实得 ${e.id}`);
      const mm = ID_SHAPE.exec(String(e.id));
      if (!mm || mm[1] !== files[fi].prefix || (mm[2] === "b") !== (e.year < 0) || Number(mm[3]) !== Math.abs(e.year) || mm[4] !== DIM_INIT[e.dim])
        bad.push(`${files[fi].rel}#${ei} 定稿 id ${e.id} 与自身 year/dim/track 不符`);
      if (seen.has(e.id)) bad.push(`定稿 id 仍撞车 ${e.id}`);
      seen.add(e.id);
      if (projection(e) !== projection(old)) bad.push(`${files[fi].rel}#${ei} (${e.title}) 正文被误改`);
      const ro = old.related || [], rn = e.related || [];
      if (ro.length !== rn.length) bad.push(`${files[fi].rel}#${ei} related 条数变了 ${ro.length} → ${rn.length}`);
      ro.forEach((r, k) => {
        const want = resolveTarget(r, fi) || r;
        if (rn[k] !== want) bad.push(`${files[fi].rel}#${ei} related[${k}] 期望 ${want} 实得 ${rn[k]}`);
      });
    });
  }
  for (const [fi, t] of texts.entries()) {
    const w = { window: {} }; new Function("window", t)(w.window);
    for (const e of w.window.__CHRONICLE_CHUNK[files[fi].key]) for (const r of e.related || []) if (!seen.has(r)) dang++;
  }
  if (n !== total) bad.push(`事件总数变了 ${total} → ${n}`);
  if (seen.size !== total) bad.push(`唯一 id 数 ${seen.size} ≠ 事件总数 ${total}`);
  if (dang > danglingBefore) bad.push(`悬空 related ${danglingBefore} → ${dang}，变多了`);
  return bad;
}
const textsOut = outputs.map((o) => o.lines.join("\n"));
const issues = verify(textsOut);
if (issues.length) { console.error("✗ 复验未过，拒绝落盘:"); issues.slice(0, 12).forEach((s) => console.error("   " + s)); process.exit(1); }

/* ---------- 6. 写入（原子 + sha 守卫） ---------- */
let written = 0;
for (const o of outputs) {
  const text = o.lines.join("\n");
  if (text === o.f.text) continue;
  const p = path.join(ROOT, o.f.rel);
  if (sha(fs.readFileSync(p)) !== o.f.h) { console.error(`!! ${o.f.rel} 运行期间被改写，跳过（请重跑）`); continue; }
  written++;
  if (WRITE) { const tmp = p + ".tmp"; fs.writeFileSync(tmp, text); fs.renameSync(tmp, p); }
}
console.log(`${WRITE ? "已改写" : "干跑"} ${written}/${files.length} 个分片 | 事件 ${total} 条 | 重排 id ${renumbered} 个 | related 跟随 ${relatedRewritten} 处`);
if (movedSamples.length) { console.log("  重排样例:"); movedSamples.forEach((s) => console.log("   " + s)); }
if (ambiguous.length) console.log(`  其中 ${ambiguous.length} 处 related 原本指向撞车串（歧义），已按「同分片优先」定标：` +
  ambiguous.slice(0, 5).map((a) => `${a.from}→${a.to}(${a.cand}候选)`).join("  ") + (ambiguous.length > 5 ? ` …另 ${ambiguous.length - 5} 处` : ""));
console.log("  复验通过：条数守恒 / 唯一 id 数 == 事件总数 / 正文零误伤 / 悬空 related 未增加");
if (VERBOSE) console.log("  分片明细: " + files.map((f) => `${f.key}:${f.arr.length}`).join(" "));
if (!WRITE) console.log("\n（dry-run，加 --write 落盘）");
