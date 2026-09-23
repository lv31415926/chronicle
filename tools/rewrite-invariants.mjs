/* rewrite-invariants.mjs | 文体改写的事实不变量校验：改写只许动散文字段，不许动任何事实字段
 * 用法: node tools/rewrite-invariants.mjs <before.js> <after.js>
 *
 * 背景：wd-04 需把 160 条从浅文言改写为白话。散文改写由子代理执行，
 * 若它在改写时顺手改了 year / sources / weight，那是数据完整性事故，
 * 而通读散文是看不出来的。故把「哪些字段允许变」写成硬门。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [beforeArg, afterArg] = process.argv.slice(2);
if (!beforeArg || !afterArg) {
  console.error("用法: node tools/rewrite-invariants.mjs <before.js> <after.js>");
  process.exit(2);
}

function load(p) {
  global.window = {};
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  new Function("window", fs.readFileSync(abs, "utf8"))(global.window);
  const arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0];
  if (!Array.isArray(arr)) throw new Error(`${p}: 未找到分片数组`);
  return arr;
}

const before = load(beforeArg);
const after = load(afterArg);
const errs = [];
const j = (x) => JSON.stringify(x === undefined ? null : x);

if (before.length !== after.length) {
  errs.push(`条数变化: ${before.length} → ${after.length}（改写不得增删条目）`);
}

const bById = new Map(before.map((e) => [e.id, e]));
const aById = new Map(after.map((e) => [e.id, e]));
for (const id of bById.keys()) if (!aById.has(id)) errs.push(`条目消失: ${id}`);
for (const id of aById.keys()) if (!bById.has(id)) errs.push(`条目凭空多出: ${id}`);

/* 事实字段：一律不得变 */
const FROZEN = ["track", "year", "yearApprox", "dim", "weight"];
const FROZEN_D = ["sources", "figures", "place", "state", "tags"];
/* 散文字段：允许改写，但必须仍在长度契约内。[字段名, 取值路径] */
const PROSE_FIELDS = [
  ["title", (e) => e.title],
  ["summary", (e) => e.summary],
  ["background", (e) => e.detail && e.detail.background],
  ["process", (e) => e.detail && e.detail.process],
  ["impact", (e) => e.detail && e.detail.impact],
];
const MAXLEN = { title: 24, summary: 45 };

let proseChanged = 0, proseSame = 0, checked = 0;
for (const [id, b] of bById) {
  const a = aById.get(id);
  if (!a) continue;
  checked++;
  for (const k of FROZEN) {
    if (j(b[k]) !== j(a[k])) errs.push(`${id} 事实字段 ${k} 被改动: ${b[k]} → ${a[k]}`);
  }
  for (const k of FROZEN_D) {
    if (j(b.detail && b.detail[k]) !== j(a.detail && a.detail[k])) {
      errs.push(`${id} 事实字段 detail.${k} 被改动: ${j(b.detail && b.detail[k])} → ${j(a.detail && a.detail[k])}`);
    }
  }
  let touched = false;
  for (const [k, get] of PROSE_FIELDS) {
    const bRaw = get(b);
    const aRaw = get(a);
    if (typeof aRaw !== "string" || !aRaw.trim()) {
      errs.push(`${id} 散文字段 ${k} 为空或非字符串`);
      continue;
    }
    if (MAXLEN[k] && aRaw.length > MAXLEN[k]) {
      errs.push(`${id} ${k} 超长: ${aRaw.length} > ${MAXLEN[k]}`);
    }
    if (j(bRaw) !== j(aRaw)) touched = true;
  }
  if (touched) proseChanged++; else proseSame++;
}

console.log(`不变量校验：比对 ${checked} 条`);
console.log(`  散文有改动 ${proseChanged} 条 / 完全未动 ${proseSame} 条`);
if (errs.length) {
  console.log(`\n✗ ${errs.length} 项违规：`);
  errs.slice(0, 40).forEach((e) => console.log("  " + e));
  if (errs.length > 40) console.log(`  …另 ${errs.length - 40} 项`);
  process.exit(1);
}
console.log("\n✅ 事实字段全部未动，散文字段仍在长度契约内");
