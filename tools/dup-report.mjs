/* dup-report.mjs | 列出所有「撞车 id」与「同年同维同名」的事件对，供主控逐条裁定
 * 用法: node tools/dup-report.mjs
 * 判重依据只有三种可用信号：id 串相同、(年+维+标题) 相同、正文长度差。
 * 报告不做删除决定——删除必须人工/契约层面先定去重口径。 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIM = { politics: "p", figure: "f", science: "s", culture: "c", art: "a", military: "m", economy: "e", institution: "i", explore: "x", disaster: "d" };
const files = [];
for (const [sub, prefix] of [["cn", "cn"], ["wd", "world"]]) {
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
    const w = { window: {} };
    new Function("window", fs.readFileSync(path.join(ROOT, "data", sub, n), "utf8"))(w.window);
    const key = path.basename(n, ".js");
    for (const e of w.window.__CHRONICLE_CHUNK[key]) files.push({ key, prefix, e, dl: [...((e.detail || {}).background || ""), ...((e.detail || {}).process || ""), ...((e.detail || {}).impact || "")].length });
  }
}
const byId = new Map(), bySig = new Map();
for (const r of files) {
  const k = `${r.prefix}|${r.e.year}|${DIM[r.e.dim]}|${r.e.title}`;
  (byId.get(r.e.id) || byId.set(r.e.id, []).get(r.e.id)).push(r);
  (bySig.get(k) || bySig.set(k, []).get(k)).push(r);
}
let n = 0;
const show = (tag, map) => {
  for (const [k, list] of map) {
    if (list.length < 2) continue;
    n++;
    console.log(`\n[${tag}#${n}] ${k}`);
    for (const r of list) console.log(`   ${r.key.padEnd(6)} w${r.e.weight} dl=${String(r.dl).padStart(3)} src=${(r.e.detail || {}).sources?.length || 0} rel=${(r.e.related || []).length}  ${r.e.id}  ${r.e.title} :: ${(r.e.summary || "").slice(0, 28)}`);
  }
};
show("ID", byId);
const idPairs = n;
n = 0;
show("SIG", bySig);
console.log(`\n撞车 id 组 ${idPairs}，同名同年同维组 ${n}`);
