/* test-geo.mjs | validate-geo 的可红性自审：给每道门注入一处定向变异，要求它变红并点名
 * 用法: node tools/test-geo.mjs
 *
 * 为什么新门必须先过这一关（项目既有规矩，见 tools/test-gates.mjs 头部）：
 * 一道永远不变红的门，输出与「检查通过」完全同形，比没有门更糟——它让人以为查过。
 * 地理层的门尤其危险：叠加层与语料脱钩、行迹挂错条目、快照没登记许可，
 * 全都只让地图画错，不会让任何解析报错。
 *
 * 夹具是合成语料（不读 data/cn 真实分片）：判据要在 6 条数据上被精确打中，
 * 真实语料里那些「碰巧没踩到」的条目只会让「红」变得不可解释。
 * 变异改结构化对象、只在最后序列化一次——用正则改字符串文件，剥错一层前缀
 * 就会让「注入失败」冒充「门变红」（本轮实测踩过一次）。
 *
 * 已知且可接受的共同触发：指向不存在条目的叠加层，按定义也≠重算结果，
 * 所以 OVERLAY_ORPHAN/BADPLACE/TIER 三条用例会同时报 OVERLAY_SYNC。
 * 断言只看「目标码在不在」，不假装它孤红。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import * as geoLibNs from "./geo-lib.mjs";
const { buildMapping, renderOverlay } = geoLibNs;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) { if (cond) pass++; else { fail++; failures.push("✗ " + name); } }

/* ================= 合成夹具 ================= */
function ev(id, track, year, weight, place, title) {
  return { id, track, year, weight, dim: "politics", title,
    summary: "夹具", detail: { background: "", process: "", impact: "", figures: [], place,
      state: "夹具", sources: ["《夹具书》"], tags: ["夹具"] }, related: [] };
}
const BASE = () => ({
  events: [
    ev("cn--b221--p01", "cn", -221, 5, "秦都咸阳（今陕西西安西北）", "秦灭六国"),
    ev("cn--b100--x03", "cn", -100, 4, "北海上（今贝加尔湖）", "徙北海牧羝"),
    ev("cn--645--c01", "cn", 645, 4, "长安（今陕西西安）", "玄奘返京"),
    ev("cn--1057--c01", "cn", 1057, 3, "开封（今河南开封）", "嘉祐二年榜"),
    ev("world--1100--p01", "world", 1100, 5, "罗马（今意大利罗马）", "教权与王权"),
    ev("world--1453--p01", "world", 1453, 4, "君士坦丁堡（今土耳其伊斯坦布尔）", "东罗马亡"),
  ],
  places: [
    { key: "xian", zh: "长安", kind: "capital", modern: "陕西西安", coord: [108.94, 34.34], keys: ["西安", "长安", "咸阳"], note: "", sources: ["《汉书·地理志》"] },
    { key: "beikal", zh: "贝加尔湖", kind: "site", modern: "俄罗斯贝加尔湖", coord: [107.5, 54.0], keys: ["贝加尔湖", "北海"], note: "", sources: ["《汉书·李广苏建传》"] },
    { key: "rome", zh: "罗马", kind: "foreign", modern: "意大利罗马", coord: [12.5, 41.89], keys: ["罗马"], note: "", sources: ["剑桥古代史"] },
    { key: "cpl", zh: "君士坦丁堡", kind: "foreign", modern: "土耳其伊斯坦布尔", coord: [28.98, 41.01], keys: ["君士坦丁堡", "伊斯坦布尔"], note: "", sources: ["牛津拜占庭辞典"] },
  ],
  journeys: [{
    key: "jk", zh: "夹具行迹", person: "夹具人", span: [-221, 1453], color: "#000",
    sources: ["《夹具书》"],
    stops: [
      { year: -221, place: "xian", title: "起点", ev: "cn--b221--p01", src: ["《夹具书》"], desc: "d" },
      { year: -100, place: "beikal", title: "第二站", ev: "cn--b100--x03", src: ["《夹具书》"], desc: "d" },
      { year: 1100, place: "rome", title: "第三站", src: ["《夹具书》"], desc: "d" },
      { year: 1453, place: "cpl", title: "第四站", ev: "world--1453--p01", src: ["《夹具书》"], desc: "d" },
    ],
  }],
  snaps: [{
    key: "s_b221", year: -221, zh: "前221 大势", license: "作者自绘示意",
    source: "《史记·秦本纪》", note: "大势示意，非精确疆界",
    events: ["cn--b221--p01"],
    blobs: [{ polity: "秦", ring: [[106, 34], [109, 35], [109, 33], [106, 34]] }],
  }],
  overlayMap: null, overlayText: null,
});

const jsDump = (name, value) => `window.${name} = ${JSON.stringify(value, null, 1)};\n`;
const chunkDump = (id, list) =>
  `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\nwindow.__CHRONICLE_CHUNK[${JSON.stringify(id)}] = ${JSON.stringify(list, null, 1)};\n`;

/* 夹具 places 已是生产形态，补 keyIndex 用与 loadPlaces 完全相同的排序口径。 */
function asPlacesApi(list) {
  const byKey = new Map(list.map((p) => [p.key, p]));
  const keyIndex = [];
  for (const p of list) for (const k of p.keys || []) if (k && k.length >= 2) keyIndex.push({ k, key: p.key, region: p.kind === "region" ? 1 : 0 });
  keyIndex.sort((a, b) => b.k.length - a.k.length || a.region - b.region || a.k.localeCompare(b.k));
  return { version: 1, list, byKey, keyIndex };
}

function makeFixture(mutate) {
  const d = BASE();
  if (mutate) mutate(d);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chron-geo-"));
  fs.mkdirSync(path.join(dir, "data/cn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/wd"), { recursive: true });
  fs.mkdirSync(path.join(dir, "data/geo"), { recursive: true });
  const write = (rel, txt) => fs.writeFileSync(path.join(dir, rel), txt);
  write("data/cn/cn-01.js", chunkDump("cn-01", d.events.filter((e) => e.track === "cn")));
  write("data/wd/wd-01.js", chunkDump("wd-01", d.events.filter((e) => e.track === "world")));
  write("data/geo/places.js", jsDump("__CHRONICLE_PLACES", { version: 1, list: d.places }));
  write("data/geo/journeys.js", jsDump("__CHRONICLE_JOURNEYS", d.journeys));
  write("data/geo/snapshots.js", jsDump("__CHRONICLE_SNAPSHOTS", d.snaps));
  /* 叠加层默认用生产口径现算（geo-lib 是唯一实现，夹具不另写匹配器）。 */
  const overlay = d.overlayText != null ? d.overlayText
    : renderOverlay(d.overlayMap != null ? d.overlayMap
      : buildMapping(d.events, asPlacesApi(d.places)));
  write("data/geo/event-places.js", overlay);
  return dir;
}

function runValidate(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-geo.mjs"), "--root", dir],
    { encoding: "utf8" });
  return { rc: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
/* 每条变异都要「红 + 点名」才算数：只要求非零退出，门会为任何原因红，
 * 判据本身写错了也测不出来。 */
function mustRed(name, code, mutate) {
  const dir = makeFixture(mutate);
  const { rc, out } = runValidate(dir);
  ok(rc === 1 && out.includes(code), `${name} → 变红并点名 ${code}`);
  if (!(rc === 1 && out.includes(code))) failures.push("    实得 rc=" + rc + " ｜ " + out.split("\n").slice(0, 5).join(" | "));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------- ⓪ 正控制：夹具基线必须绿 ---------- */
{
  const dir = makeFixture(null);
  const { rc, out } = runValidate(dir);
  ok(rc === 0, `基线夹具判绿（rc=${rc}；这里红说明夹具本身不合法，下面每条「红」都不知是被谁打红的）\n${out}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---------- ① 注入器自审 ---------- */
{
  const dir = makeFixture(null);
  const read = (p) => fs.readFileSync(path.join(dir, p), "utf8");
  ok(/__CHRONICLE_PLACES/.test(read("data/geo/places.js")), "夹具 places.js 挂的是 validate-geo 要读的那个全局名");
  ok(/__CHRONICLE_EVENT_PLACES/.test(read("data/geo/event-places.js")), "夹具叠加层挂对全局名");
  ok(/__CHRONICLE_JOURNEYS/.test(read("data/geo/journeys.js")), "夹具行迹挂对全局名");
  ok(/__CHRONICLE_SNAPSHOTS/.test(read("data/geo/snapshots.js")), "夹具快照挂对全局名");
  ok(/__CHRONICLE_CHUNK/.test(read("data/cn/cn-01.js")), "夹具分片挂对全局名");
  fs.rmSync(dir, { recursive: true, force: true });
  /* 反向自审：地名表残缺时门必须红——否则上面五条只是在读自己写的字符串。 */
  const d2 = makeFixture((x) => { x.places = x.places.slice(0, 1); x.journeys = []; x.snaps = []; });
  const r2 = runValidate(d2);
  ok(r2.rc === 1 && /COVERAGE_FLOOR/.test(r2.out), "地名表残缺时门变红（证明门真在读这份数据，不是读空气）");
  fs.rmSync(d2, { recursive: true, force: true });
}

/* ---------- ② gazetteer 门 ---------- */
mustRed("kind 越枚举", "PLACE_SCHEMA", (d) => { d.places[0].kind = "capitalcity"; });
mustRed("坐标越界", "PLACE_SCHEMA", (d) => { d.places[0].coord = [999, 34.34]; });
mustRed("keys 为空", "PLACE_SCHEMA", (d) => { d.places[0].keys = []; });
mustRed("缺今地", "PLACE_SCHEMA", (d) => { d.places[0].modern = ""; });
mustRed("缺 sources", "PLACE_NOSRC", (d) => { d.places[0].sources = []; });
mustRed("同一命中词挂两处", "PLACE_DUPKEY", (d) => { d.places[1].keys = d.places[1].keys.concat(["西安"]); });

/* ---------- ③ 叠加层门 ---------- */
mustRed("叠加层指向不存在的条目", "OVERLAY_ORPHAN", (d) => {
  d.overlayMap = new Map([["cn--b221--p99", { place: "xian" }]]);
});
mustRed("叠加层指向不存在的地点", "OVERLAY_BADPLACE", (d) => {
  d.overlayMap = new Map([["cn--b221--p01", { place: "changanchu" }]]);
});
mustRed("方位码越枚举", "OVERLAY_BADPLACE", (d) => {
  d.overlayMap = new Map([["cn--b221--p01", { place: "xian", dir: "northwest" }]]);
});
mustRed("叠加层夹带自封等级/权重字段", "OVERLAY_TIER", (d) => {
  d.overlayText = 'window.__CHRONICLE_EVENT_PLACES = {\n  "cn--b221--p01": {p:"xian",tier:"已核",weight:5}\n};\n';
});
mustRed("改了语料 detail.place 却忘了重生成叠加层", "OVERLAY_SYNC", (d) => {
  /* 盘上留著「按旧语料算出来」的那份叠加层，再把语料里一条的今地名改成
   * 夹具表里根本没有的洛阳：数据本身完全合法（validate.mjs 不会红），
   * 只有叠加层落后一条——这正是 SYNC 门存在的理由。
   * 注意：这里不能顺手把那条滤掉，滤掉就恰好等于重算结果，门会判绿（实测踩过）。 */
  d.overlayMap = buildMapping(BASE().events, asPlacesApi(BASE().places));
  d.events[0].detail.place = "洛阳东（今河南洛阳）";
});

/* ---------- ④ 行迹门 ---------- */
mustRed("行迹站点地点不存在", "JOURNEY_PLACE", (d) => { d.journeys[0].stops[1].place = "beijialhu"; });
mustRed("行迹站点事件不存在", "JOURNEY_EV", (d) => { d.journeys[0].stops[0].ev = "cn--b221--p77"; });
mustRed("行迹站点既无 id 又无出处", "JOURNEY_NOSRC", (d) => { d.journeys[0].stops[2].src = []; });
mustRed("行迹年份乱序", "JOURNEY_SCHEMA", (d) => { d.journeys[0].stops[3].year = 900; });
mustRed("行迹 span 不覆盖站点", "JOURNEY_SCHEMA", (d) => { d.journeys[0].span = [-221, 1000]; });
mustRed("行迹不足 4 站", "JOURNEY_SCHEMA", (d) => { d.journeys[0].stops = d.journeys[0].stops.slice(0, 3); });
mustRed("行迹整体没有 sources", "JOURNEY_SCHEMA", (d) => { delete d.journeys[0].sources; });

/* ---------- ⑤ 快照门 ---------- */
mustRed("快照缺 license", "SNAP_SCHEMA", (d) => { delete d.snaps[0].license; });
mustRed("快照缺 source", "SNAP_SCHEMA", (d) => { delete d.snaps[0].source; });
mustRed("快照面环未闭合", "SNAP_SCHEMA", (d) => { d.snaps[0].blobs[0].ring = [[106, 34], [109, 35], [109, 33], [107, 33]]; });
mustRed("快照挂在不存在的事件上", "SNAP_EVENT", (d) => { d.snaps[0].events = ["cn--b221--p42"]; });

/* ---------- ⑥ 覆盖率地板：证明它按 w4-5 算，不按全量算 ---------- */
mustRed("w4-5 覆盖率跌破地板", "COVERAGE_FLOOR", (d) => {
  /* 只留罗马：世界线 2 条（w5+w4）仍命中，中国线 3 条 w4/w5 全丢
   * ⇒ w4-5 = 2/4 = 50% < 60% 地板；全量 = 1/6 = 16.7% 也低，
   * 但判据取的是 w4-5 那一条，见 validate-geo 的 COVERAGE_FLOOR。 */
  d.places = [d.places[2]];
  d.journeys = []; d.snaps = [];
});

/* ---------- ⑦ 生产语料实测（夹具绿不代表真表绿） ---------- */
{
  const { rc, out } = runValidate(ROOT);
  ok(rc === 0, `真实语料 + 真实地名表判绿\n${out.split("\n").slice(0, 3).join("\n")}`);
  const m = /w4-5 (\d+)\/(\d+) = ([\d.]+)%/.exec(out);
  ok(!!m, "能从输出里取到 w4-5 覆盖率（地板判据的文案与数值同源）");
  if (m) ok(Number(m[3]) >= 60, `真实语料 w4-5 覆盖率 ${m[3]}% ≥ 60% 地板`);
}

/* ---------- ⑧ 真实叠加层与真实表逐字一致 ---------- */
{
  const { useRoot, loadCorpus, loadPlaces } = geoLibNs;
  useRoot(null);
  const src = fs.readFileSync(path.join(ROOT, "data/geo/event-places.js"), "utf8");
  const expect = renderOverlay(buildMapping(loadCorpus(), loadPlaces()));
  ok(src === expect, "盘上叠加层 = 真实表 + 真实语料的重算结果（逐字）");
}

console.log(`\n地理层门自审：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) { console.log(failures.join("\n")); process.exitCode = 1; }
else console.log("✅ 每道地理门都被定向打红过一次，且真实语料判绿");
