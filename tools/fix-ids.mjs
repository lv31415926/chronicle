/* fix-ids.mjs | 给公元前事件的 id 补上 b 中缀（见 tools/DATA_SCHEMA.md §id）
 *
 * 旧规则丢掉负号，于是 前1000(wd-01) 与 公元1000(wd-03) 同为 world--1000--c01：
 * loader 撞 id 时把后到的一条改名，related 也会指错。本工具机械改写
 *   world--1000--c01  ->  world--b1000--c01      （仅该事件 year < 0 时）
 * 并让 related 跟上；跨分片且无法判定的引用直接删除并上报。
 *
 * 判定规则：
 *   · 老 id 全局只有一个持有者且它为公元前 → 整串替换（定义+引用一起改）。
 *   · 持有者 ≥2（公元前/公元撞车）→ 各文件只改自己那条定义；
 *     引用只解析为「同文件的持有者」，解析不到就删除并上报。
 * 幂等：已是 b 形态的 id 不再匹配。默认干跑，--write 落盘。
 * 用法: node tools/fix-ids.mjs [--write]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const OLD_SHAPE = /^(cn|world)--(\d+)--[pfscmeixad]\d{2}$/;

function readAll() {
  const out = [];
  for (const sub of ["cn", "wd"]) {
    const dir = path.join(ROOT, "data", sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js")).sort())
      out.push({ rel: path.join("data", sub, f), id: path.basename(f, ".js") });
  }
  return out;
}

function eventsOf(rel, chunkId) {
  const win = {};
  try { new Function("window", fs.readFileSync(path.join(ROOT, rel), "utf8"))(win); }
  catch (e) { console.error(`跳过 ${rel}: ${e.message}`); return null; }
  const arr = (win.__CHRONICLE_CHUNK || {})[chunkId];
  return Array.isArray(arr) ? arr : null;
}

const files = readAll();
const scanned = files.filter((f) => {
  const arr = eventsOf(f.rel, f.id);
  return arr && arr.length;
}).length;
if (!scanned) {
  console.error(`✗ 一个分片都没读到（ROOT=${ROOT}）——这是空跑，不是「无需修复」。检查 cwd 或 data/ 是否存在。`);
  process.exit(1);
}

/* ---- 1. 老形态 id 的持有者表 ---- */
const holders = new Map();          // oldId -> [{rel, year, newId}]
for (const f of files) {
  const arr = eventsOf(f.rel, f.id);
  if (!arr) continue;
  for (const e of arr) {
    if (!e || typeof e.id !== "string" || !OLD_SHAPE.test(e.id) || !Number.isInteger(e.year)) continue;
    const newId = e.year < 0 ? e.id.replace(/^(cn|world)--(\d+)/, "$1--b$2") : e.id;
    if (!holders.has(e.id)) holders.set(e.id, []);
    holders.get(e.id).push({ rel: f.rel, year: e.year, newId });
  }
}

/* ---- 1b. 产出形态硬闸 ----
 * 上一版把 "--" 吞掉，产出 cnb3000--s01 这种畸形 id；而干跑只报「130 个 id 待补 b 中缀」，
 * 不给任何一个样例，于是没有任何人看得见。改写成什么形态必须被机器守住，且落盘前拒绝畸形。 */
const BCE_SHAPE = /^(cn|world)--b\d+--[a-z]\d{2}$/;
const CE_SHAPE = /^(cn|world)--\d+--[a-z]\d{2}$/;
const malformed = [];
const samples = [];
for (const [oldId, list] of holders) {
  for (const h of list) {
    if (!BCE_SHAPE.test(h.newId) && !CE_SHAPE.test(h.newId)) malformed.push(`${oldId}  →  ${h.newId}`);
    if (h.newId !== oldId && samples.length < 3) samples.push(`${oldId} → ${h.newId}`);
  }
}
if (malformed.length) {
  console.error(`✗ 改写会产出畸形 id ${malformed.length} 个，拒绝落盘：`);
  malformed.slice(0, 5).forEach((m) => console.error("   " + m));
  console.error("  契约形态应为 cn--b3000--s01（公元前）或 cn--1500--e01（公元）。");
  process.exit(1);
}

/* ---- 2. 逐文件改写 ---- */
const dropped = [];
const rewritten = new Set();
let filesChanged = 0;

for (const f of files) {
  const p = path.join(ROOT, f.rel);
  const before = fs.readFileSync(p, "utf8");
  let src = before;

  for (const [oldId, list] of holders) {
    const need = list.filter((h) => h.newId !== oldId);      // 公元前持有者
    if (!need.length) continue;
    if (list.length === 1) {
      /* 全局唯一持有者：所有出现处都指向它，定义与引用一起换 */
      const to = need[0].newId;
      src = src.split('"' + oldId + '"').join('"' + to + '"')
               .split("'" + oldId + "'").join("'" + to + "'");
      rewritten.add(need[0].rel + "|" + oldId);
      continue;
    }
    /* 撞车：只改本文件的定义 */
    const own = need.find((h) => h.rel === f.rel) || list.find((h) => h.rel === f.rel);
    if (own && own.newId !== oldId) src = rewriteDefinition(src, oldId, own.newId);
    /* 本文件残留的出现处一定是 related */
    for (const lit of ['"' + oldId + '"', "'" + oldId + "'"]) {
      if (!src.includes(lit)) continue;
      if (own) {
        if (own.newId !== oldId) src = src.split(lit).join('"' + own.newId + '"');
        continue;
      }
      const safe = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const next = src.replace(/(related\s*:\s*\[)([^\]]*)(\])/g, (m, a, body, c) => {
        if (!body.includes(lit)) return m;
        const kept = body.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => s !== lit);
        dropped.push({ rel: f.rel, id: oldId });
        return a + (kept.length ? " " + kept.join(", ") + " " : "") + c;
      });
      if (next === src) dropped.push({ rel: f.rel, id: oldId, where: "非 related 位置，未处理" });
      src = next;
    }
    for (const h of need) rewritten.add(h.rel + "|" + oldId);
  }

  if (src === before) continue;
  filesChanged++;
  if (fs.readFileSync(p, "utf8") !== before) {
    console.error(`!! ${f.rel} 在本工具运行期间被改动，已跳过写入（请重跑）`);
    continue;
  }
  if (WRITE) {
    fs.writeFileSync(p + ".tmp", src);
    fs.renameSync(p + ".tmp", p);
  }
}

function rewriteDefinition(src, oldId, newId) {
  const esc = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(id\\s*:\\s*)([\"'])" + esc + "\\2", "g");
  return src.replace(re, (_m, pre, q) => pre + q + newId + q);
}

/* ---- 3. 报告 ---- */
const amb = [...holders.entries()].filter(([id, l]) => l.length > 1 && l.some((h) => h.newId !== id));
console.log(`${WRITE ? "已改写" : "干跑"}：${filesChanged} 个文件，${rewritten.size} 个公元前 id 待补 b 中缀`);
if (samples.length) console.log("  改写样例（请核对形态）: " + samples.join("   "));
if (amb.length) console.log(`撞车 id ${amb.length} 个：` + amb.map(([k, v]) => `${k}(${v.length}持有者)`).join(" "));
if (dropped.length) {
  console.log(`\n无法判定而删除的 related 引用 ${dropped.length} 处：`);
  for (const d of dropped.slice(0, 20)) console.log(`   [${d.rel}] → ${d.id}${d.where ? " (" + d.where + ")" : ""}`);
  if (dropped.length > 20) console.log(`   …另 ${dropped.length - 20} 处`);
}
if (!WRITE) console.log("\n（dry-run，加 --write 落盘）");
