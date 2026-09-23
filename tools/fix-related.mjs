/* fix-related.mjs | 修悬空 related：目标 (年+维) 只有一个候选就改指它，没有就把这条指针删掉
 * 用法: node tools/fix-related.mjs [--write]
 * 为什么不猜「大概是序号写错了」而改成别的维：悬空只有两种成因——
 *   (a) 序号漂了（同年同维确有此事，只是编号被 normalize 改过）→ 该改指，且只有唯一候选时才能改；
 *   (b) 作者凭印象写了个不存在的年/维 → 无从判定本意，删指针比留断链好（断链点了没反应，是可见缺陷）。
 * 多个候选时不动并上报，交主控判。 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");
const DIM = { politics: "p", figure: "f", science: "s", culture: "c", art: "a", military: "m", economy: "e", institution: "i", explore: "x", disaster: "d" };
const HEAD_RE = /^\s*\{\s*"?id"?\s*:/;
const REL_SEG = /("?)related("?)(\s*:\s*)(\[[^\]]*\])/g;
const fail = (m) => { console.error("ABORT: " + m); process.exit(1); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
const files = [];
for (const [sub, prefix] of [["cn", "cn"], ["wd", "world"]]) {
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
    const p = path.join(ROOT, "data", sub, n);
    const buf = fs.readFileSync(p);
    const key = path.basename(n, ".js");
    const w = { window: {} };
    try { new Function("window", buf.toString("utf8"))(w.window); } catch (e) { fail(`${key}: ${e.message}`); }
    const arr = w.window.__CHRONICLE_CHUNK[key];
    const lines = buf.toString("utf8").split("\n");
    const rowIdx = [];
    lines.forEach((ln, i) => { if (HEAD_RE.test(ln)) rowIdx.push(i); });
    if (rowIdx.length !== arr.length) fail(`${key} 行 ${rowIdx.length} ≠ 条 ${arr.length}`);
    files.push({ rel: path.join("data", sub, n), key, prefix, arr, lines, rowIdx, h: sha(buf) });
  }
}
const all = files.flatMap((f) => f.arr);
const idSet = new Set(all.map((e) => e.id));
const byId = new Map(all.map((e) => [e.id, e]));
/* 年+维 -> 候选列表；前缀取所属分片，不取 id 串（作者可能写错 id 前缀） */
const byYearDim = new Map();
for (const f of files) for (const e of f.arr) {
  const k = `${f.prefix}|${e.year}|${DIM[e.dim]}`;
  if (!byYearDim.has(k)) byYearDim.set(k, []);
  byYearDim.get(k).push({ id: e.id, key: f.key });
}
const targetOf = (r) => { const m = /^(cn|world)--(b?)(\d+)--([a-z])\d{2,}$/.exec(r); return m ? `${m[1]}|${(m[2] === "b" ? -1 : 1) * Number(m[3])}|${m[4]}` : null; };
let retarget = 0, dropped = 0;
const ambiguousList = [];
const changedFiles = [];
for (const f of files) {
  const newLines = f.lines.slice();
  let touched = false;
  f.rowIdx.forEach((li, ri) => {
    const ev = f.arr[ri];
    if (!(ev.related || []).length) return;
    const bad = ev.related.filter((r) => !idSet.has(r));
    if (!bad.length) return;
    const out = [];
    for (const r of ev.related) {
      if (idSet.has(r)) { out.push(r); continue; }
      const bucket = byYearDim.get(targetOf(r) || "?") || [];
      const cands = bucket.map((x) => x.id).filter((x) => idSet.has(x) && x !== ev.id);
      if (cands.length === 1) { out.push(cands[0]); retarget++; console.log(`  改指 ${ev.id}: ${r} → ${cands[0]}`); continue; }
      if (cands.length > 1) {
        const recip = cands.filter((x) => (byId.get(x).related || []).includes(ev.id));
        if (recip.length === 1) { out.push(recip[0]); retarget++; console.log(`  改指(回指) ${ev.id}: ${r} → ${recip[0]}`); continue; }
        const same = cands.filter((x) => bucket.find((y) => y.id === x).key === f.key);
        if (same.length === 1) { out.push(same[0]); retarget++; console.log(`  改指(同片) ${ev.id}: ${r} → ${same[0]}`); continue; }
        ambiguousList.push({ from: ev.id, to: r, cands });
        out.push(r);            // 多候选：原指针留着，交主控判——删掉是把「待定」做成了「已处理」
        continue;
      }
      dropped++;
      console.log(`  删指针 ${ev.id}（${ev.title}）→ ${r}（${bucket.length ? "候选只有它自己" : "该年该维无任何事件"}）`);
    }
    const uniq = [...new Set(out)].filter((x) => x !== ev.id);
    newLines[li] = f.lines[li].replace(REL_SEG, (m0, q1, q2, sep, arrLit) => {
      const q = arrLit.includes("'") ? "'" : '"';
      const rebuilt = uniq.map((x) => q + x + q).join(", ");
      return arrLit.startsWith("[") && arrLit.endsWith("]") ? `${q1}related${q2}${sep}[${rebuilt}]` : m0;
    });
    touched = true;
  });
  if (!touched) continue;
  const text = newLines.join("\n");
  if (text === f.lines.join("\n")) continue;
  const p = path.join(ROOT, f.rel);
  if (sha(fs.readFileSync(p)) !== f.h) { console.error(`!! ${f.rel} 运行期间被改写，跳过（请重跑）`); continue; }
  const w2 = { window: {} };
  try { new Function("window", text)(w2.window); } catch (e) { fail(`${f.rel} 改后无法解析: ${e.message}`); }
  const after = w2.window.__CHRONICLE_CHUNK[f.key];
  if (after.length !== f.arr.length) fail(`${f.rel} 条数变了 ${f.arr.length} → ${after.length}`);
  after.forEach((e, i) => {
    const o = f.arr[i];
    const pa = { ...e }; delete pa.related;
    const pb = { ...o }; delete pb.related;
    if (JSON.stringify(pa) !== JSON.stringify(pb)) fail(`${f.rel}#${i} (${e.title}) 除 related 外正文被改动`);
    for (const r of e.related || []) if (r === e.id) fail(`${f.rel}#${i} related 指向自身`);
    if ((e.related || []).length > 4) fail(`${f.rel}#${i} related 超过 4 项`);
  });
  changedFiles.push({ f, text });
}
console.log(`${WRITE ? "已改写" : "干跑"} ${changedFiles.length} 个分片：改指 ${retarget} 处，删无源指针 ${dropped} 处${ambiguousList.length ? `，多候选待定 ${ambiguousList.length} 处` : ""}`);
for (const a of ambiguousList) console.log(`  [多候选未动] ${a.from} → ${a.to} 候选 ${a.cands.join(" / ")}`);
if (WRITE) for (const c of changedFiles) { const p = path.join(ROOT, c.f.rel); fs.writeFileSync(p + ".tmp", c.text); fs.renameSync(p + ".tmp", p); }
if (!WRITE) console.log("\n（dry-run，加 --write 落盘）");
