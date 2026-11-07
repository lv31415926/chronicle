/* validate-geo.mjs | 地理层数据门（硬性错误必须为 0）
 * 用法: node tools/validate-geo.mjs [--json]
 *
 * 这一层为什么要有自己的门：地理是叠加层，语料 schema 看不见它。
 * 一个指向不存在条目的行迹站、一个越界的坐标、一个改了 detail.place 却忘了重生成的
 * 叠加层，都不会让 validate.mjs 变红——它们只会让地图静默画错。
 *
 * 检查码：
 *   PLACE_SCHEMA     gazetteer 字段缺失／kind 越枚举／坐标越界／keys 空
 *   PLACE_DUPKEY     同一命中词挂在两个地点下（最长命中会随机选一个）
 *   PLACE_NOSRC      地点没有 sources（地名识别必须给得出出处）
 *   OVERLAY_ORPHAN   叠加层指向不存在的条目 id
 *   OVERLAY_BADPLACE 叠加层指向不存在的 placeKey
 *   OVERLAY_SYNC     叠加层与「表+语料」重算结果不一致（改了数据忘了重生成）
 *   OVERLAY_TIER     叠加层里出现 tier/verified/confidence/weight 等自封字段
 *   JOURNEY_SCHEMA   行迹缺字段／站数不足／年份乱序／span 不覆盖
 *   JOURNEY_EV       行迹站点指向不存在的事件 id
 *   JOURNEY_PLACE    行迹站点指向不存在的地点
 *   JOURNEY_NOSRC    行迹站点既无 ev 又无 src（凭印象的一站）
 *   SNAP_SCHEMA      大势快照缺 source/license/events
 *   SNAP_EVENT       快照挂的事件 id 不存在
 *   COVERAGE_FLOOR   w4-5 地理覆盖率跌破下限（地图首屏会空）
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, loadPlaces, buildMapping, renderOverlay, coverage, useRoot, getRoot } from "./geo-lib.mjs";

const rootArgI = process.argv.indexOf("--root");
if (rootArgI > 0) useRoot(process.argv[rootArgI + 1]);
/* 只有一个根：geo-lib 读语料/地名表用哪个目录，本门读叠加层/行迹/快照就必须读同一个。
 * 两个根各走各的后果实测过——夹具地名表配上真实叠加层，报出 8380 条与夹具无关的红，
 * 那种红比没有红更坏：它让每条断言都「通过」，却什么都没测。 */
const ROOT = getRoot();
const errs = [], warns = [];
const bad = (code, msg) => errs.push(`${code} ${msg}`);
const KINDS = ["capital", "city", "pass", "battle", "site", "work", "region", "foreign", "port"];
const DIRS = new Set(["nw", "ne", "se", "sw", "n", "s", "e", "w", "c"]);
const TIER_FIELDS = ["tier", "prov", "provenance", "verified", "certified", "confidence", "badge", "sourceTier", "weight"];

/* 数据文件是 window.__X = [...] 形态（file:// 硬约束），与浏览器注入同构。 */
function evalInto(sandbox, src, name) {
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: name });
}

const corpus = loadCorpus();
const places = loadPlaces();
const ids = new Set(corpus.map((e) => e.id));

/* ===== ① gazetteer ===== */
if (!places.list.length) bad("PLACE_SCHEMA", "data/geo/places.js 为空或缺失：先跑 node tools/gen-places.mjs");
const owner = new Map();
places.list.forEach((p) => {
  if (!p.key) bad("PLACE_SCHEMA", "有无 key 的地点条目");
  if (KINDS.indexOf(p.kind) < 0) bad("PLACE_SCHEMA", `${p.key}: kind=${p.kind} 越枚举`);
  if (!Array.isArray(p.keys) || !p.keys.length) bad("PLACE_SCHEMA", `${p.key}: keys 空，永不命中`);
  if (!Array.isArray(p.coord) || p.coord.length !== 2) bad("PLACE_SCHEMA", `${p.key}: coord 不是 [lng,lat]`);
  else {
    const [lng, lat] = p.coord;
    if (!Number.isFinite(+lng) || !Number.isFinite(+lat)) bad("PLACE_SCHEMA", `${p.key}: coord 非数 ${p.coord}`);
    else if (+lng < -180 || +lng > 180 || +lat < -90 || +lat > 90) bad("PLACE_SCHEMA", `${p.key}: coord 越界 ${p.coord}`);
  }
  if (!p.modern) bad("PLACE_SCHEMA", `${p.key}: 缺今地`);
  if (!p.zh) bad("PLACE_SCHEMA", `${p.key}: 缺本名`);
  if (!Array.isArray(p.sources) || !p.sources.length) bad("PLACE_NOSRC", `${p.key}: 没有 sources`);
  (p.keys || []).forEach((k) => {
    if (owner.has(k) && owner.get(k) !== p.key) bad("PLACE_DUPKEY", `「${k}」同时属于 ${owner.get(k)} 与 ${p.key}`);
    else owner.set(k, p.key);
  });
});

/* ===== ② 叠加层 ===== */
const overlayPath = "data/geo/event-places.js";
if (!fs.existsSync(path.join(ROOT, overlayPath))) {
  bad("OVERLAY_SYNC", "data/geo/event-places.js 不存在：跑 node tools/geo-apply.mjs --write");
} else {
  const src = fs.readFileSync(path.join(ROOT, overlayPath), "utf8");
  const sb = { window: {} }; sb.window = sb;
  try { evalInto(sb, src, "event-places.js"); } catch (e) { bad("OVERLAY_SYNC", `叠加层求值失败：${e.message}`); }
  const map = sb.__CHRONICLE_EVENT_PLACES || {};
  const keys = Object.keys(map);
  if (!keys.length) bad("OVERLAY_SYNC", "叠加层为空对象（一条都没映射）");
  keys.forEach((id) => {
    if (!ids.has(id)) bad("OVERLAY_ORPHAN", `叠加层指向不存在的条目 ${id}`);
    const m = map[id] || {};
    if (!places.byKey.has(m.p)) bad("OVERLAY_BADPLACE", `${id} → ${m.p}：placeKey 不存在`);
    if (m.d && !DIRS.has(m.d)) bad("OVERLAY_BADPLACE", `${id}: 方位码 ${m.d} 越枚举`);
    TIER_FIELDS.forEach((f) => { if (f in m) bad("OVERLAY_TIER", `${id} 带自封字段 ${f}（等级与权重不由地理层决定）`); });
  });
  /* SYNC：重算一遍并与盘上逐字比。改了 detail.place 或改了地名表而忘了重生成，
   * 红在这里，而不是等到读者发现某条「今西安」的条目不在西安。 */
  const expect = renderOverlay(buildMapping(corpus, places));
  if (expect !== src) {
    const nExpect = (expect.match(/":\s*\{p:/g) || []).length;
    bad("OVERLAY_SYNC", `叠加层与「表+语料」重算结果不一致（重算 ${nExpect} 条 / 盘上 ${keys.length} 条）：跑 node tools/geo-apply.mjs --write`);
  }
}

/* ===== ③ 行迹 ===== */
const jPath = path.join(ROOT, "data", "geo", "journeys.js");
if (fs.existsSync(jPath)) {
  const sb = { window: {} }; sb.window = sb;
  try { evalInto(sb, fs.readFileSync(jPath, "utf8"), "journeys.js"); } catch (e) { bad("JOURNEY_SCHEMA", `journeys.js 求值失败：${e.message}`); }
  const js = sb.__CHRONICLE_JOURNEYS || [];
  if (!Array.isArray(js) || !js.length) warns.push("JOURNEY_SCHEMA journeys.js 里没有行迹");
  js.forEach((j) => {
    if (!j.key || !j.zh || !j.person) bad("JOURNEY_SCHEMA", `行迹缺 key/zh/person：${JSON.stringify(j.key || j)}`);
    if (!Array.isArray(j.sources) || !j.sources.length) bad("JOURNEY_SCHEMA", `${j.key}: 行迹整体没有 sources`);
    const st = j.stops || [];
    if (st.length < 4) bad("JOURNEY_SCHEMA", `${j.key}: 只有 ${st.length} 站（少于 4 站谈不上「行迹」）`);
    for (let i = 1; i < st.length; i++) {
      if (st[i].year < st[i - 1].year) bad("JOURNEY_SCHEMA", `${j.key}: 第 ${i + 1} 站 ${st[i].year} 早于第 ${i} 站 ${st[i - 1].year}（行迹不是乱序清单）`);
    }
    if (Array.isArray(j.span)) {
      const ys = st.map((s) => s.year);
      if (Math.min(...ys) < j.span[0] || Math.max(...ys) > j.span[1])
        bad("JOURNEY_SCHEMA", `${j.key}: span [${j.span}] 不覆盖站点 [${Math.min(...ys)},${Math.max(...ys)}]`);
    } else bad("JOURNEY_SCHEMA", `${j.key}: 缺 span`);
    st.forEach((s, i) => {
      const at = `${j.key} 第 ${i + 1} 站`;
      if (!places.byKey.has(s.place)) bad("JOURNEY_PLACE", `${at}: place=${s.place} 不在 gazetteer`);
      if (s.ev && !ids.has(s.ev)) bad("JOURNEY_EV", `${at}: ev=${s.ev} 不存在`);
      if (!s.ev && !(Array.isArray(s.src) && s.src.length)) bad("JOURNEY_NOSRC", `${at}: 既无 ev 又无 src——凭印象的一站`);
      if (!s.title) bad("JOURNEY_SCHEMA", `${at}: 缺 title`);
    });
  });
}

/* ===== ④ 大势快照（有则必查） ===== */
const sPath = path.join(ROOT, "data", "geo", "snapshots.js");
if (fs.existsSync(sPath)) {
  const sb = { window: {} }; sb.window = sb;
  try { evalInto(sb, fs.readFileSync(sPath, "utf8"), "snapshots.js"); } catch (e) { bad("SNAP_SCHEMA", `snapshots.js 求值失败：${e.message}`); }
  const sn = sb.__CHRONICLE_SNAPSHOTS || [];
  sn.forEach((s) => {
    if (!s.key || !Number.isFinite(s.year)) bad("SNAP_SCHEMA", `快照缺 key/year：${JSON.stringify(s.key)}`);
    if (!s.source) bad("SNAP_SCHEMA", `${s.key}: 缺 source（大势示意也得写明依据）`);
    if (!s.license) bad("SNAP_SCHEMA", `${s.key}: 缺 license（几何数据必须逐项登记许可）`);
    (s.events || []).forEach((id) => { if (!ids.has(id)) bad("SNAP_EVENT", `${s.key}: 挂在不存在的条目 ${id}`); });
    (s.blobs || []).forEach((b, i) => {
      if (!Array.isArray(b.ring) || b.ring.length < 4) bad("SNAP_SCHEMA", `${s.key} blob#${i}: ring 少于 4 点，画不出闭合面`);
      const first = b.ring && b.ring[0], last = b.ring && b.ring[b.ring.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) bad("SNAP_SCHEMA", `${s.key} blob#${i}: ring 未闭合（首尾点不同）`);
    });
  });
}

/* ===== ⑤ 覆盖率地板 ===== */
const cov = coverage(corpus, buildMapping(corpus, places));
const pct = ([a, b]) => (b ? a / b : 0);
if (pct(cov.w45) < 0.6) bad("COVERAGE_FLOOR", `w4-5 地理覆盖率 ${(pct(cov.w45) * 100).toFixed(1)}% < 60%（地图首屏会空）`);
if (pct(cov.all) < 0.5) warns.push(`COVERAGE 全量覆盖率 ${(pct(cov.all) * 100).toFixed(1)}%`);

/* ===== 报告 ===== */
const stats = {
  places: places.list.length, coverage: cov, errors: errs.length, warnings: warns.length
};
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ pass: !errs.length, stats, errors: errs, warnings: warns }, null, 2));
} else {
  console.log(`地理层门 · gazetteer ${stats.places} 条 · 覆盖 全量 ${cov.all.join("/")} = ${(pct(cov.all) * 100).toFixed(1)}% · w4-5 ${cov.w45.join("/")} = ${(pct(cov.w45) * 100).toFixed(1)}%`);
  warns.forEach((w) => console.log("  ~ " + w));
  if (errs.length) {
    console.log(`\n✗ ${errs.length} 项硬性错误：`);
    errs.slice(0, 30).forEach((e) => console.log("  " + e));
    if (errs.length > 30) console.log(`  …另 ${errs.length - 30} 项`);
    process.exit(1);
  }
  console.log("\n✅ 地理层全部通过");
}

