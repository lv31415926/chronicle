/* sort-shard.mjs | 把分片内事件行按 year 升序重排（validate 的 UNSORTED 警告由此消除）
 *
 * 为什么要有闸：重排是整段搬动文本，最坏情况是「少认出一行事件」——那一行会留在原位，
 * 而它被当成不存在，于是条目凭空丢失或重复。所以三道闸缺一不可：
 *   1) 逐行识别出的条数与 id 序列，必须与 window 垫片加载出来的权威数组完全一致；
 *   2) 重排前后所有事件行的「去尾逗号」多重集必须相等（只允许顺序与逗号变化）；
 *   3) 写盘前重读源文件比对 sha，运行期间被别的进程改过就放弃（有代理正在写它）。
 * 同一年的事件保持原有相对顺序（稳定排序），不重排非事件行（注释/头尾）。
 * 幂等：已有序的分片跑一遍零改动。默认干跑，--write 落盘。
 * 用法: node tools/sort-shard.mjs cn-06 wd-04 [--write]
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
keys.length || fail("用法: node tools/sort-shard.mjs <分片id…> [--write]");

function fail(msg) { console.error("ABORT: " + msg); process.exit(1); }
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

function locate(key) {
  for (const sub of ["cn", "wd"]) {
    const rel = path.join("data", sub, key + ".js");
    if (fs.existsSync(path.join(ROOT, rel))) return rel;
  }
  return null;
}

/* 一行是不是一个完整事件？返回事件对象或 null */
function parseRow(line) {
  const t = line.trim().replace(/,$/, "");
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  let e;
  try { e = new Function('"use strict";return (' + t + ")")(); } catch { return null; }
  return e && typeof e === "object" && typeof e.id === "string" ? e : null;
}

const stripComma = (l) => l.replace(/,\s*$/, "");

for (const key of keys) {
  const rel = locate(key);
  if (!rel) fail(`找不到分片 ${key}（data/cn 或 data/wd 下没有 ${key}.js）`);
  const p = path.join(ROOT, rel);
  const src0 = fs.readFileSync(p, "utf8");
  const h0 = sha(src0);

  const win = {};
  new Function("window", src0)(win);
  const AUTH = (win.__CHRONICLE_CHUNK || {})[key];
  if (!Array.isArray(AUTH) || !AUTH.length) fail(`${key} 垫片加载失败或为空，拒绝重排`);

  const lines = src0.split("\n");
  const pos = [];            // 事件行在原文件里的行号
  const rows = [];           // 与 pos 一一对应的事件对象
  lines.forEach((l, i) => { const e = parseRow(l); if (e) { pos.push(i); rows.push(e); } });

  if (rows.length === 0) fail(`${key} 行首识别出 0 个事件行，本片实有 ${AUTH.length} 条；照排会清空`);
  if (rows.length !== AUTH.length)
    fail(`${key} 逐行认出 ${rows.length} 条 ≠ 垫片加载 ${AUTH.length} 条，有行未被识别（多行事件？），拒绝重排`);
  if (rows.map((r) => r.id).join(",") !== AUTH.map((r) => r.id).join(","))
    fail(`${key} 逐行认出的 id 序列与垫片数组不一致，行边界判断有误，拒绝重排`);

  const order = pos.map((_, i) => i).sort((a, b) => rows[a].year - rows[b].year || a - b);
  const moved = order.filter((i, rank) => i !== rank).length;
  if (!moved) { console.log(`${key}: 已有序，无需改动`); continue; }

  const usesComma = pos.filter((li) => lines[li].trim().endsWith(",")).length * 2 >= pos.length;
  const out = lines.slice();
  pos.forEach((li, rank) => {
    out[li] = stripComma(lines[pos[order[rank]]]) + (usesComma && rank < pos.length - 1 ? "," : "");
  });

  /* 守恒：事件行去逗号后的多重集不得变化 */
  const before = pos.map((li) => stripComma(lines[li]).trim()).sort().join("\n");
  const after = pos.map((li) => stripComma(out[li]).trim()).sort().join("\n");
  if (before !== after) fail(`${key} 重排前后事件行多重集不等，有条目被改写`);
  /* 结果必须真的有序 */
  const seq = pos.map((li) => parseRow(out[li]).year);
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) fail(`${key} 重排后仍存在逆序（@${i}）`);

  const next = out.join("\n");
  if (fs.readFileSync(p, "utf8") !== src0) fail(`${key} 源文件在计算期间被改动（有代理在写它），已放弃`);
  console.log(`${WRITE ? "已重排" : "干跑"} ${key}: ${moved} 个事件行换位，共 ${pos.length} 行 / ${AUTH.length} 条`);
  if (WRITE) {
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, next);
    if (sha(fs.readFileSync(p, "utf8")) !== h0) fail(`${key} 写盘前源文件 sha 变了，已放弃（tmp 保留在 ${tmp}）`);
    fs.renameSync(tmp, p);
    const w2 = {}; new Function("window", fs.readFileSync(p, "utf8"))(w2);
    const after2 = w2.__CHRONICLE_CHUNK[key];
    if (!Array.isArray(after2) || after2.length !== AUTH.length)
      fail(`${key} 落盘后条数变了（${AUTH.length} → ${after2 && after2.length}）`);
  }
}
if (!WRITE) console.log("\n（dry-run，加 --write 落盘）");
