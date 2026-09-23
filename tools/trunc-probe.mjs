/* trunc-probe.mjs | 区分两类「末尾不像完整句」：
 *   DANGLING  真截断——停在虚词/连词/开引号/顿号等不可能收尾的位置
 *   NOPUNCT   只是省略句末标点（cn-08 一类半文言声口），内容完整
 * 上一版只看「不以句末标点结尾」，把 155 条 cn-08 半文言误报成截断；
 * 而 dup-report 用 slice(0,28) 显示摘要，又把完整的 wd-11 摘要看成断句。
 * 两者都是显示/判据造成的假案，必须分开度量。
 * 用法: node tools/trunc-probe.mjs [--samples] */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMP = process.argv.includes("--samples");
const END = /[。！？；…”』》）】]$/;
const DANGLER = /[的一-龥]?(?:的|而|与|和|及|于|在|为|以|之|其|所|被|把|从|向|由于|因为|包括|以及|即|乃|系|[，、；：（「『“《〈—…·])$/;
const rows = [];
for (const sub of ["cn", "wd"]) {
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
    const w = { window: {} };
    new Function("window", fs.readFileSync(path.join(ROOT, "data", sub, n), "utf8"))(w.window);
    const key = path.basename(n, ".js");
    const arr = w.window.__CHRONICLE_CHUNK[key];
    let dang = 0, nop = 0;
    const hits = [];
    for (const e of arr) {
      const fs_ = [["summary", e.summary], ["background", e.detail?.background], ["process", e.detail?.process], ["impact", e.detail?.impact]];
      const noEnd = fs_.filter(([, v]) => typeof v === "string" && v.length && !END.test(v.trim()));
      if (!noEnd.length) continue;
      nop++;
      const d = noEnd.filter(([, v]) => DANGLER.test(v.trim()));
      if (d.length) { dang++; hits.push({ id: e.id, title: e.title, at: d.map(([k, v]) => `${k}: …${v.trim().slice(-10)}`).join(" | ") }); }
    }
    rows.push({ key, n: arr.length, dang, nop, hits });
  }
}
console.log("分片   条数  真截断  仅省略句末标点");
for (const r of rows) console.log(`  ${r.key.padEnd(6)} ${String(r.n).padStart(3)}  ${String(r.dang).padStart(4)}   ${String(r.nop).padStart(4)}${r.dang ? "   ←需修" : ""}`);
const T = rows.reduce((s, r) => s + r.dang, 0), P = rows.reduce((s, r) => s + r.nop, 0);
console.log(`\n合计：真截断 ${T} 条 / 省略句末标点 ${P} 条`);
if (SAMP) for (const r of rows) if (r.hits.length) { console.log(`\n[${r.key}]`); r.hits.slice(0, 8).forEach((h) => console.log(`   ${h.id} ${h.title}\n     ${h.at}`)); }
