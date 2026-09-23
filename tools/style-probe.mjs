/* style-probe.mjs | 抽样每个分片的 summary，量化文体（文言/白话）与标点风格差异
 * 用法: node tools/style-probe.mjs
 * 背景: wd-04 的编写代理自报「沿用既有浅文言+「」写法，与 wd-03/wd-05 白话不同」，需实证核查。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["cn", "wd"].flatMap((d) =>
  fs.readdirSync(path.join(ROOT, "data", d)).filter((f) => f.endsWith(".js")).sort().map((f) => `${d}/${f}`));

/* 文言标记：单字动词/虚词密度；白话标记：了/的/是/在 等虚词 */
const CLASSICAL = /[氏於為焉矣皆其之乃亦嘗未於]|之戰|之亂|之役|即位|稱制|元年|下詔|薨|崩|誅|伐|奔|敗|克/;
const CLASSICAL_SIMPLE = /[之战|之乱|之役|即位|称制|元年|下诏|薨|崩|诛|伐|奔|败|克]/;
const VERNACULAR = /(了|的|是|在|被|把|从|对于|已经|进行)/g;

for (const rel of files) {
  const p = path.join(ROOT, "data", rel);
  global.window = {};
  try {
    new Function("window", fs.readFileSync(p, "utf8"))(global.window);
  } catch (e) { console.log(`${rel.padEnd(14)} SKIP(syntax)`); continue; }
  const arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0] || [];
  if (!arr.length) { console.log(`${rel.padEnd(14)} SKIP(empty)`); continue; }
  let cl = 0, quot = 0, vs = 0, vl = 0;
  for (const e of arr) {
    const s = String(e.summary || "") + String(e.title || "");
    if (CLASSICAL.test(s) || CLASSICAL_SIMPLE.test(s)) cl++;
    if (/[「」]/.test(s)) quot++;
    const m = s.match(VERNACULAR); vs += m ? m.length : 0; vl += s.length;
  }
  console.log(`${rel.padEnd(14)} n=${String(arr.length).padStart(4)}  文言标记=${(cl / arr.length * 100).toFixed(0)}%  「」=${(quot / arr.length * 100).toFixed(0)}%  白话虚词密度=${(vs / vl * 100).toFixed(1)}/百字  均摘要长=${(arr.reduce((a, e) => a + String(e.summary || "").length, 0) / arr.length).toFixed(0)}`);
}
