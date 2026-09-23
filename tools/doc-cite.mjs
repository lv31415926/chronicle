/* doc-cite.mjs | 文档里的条目引用必须与语料对账（§4A② 的机器化）
 *
 * 用法: node tools/doc-cite.mjs [--json]
 *
 * 为什么需要它：§4 的例证表曾写着「均田制=4 级」，而盘上 cn--485--i01 是 5 级；
 * 有人照文档推理去给别的条目降权，前提直接落空（§4A② 记下了这两次）。
 * 把例证换成 id 只解决了一半——id 也会过期：条目被删、被改权重，文档不会自己报错。
 * 所以凡是文档里出现的 `cn--…--xNN` / `world--…--xNN`，本脚本一律核两件事：
 *   ① 条目在盘上存在；② 引用紧跟其后的 wN（或「N 级」）与盘上权重一致。
 * 判据只认机械口径（存在性、数字相等），不做任何语义评价；没带权重的引用记为告警。
 *
 * 例外：**``` 围栏内不核**。围栏里是语法模板与命令，不是对语料的引用（§2 的 schema
 * 模板里 `id` 只是字段形状示例，硬拿去对账必然误报）。因此模板内的 id 一律写成
 * `…--pNN` 占位（双 N 不匹配本脚本的 id 正则），让人也一眼看出那是占位而非引用。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["tools/DATA_SCHEMA.md", "README.md"];
const ID_RE = /(?:cn|world)--b?\d+--[a-z]\d{2}/g;
const WEIGHT_WINDOW = 24;          // 权重必须写在 id 后 24 字符内，否则视为「引用没给级」
const JSON_OUT = process.argv.includes("--json");

const byId = new Map();
for (const sub of ["cn", "wd"]) {
  const dir = path.join(ROOT, "data", sub);
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    const w = { window: {} };
    new Function("window", fs.readFileSync(path.join(dir, n), "utf8"))(w.window);
    for (const arr of Object.values(w.window.__CHRONICLE_CHUNK))
      for (const e of arr) if (e && typeof e.id === "string" && !byId.has(e.id)) byId.set(e.id, e);
  }
}
if (!byId.size) { console.error("语料为空——先确认 data/{cn,wd}/*.js 就位"); process.exit(1); }

const errs = [], warns = [];

for (const rel of DOCS) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { errs.push(`${rel}: 文档不存在`); continue; }
  const text = fs.readFileSync(p, "utf8");
  const lines = text.split("\n");
  let inFence = false;
  lines.forEach((line, ln) => {
    if (/^```/.test(line.trim())) { inFence = !inFence; return; }
    if (inFence) return;
    for (const m of line.matchAll(ID_RE)) {
      const id = m[0], at = `${rel}:${ln + 1}`;
      const e = byId.get(id);
      if (!e) { errs.push(`${at}: 引用 ${id} —— 语料里没有这条（条目已删或当初就写错）`); continue; }
      const tail = line.slice(m.index + id.length, m.index + id.length + WEIGHT_WINDOW);
      const wm = /w([1-5])|weight\s*[=:]\s*([1-5])|\bw\b\s*([1-5])|(\d)\s*级/.exec(tail);
      const cited = wm ? Number(wm[1] || wm[2] || wm[3] || wm[4]) : null;
      if (cited === null) { warns.push(`${at}: ${id} 的引用没紧跟权重（写成「${id} 简述 wN」才可核）`); continue; }
      if (cited !== e.weight)
        errs.push(`${at}: 文档写 ${id} w${cited}，盘上实为 w${e.weight}「${e.title}」——文档已过期`);
    }
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ corpus: byId.size, errors: errs, warnings: warns }, null, 1));
} else {
  console.log(`文档引用对账 · 语料 ${byId.size} 条 · 文档 ${DOCS.join(" + ")}`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  for (const w of warns) console.log(`  ⚠ ${w}`);
  console.log(`\n=== ERRORS ${errs.length} ===  WARNINGS ${warns.length} ===`);
  console.log(errs.length ? "❌ FAIL" : "✅ PASS");
}
process.exitCode = errs.length ? 1 : 0;
