/* style-samples.mjs | 按分片抽样打印 title/summary，供人工判断文体（文言/白话）
 * 用法: node tools/style-samples.mjs wd/wd-04.js wd/wd-05.js ...
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);
const n = Number(process.env.N || 6);

for (const rel of files) {
  const p = path.join(ROOT, "data", rel);
  global.window = {};
  new Function("window", fs.readFileSync(p, "utf8"))(global.window);
  const arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0] || [];
  console.log(`\n===== ${rel}  (n=${arr.length}) =====`);
  const step = Math.max(1, Math.floor(arr.length / n));
  for (let i = 0; i < arr.length && i / step < n; i += step) {
    const e = arr[i];
    console.log(`  ${e.year} | ${e.title} | ${e.summary}`);
    const b = (e.detail && e.detail.background) || "";
    if (b) console.log(`      背景: ${b.slice(0, 90)}`);
  }
}
