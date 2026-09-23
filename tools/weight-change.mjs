/* weight-change.mjs | 权重单字段变更 + 内置自审门
 * 用法: node tools/weight-change.mjs <shard.js> <patch.json> [--write]
 *   patch.json = { "<id>": {"weight": 5, "why": "…"}, ... }
 *
 * 背景：#11 权重复核后要落 4–5 条改动。rewrite-invariants.mjs 的语义是
 * 「改写批次禁止动 weight」，正好用反——本工具需要的是相反方向的证明：
 * 断言 diff 恰好等于授权集合，且除 weight 外任何字段逐字节不变。
 * 少了这道门，一次手滑的 sed 就能在改权重的同时把散文或 sources 改掉，
 * 而 validate.mjs 只看分布，看不出这种附带损伤。
 *
 * 不带 --write 只做 dry-run 审计；带 --write 才落盘。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [shardArg, patchArg, writeArg] = process.argv.slice(2);
if (!shardArg || !patchArg) {
  console.error("用法: node tools/weight-change.mjs <shard.js> <patch.json> [--write]");
  process.exit(2);
}
const WRITE = writeArg === "--write";
if (writeArg && !WRITE) {
  console.error(`未知参数: ${writeArg}（只接受 --write）`);
  process.exit(2);
}

const shard = path.isAbsolute(shardArg) ? shardArg : path.join(ROOT, shardArg);
function load(p) {
  global.window = {};
  new Function("window", fs.readFileSync(p, "utf8"))(global.window);
  const arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0];
  if (!Array.isArray(arr)) throw new Error(`${p}: 未找到分片数组`);
  return arr;
}

const before = load(shard);
const patch = JSON.parse(fs.readFileSync(patchArg, "utf8"));
const src = fs.readFileSync(shard, "utf8").split("\n");
const errs = [];

/* 授权集合先自检：缺 why 的补丁一律拒绝——无理由的权重改动是本任务明令禁止的凑数 */
for (const [id, p] of Object.entries(patch)) {
  if (!p || typeof p.weight !== "number" || !Number.isInteger(p.weight) || p.weight < 1 || p.weight > 5) {
    errs.push(`${id} 补丁 weight 非法: ${JSON.stringify(p && p.weight)}`);
  }
  if (!p || typeof p.why !== "string" || p.why.trim().length < 8) {
    errs.push(`${id} 补丁缺 why（或短于 8 字）——权重改动必须落 §4 定义`);
  }
}

/* 逐行定位：格式无关，兼容 {id:"" / { id: "" / {"id": "" 四种存量风格 */
const ID_RE = /^\s*\{ ?"?id"? ?: ?"([^"]+)"/;
/* 只替换数字，键名/引号/空格整段逐字节回吐。
 * 反例（曾真实产出非法 JS）：把 ^?weight? 分开捕获再丢弃，
 * 遇 summary:"weight:2, 会把前引号吞掉变成 summary:weight:5, */
const W_RE = /((?:^|[^A-Za-z])"?weight"? ?: ?)([1-5])(?=[,\s}])/;
const touched = [];
const seen = new Set();

const out = src.map((line, i) => {
  const m = line.match(ID_RE);
  if (!m) return line;
  const id = m[1];
  seen.add(id);
  const p = patch[id];
  if (!p) return line;
  const wm = line.match(W_RE);
  if (!wm) { errs.push(`${id} 第 ${i + 1} 行定位不到 weight 字段`); return line; }
  const old = Number(wm[2]);
  if (old === p.weight) { errs.push(`${id} 补丁与现值相同（${old}），不属变更却列入授权集`); return line; }
  touched.push({ id, line: i + 1, old, next: p.weight, why: p.why });
  return line.replace(W_RE, (_a, key) => key + p.weight);
});

for (const id of Object.keys(patch)) if (!seen.has(id)) errs.push(`补丁里有未知 id: ${id}`);

/* 核心自审：改完重新解析，与改前逐条逐字段比对 */
let w5b, w5a, ge4b, ge4a, n;
if (!errs.length) {
  let after = null;
  try {
    global.window = {};
    new Function("window", out.join("\n"))(global.window);
    after = Object.values(global.window.__CHRONICLE_CHUNK)[0];
  } catch (e) {
    errs.push(`产物解析失败: ${e.message}——替换把行改坏，拒绝落盘`);
  }
  if (after) {
    n = after.length;
    if (before.length !== n) errs.push(`条数变化 ${before.length}→${n}`);
    const bById = new Map(before.map((e) => [e.id, e]));
    const authorized = new Set(touched.map((t) => t.id));
    const j = (x) => JSON.stringify(x === undefined ? null : x);
    for (const a of after) {
      const b = bById.get(a.id);
      if (!b) { errs.push(`条目凭空多出: ${a.id}`); continue; }
      for (const k of Object.keys({ ...b, ...a })) {
        if (j(b[k]) === j(a[k])) continue;
        if (k === "weight") {
          if (!authorized.has(a.id)) errs.push(`${a.id} weight 未授权却变了 ${b[k]}→${a[k]}`);
        } else {
          errs.push(`${a.id} 非 weight 字段 ${k} 被附带改动 —— 拒绝落盘`);
        }
      }
    }
    for (const [id] of bById) if (!after.some((e) => e.id === id)) errs.push(`条目消失: ${id}`);
    const cnt = (arr) => [arr.filter((e) => e.weight === 5).length, arr.filter((e) => e.weight >= 4).length];
    [w5b, ge4b] = cnt(before);
    [w5a, ge4a] = cnt(after);
  }
}

const pct = (x) => (n ? ((100 * x) / n).toFixed(2) + "%" : "—");
console.log(`权重变更审计 · ${path.basename(shard)} · 授权 ${Object.keys(patch).length} 条`);
for (const t of touched) console.log(`  L${String(t.line).padStart(3)} ${t.id}  ${t.old}→${t.next}  ${t.why}`);
if (errs.length) {
  console.log(`\n✗ ${errs.length} 项违规，未落盘：`);
  errs.slice(0, 30).forEach((e) => console.log("  " + e));
  process.exit(1);
}
console.log(`\n  实际改写 ${touched.length} 条 · 其余 ${n - touched.length} 条逐字段全等`);
console.log(`  w5   ${w5b} (${pct(w5b)}) → ${w5a} (${pct(w5a)})   带 8–15%`);
console.log(`  w≥4  ${ge4b} (${pct(ge4b)}) → ${ge4a} (${pct(ge4a)})   带 25–35%`);
if (!WRITE) {
  console.log("\n（dry-run，未落盘；加 --write 生效）");
  process.exit(0);
}
fs.writeFileSync(shard, out.join("\n"));
console.log("\n✅ 已落盘");
