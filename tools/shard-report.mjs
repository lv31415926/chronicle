/* shard-report.mjs | 每个分片的条数/年份跨度/50年桶疏密/体积，用于判断代理中断后还缺哪段
 * 用法: node tools/shard-report.mjs [分片文件名 ...]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argFiles = process.argv.slice(2);
const files = argFiles.length
  ? argFiles
  : ["cn", "wd"].flatMap((d) =>
      fs.readdirSync(path.join(ROOT, "data", d)).filter((f) => f.endsWith(".js")).sort().map((f) => `${d}/${f}`));

for (const rel of files) {
  const p = path.join(ROOT, "data", rel);
  global.window = {};
  let arr;
  try {
    new Function("window", fs.readFileSync(p, "utf8"))(global.window);
    arr = Object.values(global.window.__CHRONICLE_CHUNK || {})[0] || [];
  } catch (e) {
    console.log(`${rel.padEnd(14)} SYNTAX_FAIL  ${e.message}`);
    continue;
  }
  const ys = arr.map((e) => e.year).filter((y) => Number.isFinite(y));
  const id = rel.match(/(\w\w-\d\d)\.js/)[1];
  const size = Math.round(fs.statSync(p).size / 1024);
  if (!ys.length) { console.log(`${rel.padEnd(14)} n=0  size=${size}KB`); continue; }
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const buckets = {};
  for (const y of ys) { const k = Math.floor(y / 50) * 50; buckets[k] = (buckets[k] || 0) + 1; }
  const dens = Object.keys(buckets).map(Number).sort((a, b) => a - b)
    .map((k) => `${k}:${buckets[k]}`).join(" ");
  console.log(`${rel.padEnd(14)} n=${String(arr.length).padStart(4)}  span=${lo}..${hi}  size=${size}KB  id=${id}`);
  console.log(`  ${dens}`);
}
