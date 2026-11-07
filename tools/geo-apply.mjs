/* geo-apply.mjs | 由 gazetteer + 语料生成 data/geo/event-places.js（事件地理叠加层）
 * 用法: node tools/geo-apply.mjs            # dry-run，只报改动面
 *       node tools/geo-apply.mjs --write    # 落盘
 *
 * 为什么叠加层是生成物而不是手写清单：4910 条逐条手填 placeKey 一定烂尾，
 * 而且改了 detail.place 忘了改叠加层时，两边会各说一套。现在叠加层只有一条来源
 * （tools/geo-places.tbl + 语料 detail.place），validate-geo 会重算一遍并与盘上比对，
 * 不一致就判红——「忘重生成」从静默漂移变成一道红门。
 *
 * 不改 data/cn|wd 任何分片：地理是叠加，不是原 schema 的一部分。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadCorpus, loadPlaces, buildMapping, renderOverlay } from "./geo-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "geo", "event-places.js");
const WRITE = process.argv.includes("--write");

const corpus = loadCorpus();
const places = loadPlaces();
if (!places.list.length) {
  console.error("✗ gazetteer 为空：先跑 node tools/gen-places.mjs");
  process.exit(1);
}
const mapping = buildMapping(corpus, places);
const ids = new Set(corpus.map((e) => e.id));

const out = renderOverlay(mapping);

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
const same = prev === out;
const prevCount = (prev.match(/":\s*\{p:/g) || []).length;

console.log(`语料 ${corpus.length} 条 · 命中 ${mapping.size} 条 (${(mapping.size / corpus.length * 100).toFixed(1)}%)`);
console.log(`盘上已有 ${prevCount} 条 → 重算 ${mapping.size} 条`);
for (const [id, m] of mapping) if (!ids.has(id)) { console.error(`✗ 映射指向不存在的条目 ${id}`); process.exit(1); }

if (same) { console.log("✅ 叠加层已与表+语料一致，无需重写"); process.exit(0); }
if (!WRITE) {
  console.log("dry-run：内容有差异。加 --write 落盘。");
  process.exit(2);
}
/* 原子写：半截文件会让站点静默少一整层数据，比红门难查得多。 */
const tmp = OUT + ".tmp";
fs.writeFileSync(tmp, out, "utf8");
fs.renameSync(tmp, OUT);
console.log(`已写入 ${path.relative(ROOT, OUT)}：${mapping.size} 条`);
