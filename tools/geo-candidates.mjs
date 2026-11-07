/* geo-candidates.mjs | 地理覆盖候选器（只读，一条数据都不写）
 * 用法: node tools/geo-candidates.mjs [--json] [--top 40]
 *
 * 它回答三个问题：现在覆盖多少、没覆盖的地名里哪几个最肥、哪些条目重要但没地理。
 * 补 gazetteer 的顺序由条数决定，不由印象决定。
 */
import { loadCorpus, loadPlaces, buildMapping, unmatchedTokens, coverage } from "./geo-lib.mjs";

const asJson = process.argv.includes("--json");
const topI = process.argv.indexOf("--top");
const TOP = topI > 0 ? Number(process.argv[topI + 1]) || 40 : 40;

const corpus = loadCorpus();
const places = loadPlaces();
const mapping = buildMapping(corpus, places);
const cov = coverage(corpus, mapping);
const miss = unmatchedTokens(corpus, places);

const pct = ([a, b]) => (b ? ((a / b) * 100).toFixed(1) + "%" : "n/a");
const byPlace = new Map();
for (const [, m] of mapping) byPlace.set(m.place, (byPlace.get(m.place) || 0) + 1);

if (asJson) {
  console.log(JSON.stringify({
    events: corpus.length, places: places.list.length,
    coverage: cov, perPlace: [...byPlace.entries()].sort((a, b) => b[1] - a[1]),
    unmatched: miss.slice(0, TOP),
  }, null, 2));
} else {
  console.log(`语料 ${corpus.length} 条 · gazetteer ${places.list.length} 条`);
  console.log(`覆盖  全量 ${cov.all.join("/")} = ${pct(cov.all)}`);
  console.log(`      w4-5 ${cov.w45.join("/")} = ${pct(cov.w45)}   ← 地图首屏主要靠这批`);
  console.log(`      中国 ${cov.cn.join("/")} = ${pct(cov.cn)} · 世界 ${cov.world.join("/")} = ${pct(cov.world)}`);
  console.log(`命中地点 ${byPlace.size} 个 · 未命中的「今X」写法 ${miss.length} 种`);
  console.log(`\n最肥的未覆盖地名（补表按这个顺序）：`);
  miss.slice(0, TOP).forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}  ${t}`));
  console.log(`\n当前覆盖最多的地点：`);
  [...byPlace.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
}
