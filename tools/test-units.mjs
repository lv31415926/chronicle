/* test-units.mjs | 纯函数单元测试：time / lod / axis / state 归一化
 *
 * 用法: node tools/test-units.mjs
 * 这些模块是浏览器 IIFE（挂到 window），故用 window 垫片逐个求值后取全局。
 * 覆盖的是「错了会产出假编年史」的部分：无 0 年换算、bin 对齐、锚点缩放不跳飞。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import os from "os";
import { isCorrupt } from "./corrupt-patterns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadOrder = [
  "data/meta.js", "data/reign.js", "data/themes.js",
  "js/time.js", "js/axis.js", "js/lod.js", "js/state.js",
  "js/palette.js", "js/prov.js", "js/flow.js",
  "js/contribute.js",
];

global.window = {
  addEventListener() {}, removeEventListener() {},
  dispatchEvent() {},
  document: {
    documentElement: { setAttribute() {}, getAttribute() { return null; }, style: {} },
    createElement() { return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {} },
  },
};
global.document = global.window.document;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.CustomEvent = function (t, o) { Object.assign(this, o || {}); this.type = t; };

/* contribute.js 只用到 ChronLoader.eventById（取投稿目标的现有出处），真实 loader 要靠
 * document.head 注入 <script>，垫片里没必要也没有能力演它。桩会不会替被改名的真导出挡驾，
 * 由「contribute.js 用到的每个 L.x 都在 loader.js 导出块里」那条源码断言钉住（#40 门禁块）。 */
const CONTRIB_FIXTURES = [
  { id: "fx--with-source", track: "cn", year: -221, dim: "politics", weight: 5,
    title: "夹具·秦并天下", summary: "用于投稿门禁", related: [],
    detail: { place: "咸阳", sources: ["《史记》卷六·秦始皇本纪"] } },
  { id: "fx--no-source", track: "world", year: 1969, dim: "science", weight: 4,
    title: "夹具·某次登月", summary: "用于投稿门禁", related: [], detail: {} },
];
global.window.ChronLoader = {
  eventById: (id) => CONTRIB_FIXTURES.find((e) => e.id === id) || null,
};

for (const rel of loadOrder) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  try {
    new Function("window", "document", "localStorage", "CustomEvent", src)(
      global.window, global.document, global.localStorage, global.CustomEvent);
  } catch (e) {
    console.error(`✗ 模块加载失败 ${rel}: ${e.message}`);
    process.exit(1);
  }
}

const T = window.ChronTime, L = window.ChronLOD, A = window.ChronAxis, S = window.ChronState;
const FL = window.ChronFlow, PAL = window.ChronPalette;
const M = window.__CHRONICLE_META;

let pass = 0, fail = 0;
const failures = [];
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) pass++;
  else { fail++; failures.push(`✗ ${name}\n     期望 ${b}\n     实得 ${a}`); }
}
function ok(cond, name) { eq(!!cond, true, name); }
function near(actual, expected, tol, name) {
  if (Math.abs(actual - expected) <= tol) pass++;
  else { fail++; failures.push(`✗ ${name}\n     期望 ${expected}±${tol}\n     实得 ${actual}`); }
}

/* ============ time.js：无公元 0 年 ============ */
eq(T.yearDistance(-1, 1), 1, "yearDistance 前1↔公元1 = 1 年");
eq(T.yearDistance(1, -1), 1, "yearDistance 反向对称");
eq(T.yearDistance(-3000, 2026), 5025, "yearDistance 全程 = 3000+2026-1");
eq(T.yearDistance(1900, 2000), 100, "yearDistance 纯公元");
eq(T.yearDistance(-100, -50), 50, "yearDistance 纯公元前");
eq(T.coordToYear(0), 1, "coordToYear(0) → 公元1（不存在 0 年）");
eq(T.coordToYear(-0.4), -1, "coordToYear(-0.4) → 前1");
eq(T.coordToYear(-0.6), -1, "coordToYear(-0.6) → 前1");
eq(T.formatYear(-636), "前636年", "formatYear 公元前");
eq(T.formatYear(1), "公元1年", "formatYear 公元1");
eq(T.formatYear(1949, { approx: true }), "~公元1949年", "formatYear 推定标记");

/* 世纪：前1–100 = 前1世纪；1–100 = 1世纪 */
eq(T.centuryOf(1), 1, "centuryOf(1) = 1 世纪");
eq(T.centuryOf(100), 1, "centuryOf(100) 属 1 世纪（不是 2）");
eq(T.centuryOf(101), 2, "centuryOf(101) = 2 世纪");
eq(T.centuryOf(-1), 1, "centuryOf(-1) = 前1 世纪");
eq(T.centuryOf(-100), 1, "centuryOf(-100) = 前1 世纪");
eq(T.centuryOf(-101), 2, "centuryOf(-101) = 前2 世纪");
eq(T.centuryOf(-221), 3, "centuryOf(-221) = 前3 世纪");
eq(T.centuryAbbrev(-221), "前3世纪", "centuryAbbrev 轴上紧凑标签");
eq(T.centuryAbbrev(1368), "14世纪", "centuryAbbrev 公元");
eq(T.formatCentury(1368), "第十四世纪", "formatCentury 中文数字序数");
eq(T.formatCentury(-221), "前第三世纪", "formatCentury 公元前中文序数");

/* 纪元/政权查表 */
ok(T.eraOf("cn", -221), "eraOf(cn, -221) 命中时代");
ok(T.eraOf("cn", 2026), "eraOf(cn, 2026) 命中时代（终点未漏）");
ok(T.eraOf("world", 2026), "eraOf(world, 2026) 命中时代");
eq(T.polityOf(-221).main && T.polityOf(-221).main.label, "秦", "polityOf(-221) = 秦（统一当年标新政权）");
eq(T.polityOf(9).main.label, "新莽", "polityOf(9) = 新莽（代汉当年切换）");
eq(T.polityOf(220).main.label, "三国", "polityOf(220) = 三国（东汉禅代当年切换）");
eq(T.polityOf(1000).main.label, "北宋", "polityOf(1000) 主系 = 北宋");
ok(T.polityOf(1000).coeval.some((p) => p.label === "辽"), "polityOf(1000) 辽入并立政权");
eq(T.polityOf(1949).main && T.polityOf(1949).main.label, "中华人民共和国", "polityOf(1949) 主系 = 中华人民共和国");
eq(T.minguoYear(1937), "民国26年", "minguoYear(1937)");
eq(T.minguoYear(1949), "民国38年", "minguoYear(1949) = 民国38年");
eq(T.minguoYear(1950), null, "minguoYear(1950) 已出民国区间");
eq(T.clampYear(99999), M.yearMax, "clampYear 上限");
eq(T.clampYear(-99999), M.yearMin, "clampYear 下限");

/* 刻度：不得产出 0 年 */
const tk = T.ticks(-50, 50, 10);
ok(!tk.includes(0), "ticks 跳过公元 0 年");
eq(tk, [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50], "ticks 步长对齐且跳过 0");
eq(T.ticks(1900, 2000, 100), [1900, 2000], "ticks 百年对齐");
ok(T.pickStep(0.01, 128) === 2000 || T.pickStep(0.01, 128) === T.pickStep(0.001, 128), "pickStep 极小 pxPerYear 落到最大步长");
eq(T.pickStep(100, 100), 1, "pickStep 高倍放大取 1 年步长");
eq(T.pickStep(2, 128), 100, "pickStep 2px/年 → 百年步长");

/* ============ lod.js：层级阈值与 bin 对齐 ============ */
eq(L.tierOf(0.05).id, "L5", "tierOf 0.05px/年 → L5 时代");
eq(L.tierOf(0.49).id, "L5", "tierOf 0.44 → 仍属 L5");
eq(L.tierOf(0.62).id, "L4", "tierOf 0.6 → L4 半世纪");
eq(L.tierOf(3).id, "L3", "tierOf 3 → L3 十年");
eq(L.tierOf(10).id, "L2", "tierOf 10 → L2 单年折叠");
eq(L.tierOf(60).id, "L1", "tierOf 60 → L1 单年全量");
eq(L.tierOf(0.5).id, "L4", "tierOf 阈值右开（0.45 → L4）");
/* 回归：默认全程视图在任何常见画布宽度下都必须落进 L5，否则时代带永不出现 */
for (const w of [600, 800, 1200, 1600, 2000])
  eq(L.tierOf(w / (M.yearMax - M.yearMin)).id, "L5", `全程视图 ${w}px 宽 → L5 时代带`);

eq(L.binStart(1, 10), 1, "binStart 公元1 (十年) = 1，不得回落到 前10");
eq(L.binStart(9, 10), 1, "binStart 公元9 落进 1–10 桶");
eq(L.binStart(10, 10), 1, "binStart 公元10 落进 1–10 桶");
eq(L.binStart(11, 10), 11, "binStart 公元11 → 11–20 桶");
eq(L.binStart(-1, 10), -10, "binStart 前1 → 前10–前1 桶");
eq(L.binStart(-10, 10), -10, "binStart 前10 → 同一桶");
eq(L.binStart(-11, 10), -20, "binStart 前11 → 前20–前11 桶");
eq(L.binStart(1949, 50), 1901, "binStart 1949 (50年) = 1901–1950 桶");
eq(L.binStart(1901, 50), 1901, "binStart 1901 边界自洽");
eq(L.binLabel(L.binStart(1, 10), 10), "1–10年", "binLabel 跨纪元不误标为公元前");
eq(L.binLabel(L.binStart(-1, 10), 10), "前10–前1年", "binLabel 公元前桶");
eq(L.binLabel(1949, 1), "1949年", "binLabel 单年");
eq(L.binLabel(-221, 1), "前221年", "binLabel 单年公元前");

/* 聚合：bin 内事件数守恒 + weight 取最大 + 折叠计数 */
function ev(id, track, year, dim, weight, title) {
  return { id, track, year, yearApprox: false, dim, weight, title, summary: title, detail: {}, related: [] };
}
const sample = [
  ev("cn--1--p01", "cn", 1, "politics", 5, "西汉初"),
  ev("cn--5--s01", "cn", 5, "science", 2, "某发明"),
  ev("cn--15--m01", "cn", 15, "military", 4, "某战"),
  ev("cn--20--m02", "cn", 20, "military", 3, "某战乙"),
  ev("world--3--c01", "world", 3, "culture", 5, "某学说"),
];
const agg3 = L.aggregate(sample, L.tierOf(3), 3);            /* L3 十年 */
eq(agg3.reduce((n, b) => n + b.count, 0), sample.length, "L3 聚合不丢事件");
const b1 = agg3.find((b) => b.start === 1);
eq(b1 && b1.count, 2, "L3：cn 的公元1/5 同落 1–10 桶");
eq(b1 && b1.weight, 5, "L3：bin weight 取桶内最大值");
eq(agg3.find((b) => b.start === 11).count, 2, "L3：15/20 落 11–20 桶");
eq(agg3.filter((b) => b.track === "world").length, 1, "L3：cn 与 world 分桶不混");
const agg1 = L.aggregate(sample, L.tierOf(60), 60);         // L1 单年全量
eq(agg1.filter((b) => b.kind === "bin").length, 5, "L1：每个有事件的年份一桶");
const agg2 = L.aggregate([ev("cn--1949--p01", "cn", 1949, "politics", 5, "A"),
                          ev("cn--1949--s01", "cn", 1949, "science", 1, "B"),
                          ev("cn--1949--s02", "cn", 1949, "science", 2, "C")],
                         L.tierOf(10), 10);                   /* L2 折叠 */
const y49 = agg2[0];
eq(y49.singles.length, 1, "L2：仅 weight≥4 展开为 singles");
eq(y49.folded.length, 2, "L2：其余进入 folded");
eq(y49.foldLabel, "+2", "L2：折叠标签计数正确");
eq(L.aggregate([], L.tierOf(3), 3).length, 0, "aggregate 空输入返回空");

/* L5 走时代带路径：组标签必须取 era.label */
const agg5 = L.aggregate([ev("cn--221--p01", "cn", -221, "politics", 5, "秦灭齐"),
                          ev("cn--202--p01", "cn", -202, "politics", 5, "汉兴")],
                         L.tierOf(0.2), 0.2);
eq(agg5.every((g) => g.kind === "era"), true, "L5 聚合产出 era 组");
eq(agg5.every((g) => typeof g.label === "string" && g.label && g.label !== "undefined"), true,
  "L5 组标签取到 era.label（不得为 undefined）");
eq(agg5.reduce((n, g) => n + g.count, 0), 2, "L5 聚合不丢事件");

/* ============ axis.js：锚点缩放不得把锚点甩出屏幕 ============ */
const vp = new A.Viewport(1000, -3000, 2026);
near(vp.x(1949), (1949 + 3000) / 5026 * 1000, 1e-6, "Viewport.x 线性映射");
near(vp.yearAt(vp.x(618)), 618, 1e-9, "yearAt 是 x 的逆运算");
for (const anchor of [-2500, -841, 0.5, 1, 618, 1949, 2020]) {
  const z = vp.zoomed(0.35, anchor).constrained(0);
  near(z.x(anchor) / z.w, vp.x(anchor) / vp.w, 0.02, `缩放保持锚点屏幕比例 y=${anchor}`);
}
const zz = vp.zoomed(0.35, 1368).zoomed(0.35, 1368).zoomed(3, 1368);
near(zz.x(1368) / zz.w, vp.x(1368) / vp.w, 0.05, "三连缩放后锚点仍在原位");
eq(zz.span >= 12, true, "缩放下限 span 受 clamp（≥12 年）");
ok(vp.zoomed(0.0001, 1949).span >= 12, "zoomed 不会缩到 0 宽");
ok(vp.zoomed(1e6, 1949).span <= (M.yearMax - M.yearMin) * 1.12 + 1, "zoomed 不超过全程×1.12");
const tr = vp.translated(100);
eq([tr.from, tr.to], [-2900, 2126], "translated 平移两端");
const c = new A.Viewport(1000, -3200, 2026).constrained(0);
eq([c.from, c.to], [-3000, 2026], "constrained 把越界视窗推回合法域");
const c2 = new A.Viewport(1000, -3100, -2000).constrained(0);
eq(c2.from, M.yearMin, "constrained 左越界钳到 yearMin");
eq(c2.to - c2.from, 1100, "constrained 保持 span");

const plan = A.tickPlan(vp, 1000);
ok(!plan.majors.includes(0), "tickPlan 主刻度不含 0 年");
eq(A.eraSegments(M.cnEras, 1900, 2000).length >= 1, true, "eraSegments 命中 1900–2000");
eq(A.eraSegments(M.cnEras, 3000, 3100).length, 0, "eraSegments 区间外返回空");
const dens = A.densityBins(sample, 20);
eq(dens.counts.reduce((a, b) => a + b, 0), sample.length, "densityBins 计数守恒");
eq(dens.max >= 1, true, "densityBins max 至少为 1（避免除零）");

/* ============ state.js：视图归一化与筛选 ============ */
S.restore();
S.setView(-3, 2);
ok(S.get().view.to - S.get().view.from >= 12, "setView 过窄视窗被归一化到最小 span");
S.setView(3000, 4000);
ok(S.get().view.from <= M.yearMax, "setView 越界视窗被钳回合法域");
S.setView(1900, 2000);
eq(S.get().view, { from: 1900, to: 2000 }, "合法视窗不被 normalizeView 改动");
S.allDims(true);
eq(S.visibleDims().length, M.dimOrder.length, "allDims(true) 恢复全维度");
S.soloDim("science");
eq(S.visibleDims(), ["science"], "soloDim 独显一个维度");
S.allDims(true);
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1000 }), true, "passesFilter 放行");
S.toggleDim("science");
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1000 }), false, "toggleDim 关闭后拦截");
S.toggleDim("science");
S.allDims(true);
S.patch({ weightFloor: 4 });
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1000 }), false, "weightFloor 拦截低权重");
S.patch({ weightFloor: 1 });

/* 手写年份解析：区间输入框的入口 */
eq(T.parseYear("前636"), -636, "parseYear 接受「前636」");
eq(T.parseYear("公元前636"), -636, "parseYear 接受「公元前636」");
eq(T.parseYear("-636"), -636, "parseYear 接受「-636」");
eq(T.parseYear("636BC"), -636, "parseYear 接受后置 BC");
eq(T.parseYear("636年"), 636, "parseYear 接受「636年」");
eq(T.parseYear("公元636"), 636, "parseYear「公元」不带前＝AD，不可误判为公元前");
eq(T.parseYear("公元1368"), 1368, "parseYear 公元年为正");
eq(T.parseYear("  前 636 年 "), -636, "parseYear 忽略空格");
eq(T.parseYear("2026"), 2026, "parseYear 纯数字");
eq(T.parseYear("0"), null, "parseYear 拒绝公元 0 年");
eq(T.parseYear("abc"), null, "parseYear 拒绝非数字");
eq(T.parseYear(""), null, "parseYear 拒绝空串");
eq(T.parseYear(null), null, "parseYear 拒绝 null");
eq(T.parseYear("12345"), null, "parseYear 拒绝超 4 位");
ok(T.parseYear("前3001") !== null, "parseYear 不做值域钳制（交给 setRange）");

/* 往返律：输入框会被 yearToText 回显重写，回显结果必须原样读得回来。
 * 这条正是实测抓到的缺陷——回显写「前636」而解析读不回，用户的编辑静默失效。 */
let rtBad = [], nanBad = [];
for (let y = M.yearMin; y <= M.yearMax; y++) {
  if (y === 0) continue;                       /* 无公元 0 年 */
  const txt = T.formatYearShort(y);
  if (T.parseYear(txt) !== y) rtBad.push(y + "→" + txt);
  const n = T.parseYear(txt);
  if (Number.isFinite(n) === false || n === 0) nanBad.push(y + "→" + txt);
}
eq(rtBad.length, 0, "往返律：全程 " + (M.yearMax - M.yearMin) + " 个年份的「回显→再解析」恒等" +
  (rtBad.length ? "（首例如 " + rtBad[0] + "）" : ""));
eq(nanBad.length, 0, "往返结果永不为 NaN/0");

/* 区间筛选：与维度/重要度同级的一条硬条件，缺 year 一律不放行 */
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3 }), false, "无 year 的事件不放行（区间条件不可跳过）");
S.setRange(1840, 1949);
eq(S.get().range, { from: 1840, to: 1949 }, "setRange 写入区间");
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1911 }), true, "区间内放行");
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1800 }), false, "区间外拦截");
eq(S.inRange(1949), true, "inRange 含右端点");
eq(S.inRange(1950), false, "inRange 右端点外为假");
eq(S.get().view, { from: 1900, to: 2000 }, "setRange 不改动视野");
S.patch({ view: { from: -3000, to: 2026 } });
eq([S.get().range.from, S.get().range.to], [1840, 1949], "改视野不改动区间");
eq(S.setRange(1949, 1840), { from: 1840, to: 1949 }, "setRange 交换倒置区间");
eq(S.setRange(-99999, 99999), { from: M.yearMin, to: M.yearMax }, "setRange 钳到数据全域");
var rangeBefore = S.get().range;
eq(S.setRange("abc", 1900), rangeBefore, "非数字输入不改区间");
eq(S.get().range, rangeBefore, "非数字输入未写入状态");
eq(S.setRange(1911, 1911), { from: 1911, to: 1911 }, "from==to 的单年区间合法");
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1911 }), true, "单年区间放行当年事件");
eq(S.passesFilter({ track: "cn", dim: "science", weight: 3, year: 1912 }), false, "单年区间拦截次年事件");
S.setRange(1840, 1949);
S.patch({ range: { from: 1960, to: 1980 } });
eq(S.get().range, { from: 1960, to: 1980 }, "patch 写区间");
S.setRange(M.yearMin, M.yearMax);
eq(S.get().range, { from: M.yearMin, to: M.yearMax }, "区间复位全程");

S.patch({ tracks: { cn: true, world: true } });
S.toggleTrack("world");
eq(S.get().tracks.world, false, "toggleTrack 关闭一轨");
S.toggleTrack("world");
eq(S.get().tracks.world, true, "toggleTrack 复原");
S.soloTrack("cn");
eq([S.get().tracks.cn, S.get().tracks.world], [true, false], "soloTrack 独显中国");
S.soloTrack("cn");
eq([S.get().tracks.cn, S.get().tracks.world], [true, true], "soloTrack 再点恢复双线");
S.soloTrack("world");
S.toggleTrack("world");   // 关掉唯一亮着的轨 → 必须被拒绝
eq(S.get().tracks.world, true, "toggleTrack 拒绝关闭最后一条轨");

/* ============ 元数据自洽 ============ */
eq(M.yearMin, -3000, "meta.yearMin");
eq(M.yearMax, 2026, "meta.yearMax");
eq(Object.keys(M.dimensions).length, 10, "meta 十个维度");
eq(M.dimOrder.length, 10, "dimOrder 与维度表同数");
eq(M.dimOrder.every((d) => !!M.dimensions[d]), true, "dimOrder 每项都能在维度表取到");
eq(Object.values(M.dimensions).every((d) => d.label && d.color && d.shape), true, "每维度有 label/color/shape");
const shapes = new Set(Object.values(M.dimensions).map((d) => d.shape));
eq(shapes.size, 10, "十个维度形状互不相同（色盲可辨）");
for (const [tr, list] of [["cn", M.cnEras], ["world", M.worldEras]]) {
  eq(list.every((e) => e.from <= e.to), true, `${tr}Eras 区间合法`);
  eq(list.every((e) => e.from >= M.yearMin && e.to <= M.yearMax), true, `${tr}Eras 落在总跨度内`);
  /* 时代带刻意重叠（三国/两晋、宋/元、清/近代），因此不变量是「无空洞」而非「不重叠」 */
  const merged = [];
  for (const e of [...list].sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last && e.from <= last.to + 1) last.to = Math.max(last.to, e.to);
    else merged.push({ from: e.from, to: e.to });
  }
  eq(merged.length, 1, `${tr}Eras 并集连续无空洞`);
  eq([merged[0].from, merged[0].to], [M.yearMin, M.yearMax], `${tr}Eras 并集覆盖全跨度`);
}

/* ============ themes.js：关键词可命中真实事件 ============ */
const TH = (window.__CHRONICLE_THEMES || []).filter((t) => Array.isArray(t.keywords) && t.keywords.length);
eq(TH.length > 0, true, "主题表非空");
eq(TH.every((t) => t.keywords.every((k) => String(k).trim() === String(k) && String(k).trim())), true,
  "主题关键词无空串/无首尾空格（曾混入 ' artillery'）");
eq(new Set(TH.map((t) => t.id)).size, TH.length, "主题 id 唯一");
eq(TH.every((t) => t.from < t.to), true, "主题时间区间合法");

/* ============ flow.js：水层的密度包络、可复现粒子场与静止/流动门 ============ */
(function () {
  /* 令牌是手写进两套主题的，漏一套就会画 undefined 色（Canvas 静默忽略 ⇒ 水层凭空消失） */
  ["dark", "light"].forEach(function (th) {
    var d = PAL.all()[th].flowDust;
    eq(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0?\.\d+\s*\)$/.test(d), true,
       `${th} 主题 flowDust 是合法 rgba（缺令牌不会报错，只会让河消失）`);
  });

  var LW = { plotX: 16, plotW: 800, H: 600, mid: 300, lanes: [
    { track: "cn", base: 200, dir: -1, top: 60, bottom: 204 },
    { track: "world", base: 400, dir: 1, top: 396, bottom: 540 }
  ] };
  var vp = { from: 1, to: 2026, x: function (y) { return (y - 1) / 2025 * 800; } };
  var both = { tracks: { cn: true, world: true } };
  var evsAt = function (years) { return years.map(function (y) { return { year: y, dim: "politics" }; }); };

  var d0 = FL.densityOf([], LW, vp);
  eq(d0.length, 96, "densityOf 输出 96 桶");
  eq(Array.prototype.every.call(d0, function (v) { return v === 0; }), true, "空事件 → 包络全 0（无 NaN）");

  /* 落点桶必须由与实现相同的映射算出，不能凭想象写 90/5 —— 平滑只跨 ±1 桶，
   * 挑错下标会得到「0 > 0 恒假」这种假红（实测踩过）。 */
  var bucketOf = function (y) { return Math.min(95, Math.floor(vp.x(y) / 800 * 96)); };
  var dR = FL.densityOf(evsAt(Array(40).fill(1800)), LW, vp);
  var dL = FL.densityOf(evsAt(Array(40).fill(200)), LW, vp);
  var hotR = bucketOf(1800), coldR = 95 - hotR, hotL = bucketOf(200), coldL = 95 - hotL;
  ok(dR[hotR] > dR[coldR], `事件密集于 ${1800} 年 → 其所在桶 ${hotR} 高于对称空桶 ${coldR}`);
  ok(dL[hotL] > dL[coldL], `同一批事件移到 200 年 → 包络随之翻到桶 ${hotL}（密度真的跟着数据走）`);
  eq(dR.some(function (v) { return !Number.isFinite(v); }), false, "归一化后无 NaN");
  eq(Math.max.apply(null, Array.from(dR)), 1, "包络按最大值归一，峰值恒为 1");

  var dOut = FL.densityOf(evsAt([-500, 3000, 1000]), LW, vp);
  eq(dOut.some(function (v) { return v > 0; }), true, "越界年份之外的合法年份仍计入");
  eq(dOut[95], 0, "视野外的年份不得污染末桶（3000 年映射到桶 96 之外）");

  /* 记录型 ctx：把水层真正画到哪儿记下来，才有资格断言「静止」与「在流」 */
  function mockCtx() {
    var c = { calls: [], rects: [], arcs: [], fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1 };
    ["save", "restore", "beginPath", "rect", "clip", "moveTo", "lineTo", "stroke", "closePath", "fill"].forEach(function (k) {
      c[k] = function () { c.calls.push(k); };
    });
    c.fillRect = function (x, y, w, h) { c.calls.push("fillRect"); c.rects.push([x, y, w, h]); };
    c.arc = function (x, y, r) { c.calls.push("arc"); c.arcs.push([x, y, r]); };
    c.createLinearGradient = function () { c.calls.push("grad"); return { addColorStop: function () {} }; };
    return c;
  }
  var finite = function (rows) {
    return rows.every(function (r) { return r.every(function (v) { return Number.isFinite(v) && v >= 0; }); });
  };
  var env = function (now, freeze, st) {
    return { layout: LW, vp: vp, pal: PAL.get(), st: st || both, evs: evsAt([500, 1000, 1500, 1900]), now: now, freeze: freeze };
  };

  var c1 = mockCtx(); FL.draw(c1, env(1000, true));
  var painted1 = c1.rects.length;
  ok(painted1 > 50, `水层确实画出了东西（记录到 ${painted1} 次 fillRect，而非空 mock 假通过）`);
  eq(finite(c1.rects.concat(c1.arcs)), true, "水层所有落点坐标有限且非负");

  /* 河道几何：叠加模式两轨基线只隔 8px，必须合流成一条以 mid 为中心的中脊河，
   * 水沫同时溅到中线上下（中国向上、世界向下）；分栏模式各走自己基线外侧。 */
  var dots = function (c) { return c.rects.filter(function (r) { return r[2] < 3; }); };
  LW.mode = "overlay";
  var ov = mockCtx(); FL.draw(ov, env(1200, true));
  var od = dots(ov).map(function (r) { return r[1]; });
  /* 死区 ±5 必须大于粒子自身波动幅度（p.amp ≤ .5+1.9），否则单侧河道靠晃动
   * 就能蹭过中线凑数（注入 dirs:[1] 实测正是这样逃过 y<300 计数的）。 */
  var above = od.filter(function (y) { return y < 295; }).length,
      below = od.filter(function (y) { return y > 305; }).length;
  ok(above >= od.length * .2 && below >= od.length * .2,
     `叠加：水沫分居中线上下且各占两成以上（上 ${above} / 下 ${below} / 共 ${od.length}）`);
  ok(od.every(function (y) { return Math.abs(y - 300) <= 70; }),
     "叠加：粒子不溢出河道影响半径（mid±70），不漫进时代带与坐标轴");
  var near = od.filter(function (y) { return Math.abs(y - 300) <= 36; }).length;
  ok(near / od.length >= .6, `叠加：贴水密、远处疏——${(near / od.length * 100).toFixed(0)}% 的粒子聚在 mid±36`);

  LW.mode = "split";
  var sp = mockCtx(); FL.draw(sp, env(1300, true));
  var sd = dots(sp).map(function (r) { return r[1]; });
  ok(sd.every(function (y) { return y < 201 || y > 399; }),
     "分栏：两簇各自整体停在本轨基线外侧（cn<201 / world>399），没有一个粒子跨轨");
  ok(sd.some(function (y) { return y < 201; }) && sd.some(function (y) { return y > 399; }),
     "分栏：两条河都真的画出了粒子");
  LW.mode = "overlay";

  var a = mockCtx(), b = mockCtx();
  FL.draw(a, env(2000, true));
  var uFrozen = FL.parts.map(function (p) { return p.u; });
  FL.draw(b, env(9000, true));
  eq(JSON.stringify(a.rects) === JSON.stringify(b.rects), true,
     "freeze=true：隔 7 秒两帧逐字节相同（减弱动效下是真的静水，不是慢一点）");
  eq(FL.parts.map(function (p) { return p.u; }), uFrozen, "freeze=true：7 秒内没有任何粒子前进过");

  var f1 = mockCtx(), f2 = mockCtx();
  FL.draw(f1, env(10000, false));
  var u0 = FL.parts.map(function (p) { return p.u; });
  /* 实现把 dt 钳在 50ms（切页签回来的保护），单帧最多推进 0.0025 行程；
   * 要量出「顺流而下」必须连推若干帧，期望位移 = sp × 0.6s ≈ 0.009~0.030。 */
  for (var k = 1; k <= 20; k++) FL.draw(f2, env(10000 + k * 30, false));
  var u1 = FL.parts.map(function (p) { return p.u; });
  eq(JSON.stringify(f1.rects) === JSON.stringify(f2.rects), false,
     "freeze=false 且时间前移 → 画面必须变化（否则整条河从未流动）");
  /* 光看像素不够：只有波光在震荡、粒子原地不动的「假流」也能让它变化。
   * 所以直接量 u——每个粒子都必须沿时间方向前进（回绕 +1 修正）。 */
  var drifted = u1.every(function (v, i) { var d = v - u0[i]; if (d < 0) d += 1; return d > 0.005 && d < 0.05; });
  eq(drifted, true, "0.6 秒内每个粒子都顺流前进 0.5%~5% 行程（回绕已修正）");
  eq(u1.every(function (v) { return v >= 0 && v < 1; }), true, "粒子行程恒在 [0,1)（回绕而非溢出）");

  /* 两轨全关是 state.js 挡住的不达状态；但 chs[lane % chs.length] 在那里会除零，
   * 所以给它一道闸。包进 try：守卫视失效时要报「这条断言红」，而不是整轮崩退。 */
  var z = mockCtx(), zErr = null;
  try { FL.draw(z, env(11000, false, { tracks: { cn: false, world: false } })); }
  catch (e) { zErr = e.message; }
  eq(zErr, null, "无可见轨道时 draw 不抛错（除零守卫生效）");
  eq(z.rects.length, 0, "无可见轨道时不画任何像素");
  eq(z.calls.length, 0, "无可见轨道时连 save/clip 都不发起");
})();

/* ============ 水层的河色与两层新笔法（波光 / 流星） ============ */
/* 2026-09-22 提的要求是「颜色贴近主题、隐隐的波光粼粼、光子带流星感」。
 * 这类改动既不崩溃也不产坏数据，唯一可行的验收是把「贴主题」翻译成可量的东西：
 * 河面色带必须由双轨本色 + 一道金脊构成；闪点必须大部分时间是暗的；
 * 新两层的落笔不得混进既有的「粒子几何」统计；两套主题都得真的画出像素
 * （令牌少配一套时 Canvas 收到 undefined 只会不画，不报任何错）。 */
(function () {
  var src = fs.readFileSync(path.join(ROOT, "js/flow.js"), "utf8");

  /* ① 令牌完备：flow.js 里每个 pal.<tok> 都要在两套主题都有合法值 */
  var toks = Array.from(new Set((src.match(/\bpal\.[A-Za-z]\w+/g) || [])
    .concat(src.match(/PL\.get\(\)\.[A-Za-z]\w+/g) || [])
    .map(function (s) { return s.slice(s.lastIndexOf(".") + 1); })));
  ok(toks.length >= 6, `flow.js 用到 ≥6 个调色令牌（实得 ${toks.length}：抓不到=正则在空转）`);
  toks.forEach(function (t) {
    ["dark", "light"].forEach(function (th) {
      var v = PAL.all()[th][t];
      eq(v === undefined, false, `${th} 主题配了 flow.js 用到的令牌 ${t}`);
      eq(typeof v === "number" ? Number.isFinite(v) && v > 0
        : /^#[0-9a-fA-F]{3,8}$/.test(String(v)) || /^rgba?\([\d.,\s]+\)$/.test(String(v)), true,
        `${th} 主题的 ${t} 是合法颜色或正系数（拿到 undefined 只会静默不画）`);
    });
  });

  /* ①′ 可见性：令牌存在 ≠ 看得见。宣纸上的纸白闪点对底 ΔL 只有 +14，
   * 语法合法、画了上千笔，屏幕上却一片空白——只有量对比度才抓得住这类缺陷。 */
  var rgbOfTok = function (v) {
    var s = String(v).trim();
    if (s.charAt(0) === "#") {
      var h = s.slice(1);
      if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
      return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
    }
    var m = s.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : null;
  };
  var lumaOf = function (v) {
    var c = rgbOfTok(v);
    return c && c.length === 3 && c.every(Number.isFinite)
      ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : null;
  };
  ["dark", "light"].forEach(function (th) {
    var p = PAL.all()[th], bgL = lumaOf(p.bg);
    ["spark", "meteorHead", "selectGlow"].forEach(function (t) {
      var cL = lumaOf(p[t]);
      if (cL === null || bgL === null) {
        ok(false, `${th} 主题的 ${t} 量不出亮度（令牌缺失或不是颜色值：${p[t]}）`);
        return;
      }
      var d = Math.round(cL - bgL);
      ok(Math.abs(d) >= 60, `${th} 主题的 ${t} 对底色看得见（实测 ΔL=${d}，纸/墨上低于 60 的色差肉眼无感）`);
    });
  });

  var LWp = {
    plotX: 16, plotW: 800, H: 600, mid: 300, mode: "overlay", lanes: [
      { track: "cn", base: 200, dir: -1, top: 60, bottom: 204 },
      { track: "world", base: 400, dir: 1, top: 396, bottom: 540 }
    ]
  };
  var vpP = { from: 1, to: 2026, x: function (y) { return (y - 1) / 2025 * 800; } };
  var bothP = { tracks: { cn: true, world: true } };
  var evsP = [500, 900, 1400, 1800, 1900].map(function (y) { return { year: y, dim: "politics" }; });
  var envP = function (now, freeze) {
    return { layout: LWp, vp: vpP, pal: PAL.get(), st: bothP, evs: evsP, now: now, freeze: freeze };
  };

  /* 记色版的 mock：光记几何不足以判断「贴近主题」，笔色与渐变色标都要留下 */
  function mockPaint() {
    var c = { rects: [], arcs: [], grads: [], paints: [], calls: [], fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1 };
    ["save", "restore", "beginPath", "rect", "clip", "moveTo", "lineTo", "stroke", "closePath", "fill"].forEach(function (k) {
      c[k] = function () { c.calls.push(k); };
    });
    c.fillRect = function (x, y, w, h) {
      var r = [x, y, w, h];
      c.rects.push(r); c.paints.push({ r: r, col: String(c.fillStyle), a: Number(c.globalAlpha) });
    };
    c.arc = function (x, y, r) { c.calls.push("arc"); c.arcs.push([x, y, r]); };
    c.createLinearGradient = function () {
      var st = []; c.grads.push(st);
      return { addColorStop: function (p, col) { st.push([p, String(col)]); } };
    };
    return c;
  }
  var rgbOf = function (hex) { return PAL.alpha(hex, 1).replace(/,\s*1\)$/, ""); };

  /* ② 河色三元组：上朱砂 / 中脊金 / 下石青，且色标必须递增（乱序会被整条渐变忽略） */
  var cw = mockPaint();
  FL.draw(cw, envP(1000, true));
  eq(cw.grads.length > 0, true, "叠加模式确实建了水面渐变（0 条=这一层从未画过）");
  var stops = cw.grads[0];
  var colAt = function (hex) { return stops.filter(function (s) { return s[1].indexOf(rgbOf(hex)) === 0; }).map(function (s) { return s[0]; }); };
  ok(colAt(M.tracks.cn.color).length > 0, `河面含中国轨本色 朱砂 ${M.tracks.cn.color}`);
  ok(colAt(M.tracks.world.color).length > 0, `河面含世界轨本色 石青 ${M.tracks.world.color}`);
  ok(colAt(PAL.get().selectGlow).length > 0, "河面含一道金脊");
  const cnStops = colAt(M.tracks.cn.color);
  ok(cnStops.length > 0 && cnStops.every(function (p) { return p < .5; }), "朱砂只铺在中线以上（中国轨在上）");
  const wdStops = colAt(M.tracks.world.color);
  ok(wdStops.length > 0 && wdStops.every(function (p) { return p > .5; }), "石青只铺在中线以下（世界轨在下）");
  eq(stops.every(function (s, i) { return i === 0 || stops[i - 1][0] <= s[0]; }), true,
     "色标由河心向外单调排布（写反不报错，只会让河心与水汽的明暗对调）");

  /* ③ 两套主题都要真的落笔，且笔色里没有 undefined/NaN */
  ["dark", "light"].forEach(function (th) {
    PAL.set(th);
    var c = mockPaint();
    FL.draw(c, envP(1000, true));
    ok(c.rects.length > 50, `${th}：水层画了 ${c.rects.length} 个色块（缺令牌时静默到一块不剩）`);
    eq(c.paints.some(function (p) { return /undefined|NaN/.test(p.col) || !Number.isFinite(p.a) || p.a < 0 || p.a > 1; }), false,
       `${th}：每一笔都有合法颜色与 0~1 的透明度`);
  });
  PAL.set("dark");
  var pal = PAL.get();

  /* ④ 波光层：只亮一小撮、都在水面影响半径内、笔宽足够大到不被当成粒子 */
  var g0 = mockPaint();
  FL.draw(g0, envP(1000, true));
  var GLINT_H = .9;   /* 与 flow.js 的笔高耦合：反光是 1px，闪点是 .9px，靠这个分家 */
  var gl = g0.paints.filter(function (p) { return p.r[3] === GLINT_H; });
  ok(FL.glints.length > 0, "闪点表非空（空表会让下面整段闪烁判据真空通过）");
  ok(gl.length > 0, `静水一帧确有 ${gl.length} 个闪点亮起（0 个=波光层从未画过）`);
  ok(gl.length < FL.glints.length, `波光只是「隐隐」：${gl.length}/${FL.glints.length} 个闪点亮着，全亮就成了死白斑`);
  ok(gl.every(function (p) { return p.r[2] >= 3; }), "每个闪点 ≥3px 宽（否则会被粒子落点统计吞掉）");
  ok(gl.every(function (p) { return Math.abs(p.r[1] - LWp.mid) <= 70; }), "闪点都贴在水面影响半径内，不漫进时代带");

  /* ⑤ 流星层：生成得到、画得出、尾迹不进粒子统计，且不与反光叠在同一颗上 */
  var met = FL.parts.filter(function (p) { return p.meteor; });
  var refl = FL.parts.filter(function (p) { return p.glint; });
  ok(met.length >= 3, `同一批里有 ${met.length} 颗流星（<3 颗多半是阈值写错，整层消失也不会报错）`);
  ok(refl.length >= 3, `另有 ${refl.length} 颗反光光子（两种笔法都得有样本）`);
  eq(FL.parts.some(function (p) { return p.meteor && p.glint; }), false,
     "同一颗光子不会又当反光又当流星（两种笔法叠在同一像素上只会糊）");
  var tails = g0.paints.filter(function (p) { return p.col === String(pal.meteorTail); });
  ok(tails.length > 0, `流星尾迹落了 ${tails.length} 笔`);
  ok(tails.every(function (p) { return p.r[2] >= 3.4; }), "尾迹每段 ≥3.4px 宽（<3 会被当成粒子落点）");
  var dustOnly = g0.rects.filter(function (r) { return r[2] < 3; });
  ok(dustOnly.length > 20, `统计到 ${dustOnly.length} 个「宽度<3」的落点（0 个=这条判据在空转）`);
  ok(dustOnly.every(function (r) { return r[2] === r[3]; }),
     "宽度<3 的落点全是正方形=只有尘：波光与流星两层都没混进粒子几何统计");

  /* ⑥ 闪烁本身要由纯函数量：连推帧会把 u 漂移一起量进来，测不到「闪」 */
  var sharpSum = 0, badAlpha = 0, flat = 0, N = 360;
  FL.glints.forEach(function (s) {
    var hi = -1, lo = 2;
    for (var i = 0; i < N; i++) {
      var a = FL.glintAlpha(s, i / N * Math.PI * 2, 1);
      if (!(a >= 0 && a <= 1)) badAlpha++;
      if (a > hi) hi = a;
      if (a < lo) lo = a;
    }
    var litN = 0;
    for (var j = 0; j < N; j++) if (FL.glintAlpha(s, j / N * Math.PI * 2, 1) > hi / 2) litN++;
    sharpSum += litN / N;
    if (!(hi > lo)) flat++;
  });
  eq(badAlpha, 0, "闪点亮度恒在 0~1（越界会把整条河洗白或画不出来）");
  eq(flat, 0, "每个闪点都真的有明暗起伏（恒定值=一层静止的白点）");
  ok(sharpSum / FL.glints.length < .35,
     `闪点平均只在 ${(sharpSum / FL.glints.length * 100).toFixed(0)}% 的相位上亮到半峰以上（三次方没生效就不叫「粼」）`);
  var dryMax = Math.max.apply(null, FL.glints.map(function (s) {
    var m = 0;
    for (var i = 0; i < N; i++) m = Math.max(m, FL.glintAlpha(s, i / N * Math.PI * 2, 0));
    return m;
  }));
  var wetMax = Math.max.apply(null, FL.glints.map(function (s) {
    var m = 0;
    for (var i = 0; i < N; i++) m = Math.max(m, FL.glintAlpha(s, i / N * Math.PI * 2, 1));
    return m;
  }));
  ok(wetMax > dryMax * 3, `有史处最亮 ${wetMax.toFixed(2)} 远过无史处 ${dryMax.toFixed(2)}（波光必须随史实密度涨落）`);

  /* ⑦ 可复现：同宽两次逐字段一致，换宽必换一批 */
  /* 签名只取前 40 个：两个宽度的字段总数本就不同，取全长会让「换宽必换一批」
   * 被截断白送一次，量不到 rebuild 按宽度重播种这件事本身。 */
  function sigAt(w) {
    FL.rebuild(w);
    return JSON.stringify(FL.parts.slice(0, 40).map(function (p) { return [p.u, p.v, p.sp, p.r, p.tail, !!p.meteor, !!p.glint]; })) +
      JSON.stringify(FL.glints.slice(0, 40).map(function (g) { return [g.u, g.len, g.off, g.fr]; }));
  }
  var s1 = sigAt(800);
  eq(sigAt(800), s1, "同宽度重建两次 → 粒子场与闪点场逐字段一致（刷新页面水纹不会跳）");
  ok(sigAt(811) !== s1, "换宽度必换一批（与宽度无关=写死的常量表，缩放时水纹会整体平移）");
  FL.rebuild(800); FL.reset();
})();

/* ============ 启动遮罩：撤它的手必须是人，不是定时器 ============ */
/* 2026-09-22 把「到点自动淡出」改成「读完请进」。这条门守四处咬合：
 * 按钮在 HTML 里、app.js 真读了它（有按钮无人接=装饰）、done 只由点击路径加上、
 * CSS 对 JS 加的每个状态类都有响应规则。匹配前先剥注释——
 * 注释里写过的「自动撤遮罩」会被读成代码事实（该类假绿/假红都踩过）。 */
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appRaw = strip(fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8"));
  const arm = appRaw.slice(appRaw.indexOf("function armEnter"), appRaw.indexOf("function boot("));
  ok(appRaw.indexOf("function armEnter") > -1 && arm.length > 100, "app.js 里有 armEnter（切不出片段=下面的判据全在空转）");
  ok(/id="boot-enter"/.test(html), "index.html 里有「进入长河」按钮：遮罩得有个入口");
  ok(/\$\("boot-enter"\)/.test(appRaw), "app.js 真的取了 #boot-enter（有按钮无人接=装饰）");
  eq((appRaw.match(/classList\.add\("done"\)/g) || []).length, 1,
     `全文件只有一处撤遮罩（实得 ${(appRaw.match(/classList\.add\("done"\)/g) || []).length} 处：多一处就还有一条自动路径）`);
  ok(/classList\.add\("done"\)/.test(arm), "唯一的撤遮罩就在 armEnter 里");
  const doneAt = arm.indexOf('classList.add("done")');
  ok(doneAt > -1 && arm.lastIndexOf("function enter(", doneAt) > -1
      && doneAt - arm.lastIndexOf("function enter(", doneAt) < 160,
     "唯一的撤遮罩就在点击回调 enter() 的头几行（既非定时器，也无别的路径）");
  ok(/contains\("fail"\)/.test(arm), "armEnter 不接管 fail 态（报错屏的出口是重载，不是入河）");
  ok(/add\("fail"\)/.test(appRaw) && /location\.reload/.test(appRaw), "失败态仍是点得动的出口");
  ok(/add\("ready"\)/.test(arm) && /add\("armed"\)/.test(arm) && /add\("show"\)/.test(arm),
     "ready / armed / show 三个状态类都由 JS 加（CSS 单方面等一个没人加的类=按钮永不浮现）");
  /* 浮现不能挂在 rAF 上：后台标签页永不回调，按钮会停在 opacity:0（实测踩过）。
   * 判据取「取消隐藏 → 加 show」这一段的代码事实，不抄行号：改动一处即失效。 */
  const showAt = arm.indexOf('classList.add("show")');
  const revealWin = arm.slice(arm.indexOf("hidden = false"), showAt);
  ok(showAt > -1 && revealWin.length > 0,
     "切得出「取消隐藏 → 加 show」片段（切不出=下面的判据全在空转）");
  ok(!/requestAnimationFrame|setTimeout/.test(revealWin),
     "show 不再回调里加（rAF 在后台标签页永不触发，进入按钮会永久不可见）");
  ok(/offsetWidth|offsetHeight|getComputedStyle/.test(revealWin),
     "加 show 前有一次同步重排读取：先让 hidden=false 落帧，淡入过渡才成立");
  const lay = strip(fs.readFileSync(path.join(ROOT, "css/layout.css"), "utf8"));
  ["#boot.ready", "#boot.armed", "#boot .enter", "#boot .enter.show"].forEach((sel) =>
    ok(lay.includes(sel), `layout.css 里有 ${sel} 规则（JS 加的类有人响应）`));
  /* 停留时长：本轮设问就是「再长一些」，那它到底多长必须能从代码里量出来 */
  const dwell = appRaw.match(/ENTER_REVEAL\s*=\s*reduceMotion\s*\?\s*(\d+)\s*:\s*(\d+)/);
  ok(!!dwell, "app.js 用 reduceMotion 三元式定停留时长（配了偏好却无人读=装饰）");
  if (dwell) {
    const slow = Number(dwell[1]), fast = Number(dwell[2]);
    ok(Number.isFinite(slow) && Number.isFinite(fast), `两个分支都是可算的毫秒数（实得 ${dwell[1]} / ${dwell[2]}）`);
    ok(slow < fast, `减动效偏好者等得更短（reduce ${slow}ms < 默认 ${fast}ms）`);
    ok(fast >= 2600, `默认停留 ${fast}ms ≥ 2600ms（改版前自动撤是 2150ms，本轮设问即「再长一些」）`);
    ok(slow >= 600, `减动效下仍留 ${slow}ms ≥ 600ms：引言得读得完，不能半句切走`);
    ok(/armEnter\(Math\.max\(0,\s*ENTER_REVEAL/.test(appRaw),
       "armEnter 的延时直接取自 ENTER_REVEAL（写死字面量则 reduce 分支落不了地）");
  }
}

/* ============ 编码腐蚀判据：必须能红，且不误伤真设问 ============ */
/* 判据若永不触发，validate 的 CORRUPT 门就是装饰（实测该类假绿发生过多次）。 */
const MUST_FIRE = [
  'process: "…联军自天津河？ ？ ？ ？ ？ ？ …"',      /* 全角连排（半角判据看不见） */
  'process: "…与天主教堂冲突? ？ ？ ？ ？ …"',
  'summary: "…海? ？ ？ ？ 各国? ？ ？ ？ …"',
  'process: "…入会者数百人? 数说不一；…"',             /* 单发半角：只有 MANGLED 抓得到 */
  'process: "a ?? b"',
];
const MUST_NOT_FIRE = [
  'process: "《公羊传》曰「税亩者何？履亩而税也」"',      /* 真设问，单发全角 */
  'process: "其辞曰「瓠子决兮将奈何？皓皓旰旰兮闿殚为河」"',
  'impact: "6月8日《人民日报》发表社论《这是为什么？》，运动方向自此改变"',
  'process: "「谢尔丹（撒丁？）海上民」',                /* 学界存疑标记 */
  'process: "凡百二十日而实未改元？在位二十七日"',
  'title: "Why? It works."',
  'process: "问：是何也？曰：无何也。"',
  'process: "《海国图志》成书于1842年。"',
];
for (const s of MUST_FIRE) eq(isCorrupt(s), true, `腐蚀判据必红：${s.slice(0, 18)}…`);
for (const s of MUST_NOT_FIRE) eq(isCorrupt(s), false, `真设问不误伤：${s.slice(0, 18)}…`);
eq(MUST_FIRE.length >= 5 && MUST_NOT_FIRE.length >= 8, true, "腐蚀判据样本集本身非空（空集会让上面两节真空通过）");

/* validate.mjs 必须用这一份判据，而非自带副本 —— 否则上面的自证与门是两套逻辑 */
const VAL_SRC = fs.readFileSync(path.join(ROOT, "tools/validate.mjs"), "utf8");
eq(/from "\.\/corrupt-patterns\.mjs"/.test(VAL_SRC), true, "validate.mjs 从共享模块导入腐蚀判据");
eq(/^const (MANGLED|QRUN)\s*=/m.test(VAL_SRC), false, "validate.mjs 内无第二份腐蚀判据定义（防漂移）");

/* 注入式自证红：拿真实 validate 跑一棵临时树，证明这道门「能红」且「能绿」。
 * 不断言当前数据集是否含腐蚀（那是数据问题，写进测试会变成永久的假红）。 */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chron-corrupt-"));
  const good = '{ id: "cn--1900--p01", track: "cn", year: 1900, yearApprox: false, dim: "politics", weight: 3, title: "样例条目", summary: "这是一条干净的事件。", detail: { background: "背景一句。", process: "经过一句。", impact: "影响一句。", figures: ["某人"], place: "某地", state: "某国", sources: ["《某史》"], tags: ["样例"] }, related: [] }';
  const writeCn = (ev) => fs.writeFileSync(path.join(tmp, "data/cn/cn-01.js"),
    `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\nwindow.__CHRONICLE_CHUNK["cn-01"] = [\n  ${ev}\n];\n`);
  const bad = good.replace("经过一句。", "是年夏？ ？ ？ ？ 于某地开会。");
  eq(bad !== good, true, "注入变异确实改变了字节（防「锚点没命中 ⇒ 自证本身是假绿」）");
  for (const dir of ["cn", "wd"]) {
    fs.mkdirSync(path.join(tmp, "data", dir), { recursive: true });
    fs.writeFileSync(path.join(tmp, "data", dir, dir + "-01.js"),
      `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {};\nwindow.__CHRONICLE_CHUNK["${dir}-01"] = [];\n`);
  }
  fs.mkdirSync(path.join(tmp, "tools"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "tools/validate.mjs"), path.join(tmp, "tools/validate.mjs"));
  /* validate 的每个相对 import 都必须跟着复制：漏一个就崩退，而「崩退后 stdout 什么都没有」
   * 在断言里与「判据不触发」长得一模一样（limits.mjs 加进来时就是这么露出来的）。
   * 清单从 validate 源码自己读出来，不再手写第二份——手写的那份必然先过期。 */
  for (const dep of new Set([...VAL_SRC.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]))) {
    const from = path.join(ROOT, "tools", dep);
    if (!fs.existsSync(from)) { eq(true, false, `validate.mjs 声称依赖 tools/${dep}，但盘上没有这个文件`); continue; }
    fs.copyFileSync(from, path.join(tmp, "tools", dep));
  }
  /* validate 顶层就要读 data/meta.js；缺元数据会崩退，而「崩退 ⇒ stdout 无 CORRUPT」
   * 与「判据不触发」在断言上无法区分，故三者一并复制，并断言进程未异常退出。 */
  for (const meta of ["meta.js", "reign.js", "themes.js"])
    fs.copyFileSync(path.join(ROOT, "data", meta), path.join(tmp, "data", meta));
  const run = () => {
    const r = spawnSync(process.execPath, [path.join(tmp, "tools/validate.mjs")], { encoding: "utf8" });
    const crashed = /\bError\b/.test(r.stderr || "") || !(r.stdout || "").includes("ERRORS");
    eq(crashed, false, "validate 在临时夹具上正常跑完（崩退不得伪装成「门没红」）");
    return r;
  };

  writeCn(good);
  let r = run();
  eq(/CORRUPT/.test(r.stdout || ""), false, "干净样本不触发 CORRUPT（判据不是恒真）");

  writeCn(bad);
  r = run();
  eq(/CORRUPT/.test(r.stdout || ""), true, "注入问号连排后 validate 必须点名 CORRUPT");
  eq(r.status, 1, "注入腐蚀后 validate 以非 0 退出（能拦，不是只报数）");
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- 加载器失效路径：遮罩不得把整站冻死 ----------
 * boot 的成败全押在 ChronLoader 的 Promise 会不会 settle 上。#boot 是
 * position:fixed; inset:0; z-index:60 的整屏遮罩，只要有一条 <script> 既不
 * onload 也不 onerror，链子就永远悬着，页面既不进不出——而这类悬挂在构建期
 * 任何门禁里都看不见。故此处在脚本注入垫片上跑真实 loader，逐条验：
 *   悬挂 → 到点判超时；缺文件 → 判失败；坏 manifest → 不得被缓存成好清单；
 *   少一片 / 加载了却没注册 → 必须进 failedChunks()，不许静默少数据。
 * 每条断言都配反例（干净场景必须不报），否则「failedChunks 非空」也可能只是恒真。 */
{
  const loaderSrc = fs.readFileSync(path.join(ROOT, "js/loader.js"), "utf8");
  const TIMEOUT = 60;                       // 夹具用的看门狗；真实默认见本块末尾 ⑫

  const CHUNK_OK = (id, n) => `window.__CHRONICLE_CHUNK = window.__CHRONICLE_CHUNK || {}; window.__CHRONICLE_CHUNK[${JSON.stringify(id)}] = ` +
    JSON.stringify(Array.from({ length: n }, (_, i) => ({
      id: `${id}--x${i}`, track: "cn", year: 1999, dim: "politics", weight: 3,
      title: "夹具事件" + i, summary: "用于失效路径测试", detail: {}, related: [],
    }))) + ";";

  function makeEnv(files) {
    const reqs = [];
    let inflight = 0, peak = 0;
    const done = (s) => { if (!s.__settled) { s.__settled = true; inflight--; } };  // 一条请求只退一次账
    const head = {
      appendChild(s) {
        s.parentNode = head;
        reqs.push(s.src);
        if (++inflight > peak) peak = inflight;   // 同时在飞几条：分批与全并发在这里分家
        const f = files[s.src];
        if (f === "HANG") return;                       // 什么都不做：模拟既不成功也不报错
        setTimeout(() => {
          done(s);
          if (!s.parentNode) return;                    // 已被看门狗摘掉，迟到的回调不再触发
          if (f === "404") { if (s.onerror) s.onerror(); return; }
          try { new Function("window", f)(win); } catch (e) { /* 求值失败在浏览器里也算 onload */ }
          if (s.onload) s.onload();
        }, 1);
      },
      /* HANG 那片只能在这里退账：它不走上面的 setTimeout，若不等看门狗把它摘掉时
       * 递减，并发峰值会把「已经判死」的悬空请求一直算成在飞——⑬ 的封顶就成了假红。 */
      removeChild(s) { done(s); s.parentNode = null; },
    };
    const win = {
      __CHRONICLE_INJECT_TIMEOUT: TIMEOUT,
      __CHRONICLE_FIRST_TRY_TIMEOUT: TIMEOUT,   // 两个预算都要压到夹具尺度，否则 ensureRange 悬挂用例会真等 18 s
      addEventListener() {}, dispatchEvent() {},
    };
    win.window = win;
    win.__reqs = reqs;                 // 注入次序：视窗优先与远近排序的判据都读它
    win.__peak = () => peak;           // 并发峰值：慢网下整批超时的那条路就从这里现形
    const doc = { head, createElement: () => ({ style: {} }), getElementById: () => null, addEventListener() {} };
    new Function("window", "document", "setTimeout", "clearTimeout", "CustomEvent", loaderSrc)(
      win, doc, setTimeout, clearTimeout, function (t, o) { this.type = t; this.detail = o && o.detail; });
    return win;
  }
  const mf = (chunks) => `window.__CHRONICLE_MANIFEST = ${JSON.stringify({ chunks })};`;
  const c = (id, file, yearFrom = 1990, yearTo = 2000) => ({ id, file, yearFrom, yearTo, count: 2 });
  /** settle 判定：超时本身就是要测的行为，所以这里必须给一个上限，不能无限 await */
  async function settle(p, ms) {
    let t;
    return await Promise.race([p.then((v) => ({ state: "ok", v }), (e) => ({ state: "err", e })).finally(() => clearTimeout(t)),
      new Promise((res) => { t = setTimeout(() => res({ state: "hang" }), ms); })]);
  }

  // ① 注入悬挂：必须在看门狗到点后判超时，而不是永远悬着
  {
    const L = makeEnv({ "data/manifest.js": "HANG" }).ChronLoader;
    const r = await settle(L.ensureManifest(), TIMEOUT * 20);
    eq(r.state, "err", "manifest 注入悬挂时 Promise 必须落定（不修看门狗则永远悬着）");
    eq(/加载超时/.test(r.e && r.e.message || ""), true, `悬挂落定为「加载超时」，实得 ${r.e && r.e.message}`);
  }

  // ② 缺文件：判失败，且失败信息点名文件
  {
    const L = makeEnv({ "data/manifest.js": "404" }).ChronLoader;
    const r = await settle(L.ensureManifest(), TIMEOUT * 20);
    eq(r.state, "err", "manifest 缺失时 ensureManifest 必须 reject");
  }

  // ③ 坏 manifest 不得被缓存：第二次调用仍然要失败
  {
    const L = makeEnv({ "data/manifest.js": `window.__CHRONICLE_MANIFEST = {chunks: "不是数组"};` }).ChronLoader;
    const r1 = await settle(L.ensureManifest(), TIMEOUT * 20);
    const r2 = await settle(L.ensureManifest(), TIMEOUT * 20);
    eq(r1.state, "err", "manifest 无 chunks 时首次调用报错");
    eq(r2.state, "err", "坏 manifest 不得被当成已加载清单缓存（第二次仍须报错）");
  }

  // ④ 少一片：ensureAll 照常落定，但失败必须进账
  {
    const files = {
      "data/manifest.js": mf([c("cn-91", "cn/cn-91.js"), c("cn-92", "cn/cn-92.js")]),
      "data/cn/cn-91.js": CHUNK_OK("cn-91", 2),
      "data/cn/cn-92.js": "404",
    };
    const win = makeEnv(files);
    await win.ChronLoader.ensureAll();
    const bad = win.ChronLoader.failedChunks();
    eq(bad.map((b) => b.id), ["cn-92"], "缺文件的那片必须出现在 failedChunks()，不许静默少数据");
    eq(win.ChronLoader.stats().total, 2, "其余分片照常入库（失败范围不扩散）");
    eq(bad.length ? /load failed/.test(bad[0].reason) : false, true, "failedChunks 带可诊断原因");
  }

  // ⑤ 加载成功却没注册：onload 不等于数据到位，这一类以前完全静默
  {
    const files = {
      "data/manifest.js": mf([c("cn-93", "cn/cn-93.js")]),
      "data/cn/cn-93.js": CHUNK_OK("cn-99", 2),      // 注册成别的 key：语法正确、数据在、索引对不上
    };
    const win = makeEnv(files);
    await win.ChronLoader.ensureAll();
    eq(win.ChronLoader.failedChunks().map((b) => b.id), ["cn-93"], "onload 但 __CHRONICLE_CHUNK 里没有该片 → 记为失败");
  }

  // ⑥ 反例（正对照的镜像）：全部就位时不得报任何失败
  {
    const files = {
      "data/manifest.js": mf([c("cn-91", "cn/cn-91.js"), c("cn-92", "cn/cn-92.js")]),
      "data/cn/cn-91.js": CHUNK_OK("cn-91", 2),
      "data/cn/cn-92.js": CHUNK_OK("cn-92", 3),
    };
    const win = makeEnv(files);
    await win.ChronLoader.ensureAll();
    eq(win.ChronLoader.failedChunks(), [], "干净夹具不得报失败（否则 ④⑤ 的断言等于恒真）");
    eq(win.ChronLoader.stats().total, 5, "干净夹具两片共 5 条全部入库");
  }

  /* ---------- ⑦–⑩ 视窗优先：首屏只取看得见的，其余按远近补齐 ----------
   * 这组用例盯的是冷启动的第一笔账：54 个文件全压在一屏之前，等于让每个新访客
   * 先看一屏进度条；反过来只取视窗那几片又很容易做成「永远只取那几片」。
   * 所以既测「取了多少」，也测「补齐的顺序」与「取不到时还能不能救回来」。
   * 夹具年代：视窗 1990–2000（邻接垫 100 年 → 1890–2100）
   *   A 1990–2000 在窗内 | B 2100–2150 落在垫内 | C 1600–1700 差 290 年
   *   E 2400–2500 差 400 年 | D 前3000–前2000 差 3990 年 —— 补齐顺序须为 C、E、D */
  {
    const VIEWS = {
      "data/manifest.js": mf([
        c("cn-91", "cn/cn-91.js", 1990, 2000), c("cn-92", "cn/cn-92.js", 2100, 2150),
        c("cn-93", "cn/cn-93.js", 1600, 1700), c("wd-91", "wd/wd-91.js", 2400, 2500),
        c("cn-94", "cn/cn-94.js", -3000, -2000),
      ]),
      "data/cn/cn-91.js": CHUNK_OK("cn-91", 2),
      "data/cn/cn-92.js": CHUNK_OK("cn-92", 3),
      "data/cn/cn-93.js": CHUNK_OK("cn-93", 4),
      "data/wd/wd-91.js": CHUNK_OK("wd-91", 5),
      "data/cn/cn-94.js": CHUNK_OK("cn-94", 6),
    };
    const shards = (win) => win.__reqs.filter((r) => r !== "data/manifest.js");

    // ⑦ 首屏：只取与视窗（含垫）相交的片，一片都不能多
    const win7 = makeEnv(VIEWS);
    const n7 = await win7.ChronLoader.ensureRange(1990, 2000);
    eq(shards(win7), ["data/cn/cn-91.js", "data/cn/cn-92.js"],
      `ensureRange(1990,2000) 只注入窗内两片（实取 ${JSON.stringify(shards(win7))}）`);
    eq([n7, win7.ChronLoader.stats().loadedChunks], [5, 2], "首屏入库 5 条、2/5 片——差额正是留给后台补齐的部分");

    // ⑧ 补齐：余下三片按「离视窗多远」取用，取完必须一片不缺
    const n8 = await win7.ChronLoader.ensureRest(1990, 2000);
    eq(shards(win7).slice(2), ["data/cn/cn-93.js", "data/wd/wd-91.js", "data/cn/cn-94.js"],
      `补齐顺序须由近及远（实为 ${JSON.stringify(shards(win7).slice(2))}）：按清单顺序补片会让读者往右一拖就撞空白`);
    eq([n8, win7.ChronLoader.stats().loadedChunks, win7.ChronLoader.stats().total],
      [15, 5, 20], "ensureRest 返回新增条数，且补齐后 5 片 20 条全部就位");

    // ⑨ 再补一次：已载入的不得重复注入（否则每拖一次视窗就重下一遍全站）
    const before9 = shards(win7).length;
    eq(await win7.ChronLoader.ensureRest(1990, 2000), 0, "全部就位后 ensureRest 返回 0 新增");
    eq(shards(win7).length, before9, "返回 0 之外还必须真的没有再次注入（loaded 守卫失手时全站流量翻倍）");

    // ⑩ 失败片的出路：这一轮取不到，下一轮仍有机会；救回来后 failedChunks 必须清零
    const files10 = Object.assign({}, VIEWS, { "data/wd/wd-91.js": "404" });
    const win10 = makeEnv(files10);
    await win10.ChronLoader.ensureRange(1990, 2000);
    await win10.ChronLoader.ensureRest(1990, 2000);
    eq(win10.ChronLoader.failedChunks().map((b) => b.id), ["wd-91"],
      "补齐途中缺片必须进 failedChunks（否则「长河尚不完整」的警告无从算起）");
    eq(win10.ChronLoader.stats().loadedChunks, 4, "失败一片不阻塞其余分片补齐");
    files10["data/wd/wd-91.js"] = CHUNK_OK("wd-91", 5);     // 模拟抖动之后文件又能取了
    await win10.ChronLoader.ensureRest(1990, 2000);
    eq(win10.ChronLoader.failedChunks(), [], "下一轮补齐把失败片救回后必须撤账（旧失败记录会让状态栏永久挂 ⚠）");
    eq(win10.ChronLoader.stats().loadedChunks, 5, "救回后 5 片齐全");
  }

  /* ---------- ⑪ 超时判死之后还有没有第二条路 ----------
   * 看门狗只是把「永远悬着」换成「到点报错」，报错本身不等于有出路。托管上线后
   * 28/29 片就是这么红的：判死没错，错在判死之后全站再也没取过它们一次。
   * 所以这里断言的不只是「第二轮返回 0 条新增之外的状态」，而是那一片被
   * 重新注入了一次——只看 failedChunks 清零，分不清它是自己回来的还是根本没再取。 */
  {
    const files11 = {
      "data/manifest.js": mf([c("cn-95", "cn/cn-95.js")]),
      "data/cn/cn-95.js": "HANG",
    };
    const win11 = makeEnv(files11);
    await win11.ChronLoader.ensureAll();
    eq(win11.ChronLoader.failedChunks().map((b) => b.id), ["cn-95"],
      "注入悬挂要判超时并进账（不判则这一轮永远悬着）");
    files11["data/cn/cn-95.js"] = CHUNK_OK("cn-95", 2);
    await win11.ChronLoader.ensureAll();
    eq(win11.__reqs.filter((r) => r === "data/cn/cn-95.js").length, 2,
      "超时那片在下一轮必须真的重新注入（ensureAll 退回全并发或被 loaded 误标就取不到这一笔）");
    eq([win11.ChronLoader.stats().total, win11.ChronLoader.failedChunks().length], [2, 0],
      "重取成功后 2 条入库、失败账清零");
  }

  /* ---------- ⑫ 两个预算的「真实默认值」本身 ----------
   * ①–⑪ 全在夹具尺度（60ms）里验行为，唯一验不出的是数字够不够大：8 s 在夹具里
   * 一样测得出超时，上线却把整站判死。数字本身必须有一道门，而且判据不能靠
   * 注释里那个会过期的数——分片体积从磁盘现算。
   * 吞吐下限取托管链路（GitHub Pages）curl 四组实测最慢的一档 13 KB/s（其余 44/51/110）。 */
  {
    const grab = (re, label) => {
      const m = loaderSrc.match(re);
      ok(!!m, `loader.js 里要能读到 ${label} 的默认值字面量（改成别的写法就同步改这道门）`);
      return m ? Number(m[1]) : NaN;
    };
    const WIDE = grab(/__CHRONICLE_INJECT_TIMEOUT \|\| (\d+)/, "宽预算");
    const FIRST = grab(/__CHRONICLE_FIRST_TRY_TIMEOUT \|\| (\d+)/, "首屏预算");
    const BW = 13 * 1024;
    const mw = {};
    new Function("window", fs.readFileSync(path.join(ROOT, "data/manifest.js"), "utf8"))(mw);
    const sizes = mw.__CHRONICLE_MANIFEST.chunks
      .map((c) => fs.statSync(path.join(ROOT, "data", c.file)).size)
      .sort((a, b) => a - b);
    const max = sizes[sizes.length - 1], median = sizes[Math.floor(sizes.length / 2)];
    ok(WIDE > FIRST, `宽预算 ${WIDE}ms 必须大于首屏预算 ${FIRST}ms：首屏那条路有人在遮罩前等，后台那条没有`);
    ok(WIDE / 1000 * BW >= max,
      `宽预算要罩得住最大那片（${max}B）在最慢吞吐下的耗时（需 ≥ ${(max / BW).toFixed(1)}s，实得 ${WIDE / 1000}s）`);
    ok(FIRST / 1000 * BW >= median,
      `首屏预算要罩得住中位数那片（${median}B）在最慢吞吐下的耗时（需 ≥ ${(median / BW).toFixed(1)}s，实得 ${FIRST / 1000}s）`);

    /* 另外四层不再自带数字：谁把它们改回字面量，两个预算就又变成五份会各自漂移的账。 */
    const others = { geo: "__CHRONICLE_GEO_TIMEOUT", frame: "__CHRONICLE_FRAME_TIMEOUT",
      story: "__CHRONICLE_STORY_TIMEOUT", chain: "__CHRONICLE_CHAIN_TIMEOUT" };
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const noCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const at = (name) => html.indexOf(`src="js/${name}.js"`);
    ok(at("loader") > 0, "index.html 里切得出 js/loader.js（切不出则下面的顺序断言全在空转）");
    Object.keys(others).forEach((name) => {
      const src = noCmt(fs.readFileSync(path.join(ROOT, `js/${name}.js`), "utf8"));
      ok(new RegExp(`var INJECT_TIMEOUT = window\\.${others[name]} \\|\\| window\\.ChronLoader\\.injectTimeout;`).test(src),
        `js/${name}.js 的看门狗要从 ChronLoader 取（写回字面量就会有五处各自漂移的默认值）`);
      ok(at("loader") < at(name),
        `js/${name}.js 依赖 ChronLoader.injectTimeout，必须排在 js/loader.js 之后加载（顺序换过来它取到的是 undefined）`);
    });
  }

  /* ---------- ⑬ 分批：并发数必须有封顶 ----------
   * 阈值放宽只是止血，真正让「加载全部分片」在慢网下整批超时的是并发：29 条请求
   * 一起出去，每条只分到 1/29 的带宽，于是每条都更慢、每条都撞看门狗——实测点这个
   * 按钮 50 s 后一片也没回来。夹具里每片 1 ms 落地，全并发同样不会超时，
   * 所以只能看「任意同时在飞几条」，不能看结果。
   * 3 = loader.js 的 REST_BATCH，这里再写一遍是交叉核对：把它改成 6 属于放宽并发，
   * 得同时改两处，正是希望被看见的那种改动。 */
  {
    const files13 = { "data/manifest.js": mf([0, 1, 2, 3, 4].map((i) => c("cn-9" + i, "cn/cn-9" + i + ".js"))) };
    for (let i = 0; i < 5; i++) files13["data/cn/cn-9" + i + ".js"] = CHUNK_OK("cn-9" + i, 2);
    const win13 = makeEnv(files13);
    await win13.ChronLoader.ensureAll();
    ok(win13.__peak() <= 3,
      `ensureAll 的并发峰值须有封顶（实得 ${win13.__peak()}，5 片全并发就是把首屏刚省下的带宽一次性占满）`);
    ok(win13.__reqs.length === 6, "5 片 + 清单确实都取过（封顶不是靠少取实现的）");
  }

  /* ---------- ⑭ until：为一把钥匙不必等整串 ----------
   * 分批之后 ensureAll 最坏要十几批才 resolve，而深链 #/event 等的只是那一条。
   * 这里验两件事：命中即收手（后面的批次不再发），以及没命中时不能提前收手
   * （否则「until 恒真」这种写法会把兜底悄悄变成不兜底——数据永久少一片）。
   * 谓词故意只读夹具的请求台账、不碰 ChronLoader 的导出：这里一旦依赖 eventById，
   * 任何把那个导出改坏的变异都会先把整台测试崩掉，反而让「改坏导出」那条哨兵没了名字。 */
  {
    const files14 = { "data/manifest.js": mf([0, 1, 2, 3, 4].map((i) => c("cn-9" + i, "cn/cn-9" + i + ".js"))) };
    for (let i = 0; i < 5; i++) files14["data/cn/cn-9" + i + ".js"] = CHUNK_OK("cn-9" + i, 2);
    const win14 = makeEnv(files14);
    await win14.ChronLoader.ensureAll(function () { return win14.__reqs.length >= 4; });   // 头一批 3 片到手
    eq(win14.__reqs.length, 4, "首批 3 片落地即命中 ⇒ 只取清单 + 3 片（多取说明 until 没生效）");
    eq(win14.__reqs.slice(4), [], "命中之后的分片不再注入（剩下的交给后台补齐）");

    const win15 = makeEnv(files14);
    await win15.ChronLoader.ensureAll(function () { return false; });
    eq(win15.__reqs.length, 6, "永不命中时仍要把 5 片取完（until 写错成恒真就等于深链兜底消失）");

    /* 调用点也得真的传：只改 loader 不改两处深链，读者等的那条还是走完十几批。 */
    const noCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    for (const f of ["js/router.js", "js/detail.js"]) {
      const src = noCmt(fs.readFileSync(path.join(ROOT, f), "utf8"));
      ok(/ensureAll\(function \(\) \{ return !!L\.eventById\(/.test(src),
        `${f} 的深链兜底要把「这一条到手」作为 until 传给 ensureAll（不传则为等一条而等全部）`);
    }
  }
}

/* ============ prov.js：溯源四级——标签只能由证据现算，不许手写 ============
 * 为什么要这段：全库 4900 条的出处字段形态差异极大（「《史记·秦始皇本纪》」能直接翻到，
 * 「《资治通鉴》」翻不动），而界面从前不区分这两者，等于替后者作了保。
 * 一旦补上标签，标签本身就成了攻击面——所以这里断言的重点不是「算得准」，
 * 而是「没有别的路能算出 verified」：伪造不出来的标签才叫标签，否则只是装饰。 */
{
  const PV = window.ChronProv;
  ok(!!PV, "prov.js 已加载并挂出 window.ChronProv（未挂出=六面标签全是空串）");
  if (!PV) { /* 下面的判据全在这一句的成败上，缺模块就别再往下数空转的红 */ }
  else {
    const TIER_KEYS = ["verified", "locatable", "titled", "unsourced"];
    eq(PV.TIERS.map((t) => t.key), TIER_KEYS,
       "四级顺序与 stats() 里预置的四个桶一致（改 key 不改 stats ⇒ 计数静默丢进新键）");
    eq(PV.TIERS.slice().sort((a, b) => PV.RANK[a.key] - PV.RANK[b.key]).map((t) => t.key),
       ["unsourced", "titled", "locatable", "verified"],
       "RANK 给出严格互异的由弱到强全序（漏一档=undefined 参与排序，两档并列=门槛把它们静默合成一档）");

    const evs = [];
    for (const sub of ["cn", "wd"]) {
      for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
        const w = { window: {} };
        new Function("window", fs.readFileSync(path.join(ROOT, "data", sub, n), "utf8"))(w.window);
        for (const e of Object.values(w.window.__CHRONICLE_CHUNK)[0]) evs.push(e);
      }
    }
    ok(evs.length > 4000, `真语料加载了 ${evs.length} 条（不足 4000=下面的覆盖率判据在空集上恒真）`);

    const st = PV.stats(evs);
    eq(st.total, evs.length, "stats.total 就是入参条数");
    eq(TIER_KEYS.reduce((s, k) => s + st[k], 0), st.total,
       `四级互斥且完备：${TIER_KEYS.map((k) => k + "=" + st[k]).join(" ")} 相加须等于 total（有条目掉在四级之外）`);
    const tierSet = new Set(PV.TIERS.map((t) => t.key));
    eq(evs.filter((e) => !tierSet.has(PV.tierOf(e))).length, 0,
       "真语料里没有一条落在四级之外（tierOf 有未覆盖分支）");

    /* ---- 正对照：verified 可达，且只有这一条路可达 ---- */
    const src = (s) => ({ detail: { sources: [s] } });
    const good = src("《资治通鉴》卷二百一十二 贞观四年");
    eq(PV.tierOf(good), "locatable", "出处能定位、无人核对 → 可定位（够好的出处也换不来已核）");
    eq(PV.tierOf({ detail: { sources: ["《资治通鉴》"] } }), "titled", "出处只有书名 → 仅书名");
    eq(PV.tierOf({ detail: {} }), "unsourced", "没有出处 → 无出处");
    eq(PV.tierOf({ detail: { sources: "不是数组" } }), "unsourced", "sources 类型不对时不抛异常，按无出处处理");
    eq(PV.tierOf(undefined), "unsourced", "传 undefined 不抛异常");
    eq(PV.tierOf({ prov: "verified", tier: "verified", checks: [] }), "unsourced",
       "手写 prov/tier 字段翻不动等级（派生制的全部意义就在这句：条目里没有等级可写）");
    eq(PV.tierOf({ detail: { sources: ["https://example.com/a"] }, checks: [{ by: "张三（核《资治通鉴》卷二百一十二）", at: "2026-09-20" }] }),
       "verified", "只有合法的 checks 记录能升到已核（署名写明核在哪一处才算合法）");

    /* ---- 核对记录的失效形状：每一种都要单独红，不能靠一条兜底 ---- */
    const REJECT = [
      /* 一条用例只留一个被拒理由：署名带位置时，被拒才必然归因于日期写法。
       * 若 by 同时缺位置，摘掉日期校验记录照样被拒，这支变异就悄悄失去了可红性
       * （test-gates-meta 的对应哨兵会在这里点名）。 */
      ["日期写成中文", { by: "张三（核《资治通鉴》卷二百一十二）", at: "2026年9月20日" }],
      ["日期缺前导零", { by: "张三（核《资治通鉴》卷二百一十二）", at: "2026-9-20" }],
      ["没有署名", { at: "2026-09-20" }],
      ["署名全空白", { by: "   ", at: "2026-09-20" }],
      /* 形状全对、唯独没有位置：这是「已核」最省事的造假方式，也是本档最容易失守的地方。
       * 日期写在署名里也不行——那一维归 at，写成「2026年9月20日核过」仍然查不到任何一处。 */
      ["署名不带位置", { by: "张三", at: "2026-09-20" }],
      ["署名只写日期", { by: "张三（2026年9月20日核过）", at: "2026-09-20" }],
      ["记录不是对象", "我核对过了"],
    ];
    for (const [why, c] of REJECT) {
      eq(PV.validCheck(c), false, `核对记录被拒（${why}）——自封的已核比没标签更糟`);
      eq(PV.tierOf({ detail: { sources: ["《资治通鉴》卷二百一十二"] }, checks: [c] }), "locatable",
         `被拒的记录（${why}）不参与定级，该条目仍是可定位`);
    }

    /* ---- 规则↔语料双向对账 ----
     * 只查「命中 > 0」会让一条早已失效的正则永远假装在工作；只查正则语法更什么都查不到。
     * 所以把「哪些类别应当在精选语料里出现」写死在这里，两侧互证：
     * 该命中的没命中 = 规则随数据格式演进死掉了；不该命中的命中了 = 语料漂进了没人评审过的规则。
     * link 是唯一例外：6 类里只有它在 11597 条真实出处中 0 命中，它是给投稿预留的。 */
    const EXPECT = { chapter: true, juan: true, section: true, dated: true, numbered: true, link: false };
    const allSrc = evs.flatMap((e) => PV.sourcesOf(e).map(String));
    ok(allSrc.length > 0, `真语料有 ${allSrc.length} 条出处字符串可供匹配（为空则下面的命中率全在空转）`);
    eq(Object.keys(EXPECT).sort(), PV.KINDS.map((k) => k.key).sort(),
       "测试登记的类别清单与 prov.js 的 KINDS 一一对应（新增一类而不登记期望=它永远不会被对账）");
    for (const k of PV.KINDS) {
      const hit = allSrc.filter((s) => k.re.test(s)).length;
      const exp = EXPECT[k.key];
      ok(exp !== undefined, `类别「${k.label}」(${k.key}) 未在测试期望表里登记`);
      eq(hit > 0, exp,
         `类别「${k.label}」真语料命中 ${hit} 条，期望${exp ? ">0" : "=0"}——` +
         (exp ? "规则已失效却在冒充判据" : "语料漂进了未评审的定位规则，须复核分级口径"));
    }

    /* ---- 著录编号一类的边界：这类判据最容易把年份当成位置 ----
     * 它升的是「读者查得到」，靠的是编号；而 1912—1913 这种年跨度长得一模一样，
     * 一旦算进来，仅书名里最含糊的一批会自动冒充可定位——分级就成了假分级。
     * 所以正反两侧都用字面串钉死，不依赖语料（语料会变，边界不该跟着变）。 */
    const NUM_KIND = PV.KINDS.filter((k) => k.key === "numbered");
    eq(NUM_KIND.length, 1, "KINDS 里恰好一条 numbered（实得 " + NUM_KIND.length + "）：判据挪进别的类就不受本用例保护");
    const NRE = NUM_KIND[0] && NUM_KIND[0].re;
    const NUM_YES = ["《甲骨文合集》6412、6413", "《殷周金文集成》10175墙盘、10164散氏盘",
      "希罗多德《历史》1.96—1.101", "亚里士多德《形而上学》983b",
      "《盎格鲁-撒克逊编年史》878 条", "《古兰经》48 章", "亚里士多德《雅典政制》20—22章",
      "《人类环境宣言》26项原则",
      /* 期刊的「年第N期」是这一类里最常用的一种著录编号：发掘简报、评论文章
       * 都靠它定位。它和年跨度只差一个「期」字，所以正反两侧必须同时钉在这里。 */
      "《文物》1975年第11期", "《考古》1979年第5期", "《戏剧报》1978年第7期"];
    const NUM_NO = ["《申报》1912—1913年原载", "《挑战者号深海探测报告》1880至1895年五十卷",
      "玛丽·戈德温《弗兰肯斯坦》1818/1831年版及其序", "《人民日报》1952年9月",
      "《乌托邦》1516年原本", "《基督教要义》1536年初版与1559年定本",
      "《（民国）政府公报》1942—1943年", "《大伦敦编年史》1497年条",
      "《文物》1975年", "《考古》第5期"];
    for (const s of NUM_NO) eq(NRE && NRE.test(s), false,
      `年跨度/初版年不被算作位置：「${s}」仍应留在仅书名（它只说何时刊行，不说翻到哪一页）`);
    for (const s of NUM_YES) eq(NRE && NRE.test(s), true,
      `真编号判为位置：「${s}」读者照着就能查到那一片/那一条，不算就是假装查不到`);

    /* 可定位 ⇔ 至少命中一类：两条判据若各自演化，标签会与它声称的证据脱钩。
     * 「已核」的条目里 hasLocator 仍为真而 tierOf 已是 verified，等值只在无合式核对
     * 记录的条目上成立——语料曾长期一条已核也没有，那时全表等值与本案等值是同一句话，
     * 现在必须写明这一维，否则第一条诚实的核对记录就会把这条用例顶红。 */
    const noChk = evs.filter((e) => PV.tierOf(e) !== "verified");
    ok(noChk.length > 4000, `其中无核对记录的条目有 ${noChk.length} 条（少于 4000＝下面的等值判据在一个近乎空的样本上恒真）`);
    eq(noChk.filter((e) => PV.hasLocator(e) !== (PV.tierOf(e) === "locatable")).length, 0,
       "「有定位证据」与「判为可定位」在无核对记录的条目上完全等值");

    /* ---- 转义：标签与说明都要写进 innerHTML ----
     * 判据不能写「输出里不许出现 onerror 这个词」——转义后的文本本来就该原样留着，
     * 那样只测出自己的正则太粗。要测的是「危险字符有没有逃过转义」「用户串有没有
     * 混进标签结构」。 */
    const PAY = '"><img src=x onerror=alert(1)>';
    /* by 现在必须自带位置才算合式，所以脏串挂在位置后面：记录照样走到 explain()，
     * 转义面没有被新判据绕开——否则这段会退化成只测一条被丢弃的记录。 */
    const dirty = { detail: { sources: [PAY] },
      checks: [{ by: "张三（核《资治通鉴》卷二百一十二）" + PAY, at: "2026-09-20" }] };
    const expHtml = PV.explain(dirty);
    eq(/[<>"]/.test(expHtml), false,
       `explain 输出里没有未转义的 < > "（实得 ${expHtml}）：它要进 innerHTML，一个漏字的 &quot; 就是执行别人拼的属性`);
    ok(expHtml.includes("&lt;img"), "恶意串以转义形态原样保留（读者看得见有人留了这么一条记录，而不是被静默删改）");
    const badgeHtml = PV.badge(dirty);
    eq(badgeHtml.startsWith('<span class="pv pv-'), true,
       `badge 仍是固定结构的 span（实得 ${badgeHtml}）`);
    eq(badgeHtml.includes("img"), false, "badge 不搬运任何用户文本，出处再脏也进不了标签");
    ok(PV.explain(dirty).indexOf("2026-09-20") > -1, "已核说明里保留了核对日期（标签要能被追问：谁核的、哪天）");
    ok(/卷|篇|节|日期|链接/.test(PV.explain(good)),
       `可定位说明点出了具体定位类别（实得 ${PV.explain(good)}）：只说「有出处」等于没解释`);
  }
}

/* ============ 核对记录的两端口径：validate 放行 ⇔ prov.js 计数 ============
 * 同一条 checks 记录有两处裁决：tools/validate.mjs 决定它能不能进仓，js/prov.js 决定
 * 它算不算数。两端各写一份判据、各自演化一次的结果是「投稿人填了核对记录、标签却没变」，
 * 而这个人没有任何办法看出是谁拒的。所以这里不抄文本比对，直接把 validate 的正则从源码里
 * 解出来当对象用，拿一批日期串逐条问两端的裁决是否一致。 */
{
  const PV = window.ChronProv;
  const fail = (what) => { eq(true, false, `validate.mjs 里解不出${what}——本段所有跨端比对会在空转`); return null; };

  const mRe = /const CHECK_DATE_RE\s*=\s*\/(.+)\/;/.exec(VAL_SRC);
  const VAL_DATE_RE = mRe ? new RegExp(mRe[1]) : fail("核对日期正则");
  /* 署名位置正则带 i 旗标（ISBN/链接那两类不分大小写），所以这里的取样式与
   * CHECK_DATE_RE 不同：末段是 /i; 而不是 /;。解不出来必须报，不能空转。 */
  const mLoc = /const CHECK_BY_LOC_RE\s*=\s*\/(.+)\/i;/.exec(VAL_SRC);
  const VAL_LOC_RE = mLoc ? new RegExp(mLoc[1], "i") : fail("署名位置正则");
  const mEv = /const EV_KEYS\s*=\s*(\[[^\]]*\])/.exec(VAL_SRC);
  const EV_KEYS = mEv ? JSON.parse(mEv[1].replace(/'/g, '"')) : fail("事件合法键清单");
  const mTf = /const TIER_FIELDS\s*=\s*(\[[^\]]*\])/.exec(VAL_SRC);
  const TIER_FIELDS = mTf ? JSON.parse(mTf[1].replace(/'/g, '"')) : fail("等级字段禁令清单");

  if (VAL_DATE_RE && VAL_LOC_RE && EV_KEYS && TIER_FIELDS) {
    eq(TIER_FIELDS.length > 0 && EV_KEYS.length > 0, true, "两张清单本身非空（空集会让下面的互斥与包含断言真空通过）");
    eq(EV_KEYS.includes("checks"), true,
       "EV_KEYS 含 checks：不含则合式记录会被 EXTRA_KEY 判成野生字段，投稿通道一进仓就红");
    const both = TIER_FIELDS.filter((k) => EV_KEYS.includes(k));
    eq(both.length, 0, `一个字段不能既合法又被禁（同时出现于两表：${both.join(",")}）`);

    const DATES = ["2026-09-01", "2026-9-1", "2026年9月", "2026/09/01", "20260901",
      "", "   ", "2026-09-01 ", " 2026-09-01", "2026-09-01T10:20", "0000-01-01", "2026-13-40"];
    let disagree = [];
    for (const s of DATES) {
      const byVal = VAL_DATE_RE.test(String(s).trim());
      const byProv = PV.validCheck({ by: "张三（核《资治通鉴》卷二百一十二）", at: s });
      if (byVal !== byProv) disagree.push(`${JSON.stringify(s)}: validate=${byVal} prov=${byProv}`);
    }
    eq(disagree.length, 0, `两端对 ${DATES.length} 个日期串裁决完全一致（分叉：${disagree.join(" ｜ ")}）`);

    /* 署名「有没有写明位置」是第二维，同样两端各一份判据：validate 决定能不能进仓，
     * prov.js 决定徽章抬不抬得起「已核」。这一维分叉的后果比日期分叉更坏——门放行的
     * 记录在界面上不计数，读者看到的「可定位」里其实躺着一条已经核过的记录，
     * 而核对的人永远不知道自己的记录被谁吃掉了。所以逐串对账，不抄文本比对。 */
    const BYS = [
      "张三", "核对完毕", "张三（2026年9月1日核过）", "   ", "",
      "张三（核《资治通鉴》卷二百一十二）", "某某（翻中华书局点校本《史记》卷三九）",
      "本站·维基文库比对（史记/卷001 三家注版）", "李四（据《史记·项羽本纪》）",
      "张三（第 112 页）", "张三（pp. 30-45）", "张三：30-45",
      "张三（https://zh.wikisource.org/wiki/史記/卷001）", "张三（ISBN 7-101-00301-9）",
      "张三（WWW 国学网）", "张三（卷第一百二十）", "张三（第三十九卷）",
      /* 著录编号一类：甲骨/金文/古典史籍的定位习惯就是「书名＋编号」，
       * 而年跨度长得一模一样——正反两侧都要有样本，否则这把尺子量不出边界。 */
      "张三（《甲骨文合集》6412、6413）", "张三（希罗多德《历史》1.96—1.101）",
      "张三（亚里士多德《形而上学》983b）", "张三（《盎格鲁-撒克逊编年史》878 条）",
      "张三（《申报》1912—1913年原载）", "张三（《挑战者号报告》1880至1895年）",
      "张三（《弗兰肯斯坦》1818/1831年版）", "张三（《人民日报》1952年9月）",
      /* 「年第N期」与「年」只差一个期字：一侧漏钉，另一端就会把出版年当位置 */
      "张三（《文物》1975年第11期）", "张三（《考古》1979年第5期）", "张三（《文物》1975年）",
    ];
    let locSplit = [];
    for (const s of BYS) {
      const byVal = VAL_LOC_RE.test(String(s).trim());
      const byProv = PV.byHasLocator(s);
      if (byVal !== byProv) locSplit.push(`${JSON.stringify(s)}: validate=${byVal} prov=${byProv}`);
    }
    eq(locSplit.length, 0, `两端对 ${BYS.length} 个署名串「有没有写明位置」裁决完全一致（分叉：${locSplit.join(" ｜ ")}）`);
    /* 判据不能靠一份全放或全拒的样本表跑绿：两侧都必须有落点。 */
    const locYes = BYS.filter((s) => PV.byHasLocator(s)).length;
    eq(locYes > 0 && locYes < BYS.length, true,
      `BYS 两侧都有落点（放行 ${locYes} 条／拒 ${BYS.length - locYes} 条）：全放或全拒都说明这批样本量不出这把尺子`);
    eq(PV.CHECK_KINDS.length === PV.KINDS.length - 1 && !PV.CHECK_KINDS.some((k) => k.key === "dated"), true,
      `署名尺子确实剔掉了「日期」这一类（实留 ${PV.CHECK_KINDS.map((k) => k.key).join(",")}）：留着它，「某某（2026年9月1日核过）」就能冒充有位置`);
    /* 日期之外还有一维：by 非空。validate 侧由 test-gates 的「残缺记录（缺 by）」变异证明，
     * 这里补齐前端一侧——否则门放行而 prov 不计数，正是本段要防的那种错。 */
    eq(PV.validCheck({ at: "2026-09-01" }), false, "prov 侧同样不认缺 by 的记录（谁核的留白 = 无人可追问）");
    eq(PV.validCheck({ by: "   ", at: "2026-09-01" }), false, "prov 侧同样不认全空白的 by");

    /* 前端也不许有人靠写字段冒充认证：与 validate 的 TIER_FIELD 同一件事的两端 */
    const forged = { tier: "verified", checks: "verified", sourceTier: 9,
      detail: { sources: ["《史记》卷六·秦始皇本纪"] } };
    eq(PV.tierOf(forged) === "verified", false,
       `prov.js 不读任何手写等级字段（实得 ${PV.tierOf(forged)}）：等级只能由证据算出`);
    eq(PV.rankOf(forged), PV.rankOf({ detail: { sources: ["《史记》卷六·秦始皇本纪"] } }),
       "塞进 tier/checks/sourceTier 之后等级不变——伪造字段连一档 rank 都推不动");
  }
}

/* ============ 溯源标识的「有消费者」对账：标签不是函数，是界面上看得见的东西 ============
 * 上一段证明 prov.js 算得对；这段证明它真的被画上去了。
 * 一个只被测试调用、没人渲染的 badge() 与「功能已上线」之间的差距，
 * 本仓已经吃过一次（manifest 门从不读 manifest）。所以逐面点名。 */
{
  const PV = window.ChronProv;
  /* css 清单从磁盘现取：写死的那份会在下一个人加样式文件时静默漏掉整层——
   * atlas.css 就长期不在这份名单里，看点抽屉与地点页的字色从没被这把尺子量过。 */
  const cssAll = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(ROOT, "css", f), "utf8")).join("\n");
  const readJs = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  /* 逐面点名到「函数」而非「文件」：整条判据若只查文件里有没有 badge()，
   * 摘掉详情头部那一处仍会绿（同一文件里还有三处）——注入变异实测过这件事。 */
  function fnBody(src, name) {
    const at = src.indexOf("function " + name + "(");
    if (at < 0) return null;
    const rest = src.slice(at + 1);
    const nxt = rest.search(/\n {2}function [A-Za-z_$]/);   /* 同缩进的下一个函数即结尾 */
    return nxt < 0 ? rest : rest.slice(0, nxt);
  }
  const SITES = [
    ["js/detail.js", "renderEvent", "详情抽屉头部标签", false],
    ["js/detail.js", "renderEvent", "详情溯源块的解释行", true],
    ["js/detail.js", "rowFor", "相关条目 / 同年对照 / 年份档案行 / 此后三格", false],
    ["js/detail.js", "contextBlock", "±5 年上下文行", false],
    ["js/popover.js", "eventRow", "悬停气泡行", false],
    ["js/compare.js", "list", "同年中西对照卡行", false],
    ["js/river.js", "itemRow", "长河节点", false],
    ["js/search.js", "refresh", "命令面板结果行", false],
    ["js/themes.js", "renderChain", "主题时间线节点", false],
  ];
  for (const [f, fn, label] of SITES) {
    const src = readJs(f);
    const body = fnBody(src, fn);
    ok(body !== null, `${f} 里找得到函数 ${fn}（找不到 = 判据切片为空，下面的断言全在空转）`);
    ok(body !== null && body.includes("PV.badge("),
       `${label}（${fn}）渲染了溯源标签——不渲染 = 该面读者什么也看不见`);
  }
  /* 计数棘轮：期望值由 SITES 表本身推出来，不是手抄的魔数。
   * 只有上面的「函数内有没有」会漏掉一种情形——同一函数里的第二处被摘掉
   * （详情头部正是这样：kicker 与解释行各调一次 badge，实测注入过变异仍绿）。 */
  for (const f of [...new Set(SITES.map((s) => s[0]))]) {
    const want = SITES.filter((s) => s[0] === f).length;
    const got = (readJs(f).match(/PV\.badge\(/g) || []).length;
    eq(got, want, `${f} 里的溯源标签落点数 = SITES 登记的 ${want} 处（实得 ${got}：少一处就是某面在静默丢失）`);
  }
  {
    const d = readJs("js/detail.js");
    ok(/class="pv-line">' \+ PV\.badge\(ev\) \+ " " \+ PV\.explain\(ev\)/.test(d),
       "详情给出 badge+explain 同一行：标签要能被追问「凭什么这么标」");
    ok(d.includes("史料与出处"), "详情的溯源块恒在（没出处也要标出来，整块省掉等于替它遮掉）");
  }

  const appSrc = readJs("js/app.js");
  ok(appSrc.includes("PV.badgeTier(") && /PV\.TIERS\.map/.test(appSrc),
     "图例的四档由 TIERS 生成（手写四行 = 加了第五档会出现没解释的标签）");
  ok(readJs("js/river.js").includes("PV.stats("), "长河视图用了聚合的溯源构成，stats() 不是只有测试在用");
  ok(readJs("js/detail.js").includes("verifiedChecks("),
     "详情面板渲染核对记录——explain() 里「核对记录列在下方」这句才有落点");

  ok(/id="prov-floor"/.test(html), "index.html 有溯源门槛控件");
  ok(/\$\("prov-floor"\)/.test(appSrc) && /S\.patch\(\{ provFloor:/.test(appSrc),
     "控件有人接：app.js 取了 #prov-floor 并写回状态（有按钮无人接 = 装饰）");
  ok(/PV\.RANK\[/.test(appSrc) && /floorLabel\(/.test(appSrc),
     "门槛选项的取值与文案都由档位表生成（HTML 手写四行 = 加一档必漏一档，且漏的是最严那格）");
  const sel0 = html.slice(html.indexOf('id="prov-floor"'));
  ok(sel0.slice(0, sel0.indexOf("</select>")).indexOf("<option") === -1,
     "index.html 的 #prov-floor 不自带 option（HTML 注释声称「选项由 app.js 生成」，这句得可验）");

  const stSrc = readJs("js/state.js");
  const pf = stSrc.slice(stSrc.indexOf("function passesFilter"), stSrc.indexOf("window.ChronState"));
  ok(/provFloor/.test(pf) && /rankOf/.test(pf), "passesFilter 真的按溯源门槛过滤（否则控件是个摆设）");
  const persistBody = stSrc.slice(stSrc.indexOf("function persist"), stSrc.indexOf("function restore"));
  const restoreBody = stSrc.slice(stSrc.indexOf("function restore"), stSrc.indexOf("function visibleDims"));
  ok(/provFloor:/.test(persistBody), "persist() 白名单里有 provFloor（漏了＝刷新即回到「全部」）");
  ok(/o\.provFloor >= 0 && o\.provFloor <= 3/.test(restoreBody),
     "restore() 校验了 provFloor 取值域（localStorage 可被手改，越界值会把全站筛空）");

  /* 门槛是「活的」筛选：面板必须跟着重画，且空态不能把「筛掉了」说成「没有」。 */
  {
    /* 注释里写着「降低顶栏的溯源门槛」不算真降低：本块判据一律先剥注释 */
    const strip2 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const dSrc = strip2(readJs("js/detail.js"));
    const sub = dSrc.slice(dSrc.indexOf("S.subscribe("));
    ok(dSrc.indexOf("S.subscribe(") > -1 && sub.length > 20,
       "detail.js 订阅了状态变化（切不出片段=下面的判据全在空转）");
    ok(/function rerender\(/.test(dSrc) && /rerender\(\)/.test(sub),
       "订阅回调走 rerender()：筛选一变就重画，否则抽屉里留着刚被筛掉的那批条目");
    ok(/if \(S\.filterChanged\(changed\)\) rerender\(\)/.test(sub),
       "抽屉的重画判据向 state.js 的 filterChanged 要（本地再抄一份键表=第二套口径，见「筛选键的单点口径」段）");
    const ry = dSrc.slice(dSrc.indexOf("function renderYear"), dSrc.indexOf("function contextBlock") > -1 ? dSrc.indexOf("function renderYear") + 4000 : dSrc.length);
    ok(/var raw = L\.allEventsAtYear\(y\)/.test(ry) && /raw\.filter\(S\.passesFilter\)/.test(ry),
       "renderYear 同时留着「未筛」与「已筛」两份（只有一份就分辨不出「没有」与「被筛掉」）");
    ok(/if \(!raw\.length\)[\s\S]{0,120}此年暂无收录条目/.test(ry),
       "「此年暂无收录条目」只在真的没有条目时才说（否则等于把「我不给你看」说成「历史上没有」）");
    ok(/被溯源门槛筛掉|全部被溯源门槛筛掉/.test(ry) && /data-act="prov-all"/.test(ry),
       "溯源门槛筛空时写明原因并给出「放宽」出口");
    ok(/act === "prov-all"[\s\S]{0,60}provFloor: 0/.test(dSrc),
       "prov-all 按钮真的接回了门槛归零（有按钮无人接=装饰）");
    ok(/降低顶栏的溯源门槛/.test(strip2(readJs("js/river.js"))),
       "长河空态的补救清单里有溯源门槛（门槛=已核时整条河是空的，清单却不提它）");
    const appSrc2 = strip2(readJs("js/app.js"));
    const sync = appSrc2.slice(appSrc2.indexOf("function syncToggles"), appSrc2.indexOf("function armEnter"));
    ok(/pf\.value = String\(st\.provFloor\)/.test(sync),
       "syncToggles 把 provFloor 推回下拉（抽屉里放宽了，顶栏却还指着最严那格=两个真相）");

    /* 空态口径按文件清点，不逐处手点：凡是既按 passesFilter 挑条目、又说「此年无收录」
     * 的界面，都必须先看未筛计数。抽屉先修，对照随实时重画一起修。 */
    const claimants = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"))
      .filter((f) => { const s = strip2(readJs("js/" + f)); return /S\.passesFilter/.test(s) && /此年[^"]*收录条目/.test(s); })
      .sort();
    eq(claimants.join(","), "compare.js,detail.js",
       `走筛选又说「此年无收录」的界面就这两个（实得 ${claimants.join(",")}：多出一个必须重新评审它的空态）`);
    for (const f of claimants) {
      const s = strip2(readJs("js/" + f));
      ok(/raw\.length[\s\S]{0,200}此年[^"]*收录条目/.test(s),
         `${f} 的「此年无收录」由未筛计数决定（只看筛后计数=把「我不给你看」说成「历史上没有」）`);
      ok(/被溯源门槛筛掉/.test(s),
         `${f} 分辨得出「被溯源门槛筛掉」与「此年没有记载」（门槛在顶栏，读者不会自己联想到这里空了）`);
    }
  }

  /* 「此后」钩子（三年后 / 三十年后 / 这些人后来）——候选全由年序与人物名现算，
   * 不读 related（跨轨 related 只占 2.8%，靠它等于大多数条目这一格永远空着）。
   * 这一格算错不会报错：会把 1904 说成「三年后」、把别的轨塞进「中国的后续」、
   * 或者反过来把窗口里明明有的条目说成「没有」。所以这里实跑 ChronDetail，不读源码。 */
  {
    const fx = (id, track, year, dim, weight, figs, extra) =>
      Object.assign({ id, track, year, yearApprox: false, dim, weight, title: "夹具·" + id,
        summary: "用于「此后」钩子", detail: { figures: figs || [], sources: ["《某史》"] }, related: [] }, extra || {});
    const EVENTS = [
      fx("b", "cn", 1900, "politics", 5, ["甲", "乙"]),
      fx("t1", "cn", 1901, "war", 4),
      fx("t2b", "cn", 1902, "politics", 5),
      fx("t2a", "cn", 1902, "politics", 3),
      fx("t3", "cn", 1903, "politics", 4),          // 1900+3：上界必须含
      fx("x4", "cn", 1904, "politics", 3, ["丁"]),   // 1900+4：三年格不含；三十年格里它最近，被远端挤掉
      fx("n06", "cn", 1906, "politics", 5, ["戊"]),   // 同维且权重最高：若按「先近后远」它必进三十年格
      fx("y25", "cn", 1925, "politics", 2),
      fx("a26", "cn", 1926, "art", 5, ["乙"]),       // 异维→不进三十年格；同人→进同人格
      fx("z31", "cn", 1931, "politics", 5),          // 1900+31：30 年上界之外
      fx("w01", "world", 1901, "politics", 4, ["甲"]), // 跨轨：三年格不收，同人格收
      fx("hid", "cn", 1902, "politics", 4, [], { __hidden: true }),
      fx("lonely", "cn", 1850, "science", 4, ["孤"]),   // 之后 30 年内同轨一条没有
      fx("far", "cn", 1999, "science", 4, ["甲"]),       // lonely 的「后续」，但相距 149 年
    ];
    const meta = {
      tracks: { cn: { short: "中", label: "中国", color: "#c00" }, world: { short: "西", label: "世界", color: "#08c" } },
      dimensions: { politics: { label: "政治", color: "#999" }, war: { label: "战争", color: "#a63" },
        art: { label: "文艺", color: "#6a9" }, science: { label: "科学", color: "#69a" } },
      dimOrder: ["politics", "war", "art", "science"], yearMin: -3000, yearMax: 2100,
    };
    const doc = { createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} }),
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      body: { appendChild() {} }, documentElement: { style: {}, setAttribute() {} }, addEventListener() {} };
    function makeDetailEnv(st) {
      const win = {
        addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
        ChronLoader: {
          eventsIn: (from, to) => EVENTS.filter((e) => e.year >= from && e.year <= to),
          allEventsAtYear: (y) => EVENTS.filter((e) => e.year === y),
          eventsAtYear: (t, y) => EVENTS.filter((e) => e.track === t && e.year === y),
          eventById: (id) => EVENTS.find((e) => e.id === id) || null,
          allEvents: () => EVENTS,
          stats: () => st || { total: EVENTS.length, loadedChunks: 9, totalChunks: 9 },
        },
        ChronTime: { formatYear: (y, o) => (o && o.approx ? "约" : "") + y, formatCentury: () => "XX 世纪" },
        ChronState: { get: () => ({ provFloor: 0 }), passesFilter: (e) => !e.__hidden, patch() {}, subscribe() {}, filterChanged: () => false },
        __CHRONICLE_META: meta,
        ChronProv: { badge: () => '<i class="pv">b</i>', tierOf: () => "titled", rankOf: () => 1, explain: () => "" },
      };
      win.window = win;
      new Function("window", "document", "setTimeout", "CustomEvent", readJs("js/detail.js"))(
        win, doc, () => 0, function (t, o) { Object.assign(this, o || {}); this.type = t; });
      return win.ChronDetail;
    }
    const CD = makeDetailEnv(null);
    const ids = (list) => list.map((e) => e.id).join(",");
    const base = EVENTS.find((e) => e.id === "b");

    ok(CD && typeof CD.ahead === "function" && typeof CD.laterPick === "function",
       "detail.js 导出了 ahead/laterPick（导不到=下面每一条都在空转）");
    eq(ids(CD.ahead(base, 1, 3, {})), "t1,t2b,t2a,t3",
       "三年窗按年序排、同年按权重降序，且 1900+3 这条在界内（写死 1–2 就漏掉整整一年）");
    eq(CD.ahead(base, 1, 3, {}).some((e) => e.id === "x4"), false,
       "1904 不算「三年后」（上界多放一年，钩子就开始说假话）");
    eq(CD.ahead(base, 0, 3, {}).some((e) => e.id === "b"), false,
       "lo=0 时本条自己被排除（把自己列进「此后」=告诉读者它还没发生）");
    eq(CD.ahead(base, 1, 3, {}).some((e) => e.track === "world"), false,
       "三年格不跨轨（把世界轨的事说成这条中国事的「三年后」=轨被抹平）");
    eq(ids(CD.ahead(base, 4, 30, { sameDim: true })), "x4,n06,y25",
       "三十年格只收同一维度、默认按年序排，且 1900+30 是上界（1931 那条再像后续也不收）");
    eq(ids(CD.ahead(base, 4, 30, { sameDim: true, farFirst: true })), "y25,n06,x4",
       "farFirst 把同一批候选倒过来排（不改变窗口成员，只改变谁先占名额）");
    eq(CD.ahead(base, 1, 30, {}).some((e) => e.id === "hid"), false,
       "被溯源门槛筛掉的条目不进「此后」（门槛是活的筛选，钩子不能从侧面绕过去）");
    eq(CD.ahead(base, 1, 30, { exclude: { t1: 1, t2b: 1 } }).some((e) => e.id === "t1"), false,
       "exclude 名单生效（同一条在三年格和三十年格各出现一次=一条变两条的假账）");

    const pick = CD.laterPick(base);
    eq([CD.LATER_WINDOWS.three, CD.LATER_WINDOWS.thirty, CD.LATER_WINDOWS.people]
         .map((w) => w.join("–")).join(" / "),
       "1–3 / 4–30 / 1–30",
       "三格的时间窗（年差、含两端）——这三个数在测试里另写一份，独立核对 detail.js 那张表：" +
       "名额只有两三个，把上界偷偷放宽常常挤不进结果、行为测试照旧全绿，所以必须直接对表");
    eq(ids(pick.three), "t1,t2b,t2a", "「三年后」格取满 3 条即止，t3 由第 4 条让位（无限列下去就不是钩子是清单）");
    eq(ids(pick.thirty), "n06,y25",
       "「三十年后」的两个名额从窗口远端收下（同维、不与三年格重复），再按年序摆给读者");
    eq(pick.thirty.some((e) => e.id === "x4"), false,
       "距本条 4 年的那条不进「三十年后」（它权重最高、年份最近，按「先近后远」一定挤掉别人——挂在「三十年后」底下就是标题在说假话）");
    eq(pick.thirty.some((e) => e.dim !== base.dim), false,
       "三十年格只收同一维度（调用处放开维度，1926 那条文艺的事就会冒充本条政治事的后续——而它离本条正好 26 年，年差挑不出毛病）");
    eq(pick.people.some((e) => e.id === "n06"), false,
       "n06 的人物名与本条不相交，同人格不能因为它是 leftover 就顺手收进来");
    eq(ids(pick.people), "w01,a26", "同人格按人物名相交，跨轨也算（甲在 1901 的世界轨条目里，乙在 1926 的文艺条目里）");
    eq(pick.three.length + pick.thirty.length + pick.people.length,
       new Set([...pick.three, ...pick.thirty, ...pick.people].map((e) => e.id)).size,
       "三格之间零重复（重复即读者看见同一条事挂着两个不同的年差）");
    ok(pick.three.length > 0 && base.related.length === 0,
       "本条 related 为空却仍有「此后」——候选确实不依赖 related 边");

    const lonely = EVENTS.find((e) => e.id === "lonely");
    const lp = CD.laterPick(lonely);
    eq([lp.three.length, lp.thirty.length, lp.people.length].join(","), "0,0,0",
       "30 年窗口里没有候选时三格全空（1999 年那条相距 149 年，不能拿来充当「三十年后」）");
    eq(CD.laterBlock(lonely), "",
       "全空时整格不出——硬凑一条远的来充数，比不出现更糟：它把机制说成了装饰");

    const html = CD.laterBlock(base);
    ok(/三年后 · 同轨紧接着/.test(html) && /三十年后 · 同轨同维/.test(html) && /这些人后来/.test(html),
       "三格的标题都在（少一格就是某类候选永远看不见）");
    ok(/data-ev="t1"/.test(html) && /data-ev="w01"/.test(html),
       "钩子行带 data-ev（点了打不开=它只是排在那里的字）");
    ok(/\b1901\b/.test(html) && /\b1925\b/.test(html),
       "行内给出实年：读者能自己验年差，界面不把「三年」的承诺藏在标题里");
    ok(/邻近，不是因果/.test(html),
       "文末写明排的是时间不是因果（邻近摆成链条，读者就会读成因果）");
    const partial = makeDetailEnv({ total: EVENTS.length, loadedChunks: 3, totalChunks: 9 }).laterBlock(base);
    ok(/全库分片只载入 3\/9/.test(partial),
       "分片没载全时照实报载入比例（这时候「窗口里没有」可能是「还没载入」）");
    ok(!/全库分片只载入/.test(html), "全载完时不提这句（提了就是把没发生的事挂在页面上）");

    /* 上面全部是「直接调函数」的实跑，所以它们对「函数写好了但没人调用」是盲的：
     * 摘掉 renderEvent 里那一行，21 条照样全绿。这一条专门盯接线（注释先剥掉，
     * 免得注释里提一句「此后」就冒充成调用）。 */
    const dNoCmt = readJs("js/detail.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const reBody = dNoCmt.slice(dNoCmt.indexOf("function renderEvent"), dNoCmt.indexOf("function rowFor"));
    ok(reBody.length > 200, "renderEvent 片段切得出来（切不出=下面这条在空转）");
    ok(/html \+= laterBlock\(ev\);/.test(reBody),
       "renderEvent 真的把「此后」拼进详情（只导出而不调用=单测全绿、读者却永远看不见这一格）");
    ok(/\.detail \.d-hint/.test(fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8")),
       "口径说明有样式（.d-hint 没定义时那句「不是因果」会跟着 .para p 走成正文字号，读起来像正文的一部分）");

    /* 年份的第二份抄本：调用处或口径句里再写死一遍 1–3/4–30，改表时行为跟着表走、
     * 页面还念旧数（两边各自都对得上自己那份），读者按标题验年差才发现被骗。
     * 这是「写了但没接上」的另一面：接上了，但接的是另一份数字。 */
    ok(!/ahead\(ev, \d/.test(dNoCmt),
       "laterPick 三处窗口全从 LATER_WINDOWS 取，调用处不写死年份（写死就有两份，改表只改其中一份）");
    ok(!/取本条之后 \d|取 \d+–\d+ 年/.test(dNoCmt),
       "口径句里的年份也从表里取（句子里抄一份「1–3」，表改成别的就变成页面当着读者报旧数）");
  }

  /* 四档字色是「这条查得查不到」的唯一视觉通道；10px 小字淡到读不出，
   * 整个溯源层就静默失效（本轮实测：墨底「仅书名」3.74、「无出处」3.40，
   * 宣纸底「已核」金箔 2.22——最该权威的那枚最看不清）。
   * 判据一律从 base.css 现算 WCAG 对比度，不抄实测数字：换色即换结论。 */
  const baseCss = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const cssNoCmt = stripCss(cssAll);

  function blockTokens(sel) {
    const m = baseCss.match(new RegExp(sel + "\\s*\\{([^}]*)\\}"));
    if (!m) return null;
    const o = {};
    for (const kv of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) o[kv[1]] = kv[2].trim();
    return o;
  }
  const rootT = blockTokens(":root") || {};
  const chan = (h) => {
    const p = h.replace("#", "");
    const s = (p.length === 3 ? p.split("").map((c) => c + c) : p.match(/../g)).slice(0, 3)
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const resolve = (name, T) => {
    let v = T[name] || rootT[name];
    if (!v) return null;
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref) v = T[ref[1]] || rootT[ref[1]] || null;
    return v && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : null;
  };
  const ratio = (fg, bg) => {
    const a = chan(fg), b = chan(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const SURFACES = ["--bg", "--bg-panel", "--bg-elev", "--bg-hover"];

  for (const theme of ["dark", "light"]) {
    const T = blockTokens(`html\\[data-theme="${theme}"\\]`);
    if (!T) { ok(false, `base.css 里有 ${theme} 主题令牌块`); continue; }
    const surfaces = SURFACES.map((s) => resolve(s, T)).filter(Boolean);
    eq(surfaces.length, SURFACES.length,
       `${theme} 主题的 ${SURFACES.length} 层底色都取得到（取不到就没法算对比度，下面的门是空门）`);
    const gold = resolve("--gold", T);
    const verC = resolve("--pv-verified", T);
    const got = {};
    for (const t of PV.TIERS) {
      const c = resolve(`--pv-${t.key}`, T);
      if (!c) { ok(false, `${theme} 主题定义了 --pv-${t.key}（TIERS 有「${t.label}」却无对应字色）`); continue; }
      // 最差底色 = 对比度最低的那层：标签在四五种面板上都会出现，不能只挑友好的量
      let worst = surfaces[0], wr = Infinity;
      const rs = [];
      for (const s of surfaces) { const r = ratio(c, s); rs.push(r); if (r < wr) { wr = r; worst = s; } }
      got[t.key] = rs;
      ok(wr >= 4.5,
         `${theme} 主题「${t.label}」字色 ${c} 在最差底色 ${worst} 上 ${wr.toFixed(2)}:1 ≥ 4.5:1` +
         `（10px 小字的 AA 线；低于它=读者看不清「凭什么信这条」）`);
      if (t.key !== "verified") {
        // 真正的约束是「没人借用认证色」，不是「认证色必须等于金」——
        // 宣纸底上金箔只有 2.2:1，已核那枚早换成了同色相深琥珀
        eq(c.toLowerCase() === (verC || "").toLowerCase(), false,
           `--pv-${t.key} 不得等于已核字色 ${verC}（未核条目借用认证内容的视觉权威，标签就白写了）`);
        eq(gold && c.toLowerCase() === gold.toLowerCase(), false,
           `--pv-${t.key} 不得等于正典金 ${gold}（同上：金是本项目的认证色）`);
      }
    }
    if (got.locatable && got.titled && got.unsourced) {
      for (let i = 0; i < surfaces.length; i++) {
        const lo = got.locatable[i], hi = Math.max(got.titled[i], got.unsourced[i]);
        ok(lo >= hi,
           `${theme} 底色 ${surfaces[i]} 上「可定位」不比两档弱溯源更淡（${lo.toFixed(2)} ≥ ${hi.toFixed(2)}）` +
           `：越靠上越实，反之读者会把最该看清的一档读成注脚`);
      }
      eq(new Set(PV.TIERS.map((t) => resolve(`--pv-${t.key}`, T))).size, PV.TIERS.length,
         `${theme} 主题四档字色互不相同（两档同色=色盲之外还少了灰阶截图下也分不清）`);
    }
  }

  /* 样式必须真的接上令牌：写死 hex 会绕过上面整套量出来的对比度 */
  for (const t of PV.TIERS) {
    const rule = cssNoCmt.match(new RegExp("\\." + t.cls + "\\s*\\{([^}]*)\\}", "m"));
    ok(!!rule, `css 里有 .${t.cls} 规则（TIERS 声明了「${t.label}」却无人上色 = 四档标签长得一样）`);
    if (rule) ok(new RegExp("color:\\s*var\\(--pv-" + t.key + "\\)").test(rule[1]),
                 `.${t.cls} 的字色取自自己的 var(--pv-${t.key})（写死 hex 或串档=上面的对比度门管不到它）`);
  }
  ok(/\.pv\s*\{[^}]*border:[^;}]*currentcolor/i.test(cssNoCmt),
     ".pv 的描边跟随字色（曾固定 --rule 打底，实测「可定位」的边只剩 1.4:1，外壳等于没画）");
  ok(/\.pv-unsourced\s*\{[^}]*dashed/.test(cssNoCmt) && /\.pv-titled\s*\{[^}]*dashed/.test(cssNoCmt),
     "两档弱溯源用虚线边框（色彩之外还有一条形状通道，色盲与灰阶截图下仍可辨）");

  /* ---------- 投稿界面的字色与层级（#40） ----------
   * 本轮新增 --link/--warn/--gold-text 与整套 .contrib* 样式，起因正是「点缀色当字色，
   * 宣纸底上只剩 1.9:1」。同一把尺子必须反过来盯着新写的这批，否则新界面就是下一批读不出的字。
   * 判据一律从 base.css 现算，不抄实测数字：换色即换结论。 */
  {
    const TEXT_TOKENS = ["--link", "--warn", "--gold-text", "--ink-soft"];
    const rules = [];
    for (const m of cssNoCmt.matchAll(/[^{}]*\{[^}]*\}/g)) {
      const brace = m[0].indexOf("{");
      const sel = m[0].slice(0, brace).trim().replace(/\s+/g, " ");
      const body = m[0].slice(brace + 1, -1);
      const colors = [...body.matchAll(/(?:^|[;{])\s*color:\s*var\((--[\w-]+)\)/g)].map((c) => c[1]);
      if (!colors.length) continue;
      if (!(sel.includes(".contrib") || /\.cf\b/.test(sel) || sel.includes(".ep-we") ||
            sel.includes(".beian") || sel.includes(".d-hint") ||
            colors.some((c) => TEXT_TOKENS.includes(c)))) continue;
      rules.push([sel, colors]);
    }
    ok(rules.length >= 8,
       `投稿界面的字色规则扫得到 ${rules.length} 条（少于 8 条=选择器切片失效，下面全在空转）`);
    ok(rules.some(([s]) => s.includes(".ep-we")),
       "开场题记收束行 .ep-we 也在这份字色清单里（漏出清单=给它换任何字色都不会让本门变红）。" +
       /* 与 .beian 同：它当下走 --ink-soft，而 --ink-soft 已在 TEXT_TOKENS 里，所以选择器条件
        * 是第二重保护——日后它换成清单外的令牌时靠这一条兜住。对应的 meta 用例因此改打
        * 「字色写成死值」这个真实形态（脱令牌即从 color: var(...) 的扫描里静默脱落）。 */
       "");
    ok(rules.some(([s]) => s.includes(".beian")),
       "备案号链接 .beian 也在这份字色清单里（漏出清单=日后把它换成任何字色都不会让本门变红）。" +
       /* 双重保护：它当下走 --link，而 --link 本身在 TEXT_TOKENS 里——只删上面那个选择器条件不会
        * 变红。所以 test-gates-meta 里对应的用例打在「css 删掉 color 声明」这个真实缺陷形态上。 */
       "");
    ok(rules.some(([s]) => s.includes(".d-hint")),
       "详情「此后」的口径说明 .d-hint 也在这份字色清单里（漏出清单=日后把它换成 --ink-faint 这类淡色不会让本门变红）。" +
       /* 同上双重保护：它当下走 --ink-soft，而 --ink-soft 本身在 TEXT_TOKENS 里，所以只删
        * 上面那个选择器条件不会变红——真正盯的是「换成清单外的淡色」这个缺陷形态，
        * 由 test-gates-meta 里对应哨兵打中。 */
       "");
    for (const theme of ["dark", "light"]) {
      const T = blockTokens(`html\\[data-theme="${theme}"\\]`);
      const surfaces = SURFACES.map((s) => resolve(s, T)).filter(Boolean);
      eq(surfaces.length, SURFACES.length,
         `${theme} 的 ${SURFACES.length} 层底色都取得到（取不到就没法算对比度，上面的门就成了空门）`);
      for (const [sel, colors] of rules) {
        for (const tok of new Set(colors)) {
          const c = resolve(tok, T);
          if (!c) { ok(false, `${theme} 主题下 ${tok} 解析不出具体色值（${sel} 用了它）`); continue; }
          let wr = Infinity, worst = "?";
          for (const s of surfaces) { const r = ratio(c, s); if (r < wr) { wr = r; worst = s; } }
          ok(wr >= 4.5,
             `${theme}「${sel}」字色 ${tok}=${c} 在最差底色 ${worst} 上 ${wr.toFixed(2)}:1 ≥ 4.5:1` +
             `（低于 AA 线 = 这条界面的字等于没画）`);
        }
      }
    }
    /* 回写禁令：点缀色只能做边、做底。一旦重新拿它当字色，上面量出来的全部作废。 */
    for (const t of ["gold", "cn-soft"]) {
      const hits = [...cssNoCmt.matchAll(new RegExp("(?:^|[;{])\\s*color:\\s*var\\(--" + t + "\\)", "gm"))];
      eq(hits.length, 0,
         `css 里没有 color: var(--${t})（装饰色当字色正是本轮修掉的缺陷本体；要字色走 --gold-text/--link/--warn）`);
    }
  }

  /* ---------- 投稿弹窗的层级：入口在被盖住的那两层里 ---------- */
  {
    const escSel = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const zof = (sel) => {
      const m = cssNoCmt.match(new RegExp(escSel(sel) + "\\s*\\{[^}]*z-index:\\s*(\\d+)"));
      return m ? Number(m[1]) : null;
    };
    const Z = { contrib: zof(".contrib-modal"), detail: zof(".detail"), river: zof(".river"), boot: zof("#boot") };
    const missing = Object.keys(Z).filter((k) => Z[k] === null);
    eq(missing.join(","), "", `四层的 z-index 都读得到（缺 ${missing.join(",")}：读不到就没法比大小）`);
    if (!missing.length) {
      ok(Z.contrib > Z.detail && Z.contrib > Z.river,
         `投稿弹窗(${Z.contrib})压在详情(${Z.detail})与长河(${Z.river})之上——投稿按钮就在这两层里，被盖住等于没有入口`);
      ok(Z.contrib < Z.boot,
         `投稿弹窗(${Z.contrib})仍在启动遮罩(${Z.boot})之下：数据没落地之前不该有可填的表单`);
    }
  }
}

/* ============ 筛选键的单点口径：passesFilter 读什么，重画就认什么 ============
 * passesFilter 是六个界面共用的取用口径，而「哪些变化要重画」从前每个文件抄一份：
 * 长河抄漏 provFloor（实测：门槛拉到仅已核，河里仍画着未核节点），对照干脆没订阅。
 * 现在判据集中在 state.js 的 FILTER_KEYS，这里做三件事：
 *   ① 清单与函数体逐键对账（同文件也会各自演化）；
 *   ② 真的改一次状态，问 filterChanged 判不判真（不靠读代码相信）；
 *   ③ 禁止任何 passesFilter 消费者再手抄筛选键清单。 */
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const stSrc = stripC(read("js/state.js"));
  const pfBody = /function passesFilter\(ev\)\s*\{[\s\S]*?\n  \}/.exec(stSrc);
  const fkBody = /var FILTER_KEYS\s*=\s*\{([^}]*)\}/.exec(stSrc);
  ok(!!pfBody && !!fkBody,
     `state.js 里切得出 passesFilter 与 FILTER_KEYS（实得 pf=${!!pfBody} fk=${!!fkBody}：切不出则下面全在空转）`);
  if (pfBody && fkBody) {
    const READ = [...new Set((pfBody[0].match(/state\.([A-Za-z]\w*)/g) || []).map((s) => s.slice(6)))].sort();
    const DECL = (fkBody[1].match(/([A-Za-z_]\w*)\s*:/g) || []).map((s) => s.split(":")[0]).sort();
    eq(READ.join(","), "dims,provFloor,range,tracks,weightFloor",
       `passesFilter 实际读取的键为五个（实得 ${READ.join(",")}）——判据本身变了必须在这里重新评审`);
    eq(DECL.join(","), READ.join(","),
       `FILTER_KEYS 恰等于 passesFilter 读到的键（表=${DECL.join(",")} 函数=${READ.join(",")}：表少一个键=那类筛选改了不重画）`);
    eq(DECL.includes("view"), false,
       "FILTER_KEYS 不含 view：视窗在拖拽/缩放时每帧 emit，认它等于每帧把读者正看着的一屏抽回顶部");

    // ② 行为面：真改一次状态，看回调拿到的 changed 会不会被判成「要重画」
    const last = {};
    S.subscribe(function (s, ch) { last.ch = ch; });
    const before = S.get().provFloor;
    S.patch({ provFloor: before === 3 ? 0 : 3 });
    eq(S.filterChanged(last.ch), true, `真把 provFloor 由 ${before} 改到 ${S.get().provFloor} → filterChanged 判真`);
    S.patch({ provFloor: before });                       // 复原：后面的断言不能继承这条用例改过的门槛
    const before2 = S.get().theme;
    S.patch({ theme: before2 === "dark" ? "light" : "dark" });
    eq(S.filterChanged(last.ch), false, "只换主题不触发重画（与筛选无关的键混进清单=抽屉无端重绘）");
    S.patch({ theme: before2 });
    last.ch = {};
    eq(S.filterChanged(last.ch), false, "changed 为空时判假（正例对照，防 filterChanged 恒真）");

    // ③ 消费者侧：按 passesFilter 挑条目的界面，不许再出现第二份筛选键清单
    const consumers = fs.readdirSync(path.join(ROOT, "js"))
      .filter((f) => f.endsWith(".js") && f !== "state.js")
      .filter((f) => /S\.passesFilter/.test(stripC(read("js/" + f))))
      .sort();
    ok(consumers.length >= 4, `按 passesFilter 挑条目的界面文件应有若干（实得 ${consumers.join(",")}：清单为空则下面的检查是假的）`);
    let shared = 0;
    for (const f of consumers) {
      const src = stripC(read("js/" + f));
      const i = src.indexOf("S.subscribe(");
      ok(i > -1, `${f} 按 passesFilter 挑条目却没有订阅状态变化（改完筛选它仍停在旧内容上）`);
      if (i < 0) continue;
      const body = src.slice(i, i + 500);
      if (/S\.filterChanged\(/.test(body)) shared++;
      const hand = (body.match(/\bch\.(tracks|dims|weightFloor|provFloor|range)\b/g) || []);
      eq(hand.length, 0, `${f} 的订阅里不得手抄筛选键（实得 ${hand.join(",")}）：漏抄哪个键，哪类条目就改完不重画`);
    }
    eq(shared >= 3, true, `至少三处走共用判据 filterChanged（实得 ${shared} 处：一处都没有说明清单仍在各自抄）`);
  }
}

/* ============ 冷启动的取片预算：首屏只取看得见的那几片 ============
 * 这段盯的是一个只在上线后才现形的账：54 个文件、1.7 MB（brotli）压在「进入长河」
 * 之前，本地双击 file:// 完全察觉不到，公网首访就是每个新访客的第一屏等待。
 * 而「首屏只取局部」极易做成「永远只取局部」，所以补齐的调用点与深链兜底一并点名。
 * 取片顺序与失败重试的行为判据在加载器夹具那段（⑦–⑩），这里只核对线。 */
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const app = stripC(read("js/app.js"));
  const bootBody = app.slice(app.indexOf("function boot()"));
  const readyAt = bootBody.indexOf("ready: true");
  ok(readyAt > 0, "切得出 boot() 且其中置过 ready（切不出则下面的顺序断言全在空转）");
  const head = bootBody.slice(0, readyAt);
  eq(/L\.ensureAll\(\)/.test(head), false,
     "ready 之前不得再等全量分片（那 54 个文件就是把首屏等待摊给每个新访客）");
  ok(/L\.ensureRange\(/.test(head), "ready 之前确实取了视窗那几片（视窗优先≠不取数据）");
  ok(/topUpOnIdle\(\)/.test(bootBody.slice(readyAt)),
     "ready 之后真的安排了后台补齐（只在函数里定义却无人调用=补齐永不发生，全站只剩首屏那几片）");
  ok(/function topUpOnIdle\([^)]*\)[\s\S]*?L\.ensureRest\(/.test(app),
     "topUpOnIdle 调的是 ensureRest（空函数或只更新状态栏都不算补片）");
  ok(/function topUpOnIdle\([^)]*\)[\s\S]*?requestIdleCallback[\s\S]*?else setTimeout\(/.test(app),
     "没有 requestIdleCallback 的浏览器也要补（Safari 走 else 分支，否则「视窗优先」退化成永远只补一半）");
  /* 判死之后还得有第二条路：托管上线后 28/29 片就是这样红的——看门狗到点报错没错，
   * 错在报完错全站再也没取过它们一次。所以「一轮跑完仍有缺片」必须自己排下一轮。 */
  ok(/function topUpOnIdle\([^)]*\)[\s\S]*?failedChunks\(\)[\s\S]*?topUpOnIdle\(round \+ 1\)/.test(app),
     "一轮补齐后仍有缺片必须再排一轮（只看这一轮返回了几条新增，分不清「没有缺片」和「缺了也不管」）");
  ok(/round \+ 1 < TOPUP_MAX_ROUNDS/.test(app),
     "重试轮数必须有上限（真缺文件那片每轮都红，无上限等于挂一个永久的后台定时器）");

  /* 补齐完成必须有渲染者：长河顶部写着「数据仅载入 x/y 片」，无人刷新就会在全片落地后继续自称不完整 */
  const river = stripC(read("js/river.js"));
  ok(/addEventListener\("chronicle:rest"[\s\S]{0,60}render\(\)/.test(river),
     "长河接住 chronicle:rest 并刷新一次（派发无人接=那句话过期成假话）");
  const restFiles = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"))
    .filter((f) => /chronicle:rest/.test(stripC(read("js/" + f))));
  eq(restFiles.length >= 2, true,
     `chronicle:rest 既要有派发方也要有接收方（实得 ${restFiles.join(",") || "无"}：只派发不接=那句话过期成假话）`);

  /* 深链兜底：先看到局部不能变成「点进深链也只看到局部」 */
  const deep = [["js/router.js", 2], ["js/themes.js", 1], ["js/detail.js", 1]];
  for (const [f, min] of deep) {
    const n = (stripC(read(f)).match(/L\.ensureAll\([^)]*\)|ChronLoader\.ensureAll\([^)]*\)/g) || []).length;
    ok(n >= min, `${f} 的深链入口仍须自带 ensureAll 兜底（实得 ${n} 处，至少 ${min} 处）：` +
       `条目 id 与检索命中的分片很可能不在首屏视窗内`);
  }

  /* 进门落在长河：遮罩上那颗按钮写的是「进 入 长 河」，点完的首屏就必须真的是长河，
   * 而不是把文案当修辞、把读者交给星点画布。但带深链进来时不许改写地址栏——
   * 那等于把他转发的那条链接降级成了首页。 */
  const atEnter = app.indexOf("function enter()");
  const atBind = app.indexOf('b.addEventListener("click", enter)');
  ok(atEnter > 0 && atBind > atEnter, "切得出 armEnter 里的 enter() 与它的绑定（切不出则下面两条全在空转）");
  const enterBody = atEnter > 0 && atBind > atEnter ? app.slice(atEnter, atBind) : "";
  ok(/go\("#\/river"\)/.test(enterBody),
     "点击「进入长河」要落到长河视图（题记按钮与实况不符，且新访客第一眼看到的是装饰不是内容）");
  ok(/location\.hash/.test(enterBody),
     "落到长河之前要先读地址栏（无条件改写会把 #/event 深链的读者拽回总览，转发链接等于失效）");
}

/* ============ compare.js：关联边去重与「跨线一条都不许被挤掉」 ============
 * 这道门是 2026-09-22 浏览器实测补上的：对照视图的标题写着「跨线关联」，
 * 列表却是全部 related 按插入顺序截前 10 条——59 个有跨线边的年份里 32 年的
 * 跨线边被同轨边整年挤出可见列表，新落的 160 条跨轨边有一半在界面上等于不存在。
 * 光看代码看不出来（它不报错、也不产出错误数据，只是少显示），所以必须写成门。
 * 断言全部从真实语料推导，不硬编码年份或 id；压力夹具负责证明「旧写法会红」。 */
{
  const byId = new Map();
  for (const sub of ["cn", "wd"]) {
    for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
      const w = { window: {} };
      new Function("window", fs.readFileSync(path.join(ROOT, "data", sub, n), "utf8"))(w.window);
      for (const e of Object.values(w.window.__CHRONICLE_CHUNK)[0]) byId.set(e.id, e);
    }
  }
  const savedLoader = window.ChronLoader;
  /* 夹具事件也要能被 eventById 解析到，否则 relLinks 拿到的 related 全是 null，
   * 用例看着红了其实红在桩上——真值与夹具共用这张表。 */
  const fixture = new Map();
  window.ChronLoader = { eventById: (id) => byId.get(id) || fixture.get(id) || null };
  new Function("window", "document", fs.readFileSync(path.join(ROOT, "js/compare.js"), "utf8"))(
    window, global.document);
  const CMP = window.ChronCompare;
  ok(typeof CMP.relLinks === "function", "compare.js 必须把 relLinks 暴露给门禁（闭包内=不可验）");

  const pairKey = (p) => [p.from.id, p.to.id].sort().join("|");
  const byYear = new Map();
  for (const e of byId.values()) {
    if (!byYear.has(e.year)) byYear.set(e.year, []);
    byYear.get(e.year).push(e);
  }
  let lostCross = 0, dupPairs = 0, mixed = 0, truncYears = 0, maxCross = 0, scanned = 0;
  for (const evs of byYear.values()) {
    const got = CMP.relLinks(evs);
    /* 独立重算一遍真值（不走被测代码的路径）：该年事件涉及的所有无向对里跨线的部分 */
    const want = new Set();
    for (const e of evs) for (const rid of (e.related || [])) {
      const r = byId.get(rid);
      if (r && r.id !== e.id && r.track !== e.track) want.add([e.id, rid].sort().join("|"));
    }
    const gotCross = new Set(got.cross.map(pairKey));
    for (const k of want) if (!gotCross.has(k)) lostCross++;
    for (const k of gotCross) if (!want.has(k)) mixed++;         // 同轨边混进跨线块
    if (new Set([...got.cross, ...got.same].map(pairKey)).size !== got.cross.length + got.same.length) dupPairs++;
    maxCross = Math.max(maxCross, got.cross.length);
    if (got.cross.length > CMP.CROSS_MAX) truncYears++;
    scanned++;
  }
  eq(lostCross, 0, `真实语料：跨线关联边一条都不许丢（逐年重算比对，扫 ${scanned} 个年份）`);
  eq(mixed, 0, "真实语料：同轨边不得混入跨线块（标题声称跨线，内容就必须全是跨线）");
  eq(dupPairs, 0, "真实语料：related 双向落库，无向对不得在界面上排成两行");
  eq(truncYears, 0, `真实语料：跨线块上限 ${CMP.CROSS_MAX} 必须容得下每一年（年度峰值 ${maxCross}）`);

  /* 压力夹具：跨线 6 条 + 同轨 200 条、全部双向落库。
   * 这正是旧 bug 的形状——同轨边一多，按插入顺序截断就会把跨线边整年挤掉。
   * 没有这一支，上面的断言在 CROSS_MAX=1 下照样全绿（真实年份跨线峰值才 6）。
   * 其中 rw/cn 那一对只在世界轨一端单向落库且该端权重更低：orient 失效时
   * 行首会变成低权重的世界轨事件，这条断言就是钉它的。 */
  const mk = (id, track, year, weight, related) =>
    ({ id, track, year, weight, dim: "politics", title: id, summary: "", detail: {}, related });
  const anchor = mk("cn--2000--a01", "cn", 2000, 5);
  const crossIds = Array.from({ length: 5 }, (_, i) => `world--200${i}--x0${i}`);
  const sameIds = Array.from({ length: 200 }, (_, i) => `cn--2000--s${String(i).padStart(3, "0")}`);
  const rw = mk("world--2000--r01", "world", 2000, 3, ["cn--2000--h01"]);
  const cnHeavy = mk("cn--2000--h01", "cn", 2000, 5, []);
  const evs = [
    anchor,
    ...crossIds.map((id, i) => mk(id, "world", 2000 + i, 4, [anchor.id])),
    ...sameIds.map((id) => mk(id, "cn", 2000, 2, [anchor.id])),
    rw, cnHeavy,
  ];
  anchor.related = [...crossIds, ...sameIds];
  for (const e of evs) fixture.set(e.id, e);
  const st = CMP.relLinks(evs);
  eq(st.cross.length, 6, "压力夹具：6 条跨线边必须在跨线块里全部现身（同轨边不得挤掉）");
  eq(st.same.length, 200, "压力夹具：200 条同轨边按无向去重后仍是 200（双向落库不翻倍）");
  eq(st.cross.slice(0, CMP.CROSS_MAX).length, 6, "压力夹具：跨线块渲染前不截断（截断须配显式计数）");
  const rev = st.cross.find((p) => pairKey(p) === "cn--2000--h01|world--2000--r01");
  eq(rev && rev.from.id, "cn--2000--h01", "压力夹具：反向落库的边也要把权重高的一端排在行首（行序不取决于落库顺序）");
  eq(st.cross[0].from.weight >= st.cross[st.cross.length - 1].from.weight, true,
    "压力夹具：跨线块按权重降序，最该看见的对照线在最前");

  window.ChronLoader = savedLoader;
}

/* ============ 投稿通道（#40）：记录能出去，等级出不去 ============
 * 本站无后端，「投稿」= 把一条结构化记录送到公开处。整段只盯一件事：
 * 出口里不能出现等级字段——做不到，第一个投稿的人就是第一个给自己盖章的人。
 * 期望值一律由 ChronContribute 的导出、validate 的禁令清单与 __CHRONICLE_META 现推：
 * KINDS 加一类、维度改名、年份范围调整，下面的用例自动跟着变，不抄手抄的清单。 */
{
  const CC = window.ChronContribute;
  ok(!!CC, "js/contribute.js 在垫片里求值成功并挂出 ChronContribute");
  const noCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const src = noCmt(fs.readFileSync(path.join(ROOT, "js/contribute.js"), "utf8"));
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  /* 同上：字色与层级的扫描域按磁盘现取，新增 css 文件不会落在监视之外。 */
  const cssAll2 = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(ROOT, "css", f), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  /* ---------- 模块接线：孤儿文件等于功能不存在 ---------- */
  {
    const jsFiles = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();
    const orphans = jsFiles.filter((f) => !indexHtml.includes('src="js/' + f + '"'));
    eq(orphans.join(","), "", `js/ 下每个模块都被 index.html 引用（${orphans.join(",")} 是孤儿：写好了没上线）`);
    const refs = [...indexHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    eq(refs.length > 0, true, `index.html 的 script 引用解析得到（实得 ${refs.length} 条：解析不到 = 这条门空转）`);
    const missing = refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
    eq(missing.join(","), "", `每条 script src 都指向真实文件（${missing.join(",")} 会在 file:// 下静默 404）`);

    /* css 同一条门：上面几处把扫描域改成「磁盘现取」之后，一个没被 index.html 链接的
     * css 文件会被量到对比度、却在页面上根本不生效——绿灯与可见是两件事。 */
    const cssFiles = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css")).sort();
    const orphanCss = cssFiles.filter((f) => !indexHtml.includes('href="css/' + f + '"'));
    eq(orphanCss.join(","), "", `css/ 下每个样式表都被 index.html 链接（${orphanCss.join(",")} 是孤儿：写好了没上线）`);
    const cssRefs = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
    eq(cssRefs.length > 0, true, `index.html 的 stylesheet 引用解析得到（实得 ${cssRefs.length} 条：解析不到 = 这条门空转）`);
    const cssGone = cssRefs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
    eq(cssGone.join(","), "", `每条 stylesheet href 都指向真实文件（${cssGone.join(",")} 会让整层没有样式）`);
  }

  /* ---------- 收起的层必须真的收起（[hidden] 与 display 的权重账） ---------- */
  /* 浏览器 UA 样式表里有 [hidden]{display:none}，但它是「作者样式之外的最低一档」：
   * 只要本层有一条 .某层 { display:flex } 与之同权重（一个类 = 一个属性选择器），
   * 作者那条就赢，于是 JS 把 hidden 翻成 true 之后，面板照样画在屏幕上、照样吃点击。
   * 这类缺陷在代码评审里看不见（JS 写对了），只有量 computed style 才露出来，
   * 所以这里用同一份账静态复算一遍：js 里被 .hidden= 切换的层 ∩ css 里带非 none
   * display 的层 ⊆ 带 [hidden]{display:none} 兜底的层。 */
  {
    const jsFiles = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();
    const toggled = new Map(); // class -> 哪个模块用它切 hidden
    for (const f of jsFiles) {
      const s = noCmt(fs.readFileSync(path.join(ROOT, "js", f), "utf8"));
      // 面板都靠 element.className = "某层" 立起来；先建 变量→类 的账，再找谁被 hidden 切换
      const varCls = new Map();
      for (const m of s.matchAll(/(?:^|[^\w.])(\w+)\.className\s*=\s*"([^"]+)"/g)) {
        if (!varCls.has(m[1])) varCls.set(m[1], new Set());
        for (const c of m[2].trim().split(/\s+/)) varCls.get(m[1]).add(c);
      }
      for (const m of s.matchAll(/(?:^|[^\w.])(\w+)\.hidden\s*=/g))
        for (const c of (varCls.get(m[1]) || [])) if (!toggled.has(c)) toggled.set(c, f);
    }
    const seen = [...toggled.keys()].sort();
    ok(seen.length >= 8,
      `解析得到 ${seen.length} 个靠 hidden 收起的层（太少=变量名换了、这条门空转：${seen.join(",")}）`);

    const declsOf = new Map(); // 选择器 -> display 值
    const hiddenGuarded = new Set();
    for (const m of cssAll2.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const d = /(?:^|;)\s*display\s*:\s*([a-z-]+)/.exec(m[2]);
      for (const sel of m[1].split(",").map((x) => x.trim())) {
        const base = /^\.([A-Za-z][\w-]*)$/.exec(sel);
        if (base && d && d[1] !== "none") declsOf.set(base[1], d[1]);
        const g = /^\.([A-Za-z][\w-]*)\[hidden\]$/.exec(sel);
        if (g && d && d[1] === "none") hiddenGuarded.add(g[1]);
      }
    }
    const painted = seen.filter((c) => declsOf.get(c) && declsOf.get(c) !== "none");
    ok(painted.length >= 6,
      `其中 ${painted.length} 个层自带非 none 的 display（这是本门的真正射程：${painted.join(",")}）`);
    const exposed = painted.filter((c) => !hiddenGuarded.has(c));
    eq(exposed.join(","), "",
      `每个「用 hidden 收起、自己又声明了 display」的层都有 [hidden]{display:none} 兜底` +
      `（${exposed.map((c) => "." + c + "{" + declsOf.get(c) + "}").join(" ")} 关掉后仍会盖住整页并拦截点击）`);
    /* 反向也要成立：写了兜底却没人用 hidden 切它，说明账对不上（改名或误加） */
    const staleGuard = [...hiddenGuarded].filter((c) => !toggled.has(c)).sort();
    eq(staleGuard.join(","), "", `每条 [hidden] 兜底都对应一个真用 hidden 切换的层（${staleGuard.join(",")} 是空写的账）`);
  }

  /* ---------- 数据在路上时按下的「关」不能丢（迟到 open 把面板掀回来） ---------- */
  /* 这类层先 return 一个 Promise 再在 .then 里 hidden=false：加载期间用户按 Esc、
   * 点别的层或走路由，那些 close() 都会因为「面板还藏着」而直接 return，
   * 于是晚一步到货的 open 把面板画在读者已经离开的页面上——上面那条 [hidden] 门
   * 反而让它更明显（现在整层是 flex 全屏）。判据：每个 .then 块里 hidden=false
   * 之前必须先问一次「用户还要不要它开着」。 */
  {
    const thenBodies = (s) => {
      const out = [];
      const re = /\.then\(\s*function[^{]*\{/g;
      let m;
      while ((m = re.exec(s))) {
        let i = m.index + m[0].length, depth = 1;
        while (i < s.length && depth > 0) {
          if (s[i] === "{") depth++;
          else if (s[i] === "}") depth--;
          i++;
        }
        out.push(s.slice(m.index + m[0].length, i - 1));
      }
      return out;
    };
    const asyncLayers = [];
    const jsAll = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();
    for (const f of jsAll) {
      const s = noCmt(fs.readFileSync(path.join(ROOT, "js", f), "utf8"));
      for (const b of thenBodies(s)) {
        if (!/\.hidden\s*=\s*false/.test(b)) continue;
        asyncLayers.push({ file: f, bail: /if\s*\(\s*!\s*wantOpen\s*\)\s*return/.test(b) });
      }
    }
    ok(asyncLayers.length >= 3,
      `解析到 ${asyncLayers.length} 个「异步到货才显形」的面板（少于 3 个 = 扫描域退化了，这条门空转）`);
    const unprotected = asyncLayers.filter((a) => !a.bail).map((a) => a.file);
    eq(unprotected.join(","), "",
      `每个异步打开的面板都在 hidden=false 前问过「用户还要不要它开着」` +
      `（${unprotected.join(",") || "无"} 的 close() 在加载期是空转的：关掉的东西会自己弹回来）`);
    const flagFiles = [...new Set(asyncLayers.map((a) => a.file))];
    /* 声明行 `var wantOpen = false;` 不算「把旗放下」：只置真不清真的旗，
     * 初值反而是这条门最容易误以为通过的地方。 */
    const noClear = flagFiles.filter((f) => {
      const s = noCmt(fs.readFileSync(path.join(ROOT, "js", f), "utf8"))
        .replace(/\bvar\s+wantOpen\s*=\s*false\s*;/g, "");
      return !/wantOpen\s*=\s*false/.test(s);
    });
    eq(noClear.join(","), "",
      `每个用了 wantOpen 的文件都有一处把它清成 false（只置真不清真的旗等于永远开着：${noClear.join(",")}）`);
  }

  /* ---------- 关掉一层，地址栏也得跟着离开（hash 与可见层的配对账） ---------- */
  /* 每条 #/xxx 都能把对应那层叫出来，所以「层收了、地址还写着它」一定会在刷新时
   * 兑现成「关不掉的层」。名单不抄文档：路由名从 router.js 的 parse() 现取，
   * 每条路由叫了哪个模块顺着 apply() 的分支现取，模块落在哪个文件按
   * window.Chron* = 现取——router 加一条路由，本门自动多扫一层，文档不用跟着改。 */
  {
    const braceBody = (s, openIdx) => {
      let i = openIdx, depth = 0;
      const start = openIdx + 1;
      for (; i < s.length; i++) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}") { depth--; if (!depth) break; }
      }
      return s.slice(start, i);
    };
    const routerSrc = noCmt(fs.readFileSync(path.join(ROOT, "js/router.js"), "utf8"));
    const routeNames = [...new Set([...routerSrc.matchAll(/return\s*\{\s*name:\s*"([a-z]+)"/g)].map((m) => m[1]))];
    ok(routeNames.length >= 6,
      `parse() 里现取到 ${routeNames.length} 个路由名（少于 6 = 扫描域退化：${routeNames.join(",")}）`);

    const owner = new Map(); // ChronXxx -> js 文件
    const jsHash = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js")).sort();
    for (const f of jsHash)
      for (const m of noCmt(fs.readFileSync(path.join(ROOT, "js", f), "utf8")).matchAll(/window\.(Chron[A-Z][A-Za-z]*)\s*=/g))
        if (!owner.has(m[1])) owner.set(m[1], "js/" + f);
    ok(owner.size >= 20, `解析到 ${owner.size} 个 window.Chron* 模块（少于 20 = 名单取空了，这条门空转）`);

    /* 路由 → 这一条叫开的层。分支里只读 .close() 的模块不算被这条路由打开。 */
    const openedByRoute = new Map();
    for (const name of routeNames) {
      const at = routerSrc.indexOf('r.name === "' + name + '"');
      if (at < 0) continue;
      const body = braceBody(routerSrc, routerSrc.indexOf("{", at));
      const mods = [...new Set([...body.matchAll(/\b(Chron[A-Z][A-Za-z]*)\.([A-Za-z]\w*)/g)]
        .filter((m) => m[2] !== "close")
        .map((m) => owner.get(m[1]) || "路由叫了不在任何文件里的模块：" + m[1]))];
      openedByRoute.set(name, mods);
    }
    const missingOwner = [...openedByRoute.values()].flat().filter((f) => !f.startsWith("js/"));
    eq(missingOwner.join(","), "", `apply() 里点名的模块都能按 window.Chron* 归到文件（${missingOwner.join(",") || "无"}）`);

    /* 只审「有 close()、且 close() 真的在收一块面板」的层；时间轴那种没有 close 的跳过 */
    const checked = [];
    for (const [name, files] of [...openedByRoute].sort()) {
      for (const f of files) {
        if (!f.endsWith(".js")) continue; // 归不到文件的已由上面那条 eq 点名
        const s = noCmt(fs.readFileSync(path.join(ROOT, f), "utf8"));
        const at = s.indexOf("function close(");
        if (at < 0) continue;
        const body = braceBody(s, s.indexOf("{", at));
        if (!/\.hidden\s*=\s*true|classList\.remove\("open"\)/.test(body)) continue;
        if (checked.some((c) => c.file === f)) continue;
        checked.push({ file: f, route: name, resets: /resetHash\(|location\.hash\s*=|history\.replaceState/.test(body) });
      }
    }
    ok(checked.length >= 5,
      `审到 ${checked.length} 层「路由能叫开、close() 又真的在收面板」（少于 5 = 判据空转：${checked.map((c) => c.file).join(",")}）`);
    const loose = checked.filter((c) => !c.resets);
    eq(loose.map((c) => c.file + "(#/" + c.route + ")").join(","), "",
      `每条路由叫开的那一层，close() 都把地址也收掉（${loose.map((c) => c.file + " 的 #/" + c.route).join(",") || "无"}：` +
      `关了刷新就自己弹回来，读者只当刚才没关掉）`);
  }

  /* ---------- 三入口各有活人落点，且落点只说得出 KINDS 里的类型 ---------- */
  {
    const kinds = Object.keys(CC.KINDS);
    eq(kinds.join(","), "source,check,event",
       `投稿类型就是这三类（实得 ${kinds.join(",")}：加一类必须同时给它入口、字段表与判据）`);
    const barHtml = CC.bar(CONTRIB_FIXTURES[0]);
    for (const k of kinds) {
      const inBar = barHtml.includes('data-contrib="' + k + '"');
      const inPage = k === "event" ? /data-contrib-new/.test(indexHtml) && /openForm\("event"/.test(src) : inBar;
      ok(inPage, `「${CC.KINDS[k].label}」有真实落点（${inBar ? "详情条里的按钮" : "顶栏 data-contrib-new"}），不是只有函数）`);
    }
    const emitted = [...src.matchAll(/data-contrib="([a-zA-Z]+)"/g)].map((m) => m[1]);
    eq([...new Set(emitted)].sort().join(","), "check,source",
       `界面能发出的类型不含 KINDS 之外的野值（发出即 data-contrib 上的字面量）`);
    ok(/ChronContribute\.mount\(\)/.test(noCmt(fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8"))),
       "app.js 启动后调用 mount()——挂载写在加载期会让「能否求值」与「功能对不对」糊在一起");
    const dSrc = noCmt(fs.readFileSync(path.join(ROOT, "js/detail.js"), "utf8"));
    ok(/ChronContribute\.bar\(/.test(dSrc), "详情抽屉里画了投稿条：补出处/报核对要贴着出处块");
  }

  /* ---------- 桩必须与真导出同名单：否则改名的断链会被桩替它活着 ---------- */
  {
    const used = [...new Set([...src.matchAll(/\bL\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))].sort();
    eq(used.length > 0, true, `contribute.js 确实通过 L. 用到加载器（实得 ${used.length} 个：为 0 则下面的对账是空对账）`);
    const loaderBlock = noCmt(fs.readFileSync(path.join(ROOT, "js/loader.js"), "utf8"));
    const ex = /window\.ChronLoader\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(loaderBlock);
    ok(!!ex, "loader.js 里读得到 window.ChronLoader 的导出块（读不到就没法对账）");
    if (ex) {
      const exported = [...new Set([...ex[1].matchAll(/(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]))];
      const absent = used.filter((k) => !exported.includes(k));
      eq(absent.join(","), "", `contribute.js 用到的 ${used.join(",")} 都由 ChronLoader 真导出（${absent.join(",")} 已被改名或删除）`);
    }
  }

  /* ---------- 白名单：等级字段没有出口，不是「有出口会被拒」 ---------- */
  const TIER_BAN = new Set(JSON.parse(/const TIER_FIELDS\s*=\s*(\[[^\]]*\])/.exec(VAL_SRC)[1].replace(/'/g, '"')));
  const EXTRA_BAN = [...new Set([...TIER_BAN, "weight", "id", "related", "checks", "detail", "_chunk",
    "tier", "verified", "confidence", "provenance", "level", "source_level", "official", "certified"])];
  eq([...TIER_BAN].every((k) => EXTRA_BAN.includes(k)), true,
     `validate 的等级禁令 ${[...TIER_BAN].join(",")} 全部落在本段禁令里（清单加一项而这里没跟上=投稿通道留了个新口子）`);
  {
    const paths = (o, pre) => Object.keys(o || {}).flatMap((k) =>
      (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) ? paths(o[k], (pre || "") + k + ".") : [(pre || "") + k]);
    const junk = { target: CONTRIB_FIXTURES[0].id, locator: "《史记》卷六", note: "n", who: "张三",
      verdict: "confirm", year: -221, yearApprox: "0", track: "cn", dim: "politics",
      title: "夹具标题足够长", summary: "摘要也足够长以便通过最短限制", at: "1900-01-01" };
    for (const k of EXTRA_BAN) junk[k] = "injected";
    /* weight 的毒值必须是数字：eq() 比的是 JSON.stringify，而 NaN 会写成 null——
     * 用字符串注入时「Number(f.weight) 泄漏」这条变异与正确实现看起来一模一样（实测踩到）。 */
    junk.weight = 5;
    for (const kind of Object.keys(CC.KINDS)) {
      const rec = CC.buildRecord(kind, junk);
      /* 禁令按「带着值的键」判：weight 允许以 null 占位出现（见下面的单独断言），
       * 但只要有人给它塞了值，白名单就失守了。 */
      const leaked = paths(rec).filter((p) => EXTRA_BAN.includes(p.split(".").pop()) &&
        p.split(".").reduce((o, k) => (o == null ? o : o[k]), rec) !== null);
      eq(leaked.join(","), "",
         `${kind} 记录里塞不进任何等级/所有权字段（实漏 ${leaked.join(",")}：白名单失守=投稿人可自封）`);
      eq(rec.at, CC.todayISO(), `${kind} 记录的日期恒为提交当日（表单里没有日期栏，补填旧日期=把自己标成三年前核过）`);
      eq(/^\d{4}-\d{2}-\d{2}$/.test(rec.at), true, `${kind} 的 at 是 ISO 日期，validate 的 DATE_RE 认得`);
      eq(rec.schema, CC.SCHEMA, `${kind} 记录带 schema 版本：并档侧据此判格式`);
      for (const f of CC.formSpec(kind).fields) {
        ok(!EXTRA_BAN.includes(f.name), `表单里没有名为 ${f.name} 的字段（有=给了投稿人填等级的框）`);
      }
    }
    const ev = CC.buildRecord("event", junk);
    eq(ev.event.weight, null, "新条目的重要度恒为 null：版面由并档口径评定，不随嗓门走");
    eq(JSON.stringify(ev).includes("injected"), false, "注入的值一个都没进记录（正控制：整串 junk 确实被吃掉了）");
    eq(ev.event.sources.length, 1, "新条目带的字段叫 sources（与库内条目同名，并档时不必转换）");
    eq(CC.buildRecord("source", {}).locator, "", "缺字段不猜：空表出来的 locator 就是空串，交给 checkRecord 判废");
  }

  /* ---------- checkRecord：边界表由元数据现推，两端都要有反例 ---------- */
  {
    const mk = (o) => CC.checkRecord(CC.buildRecord("event", Object.assign(
      { year: 1900, track: "cn", dim: "politics", title: "一个足够长的标题", summary: "一句足够长的摘要说明这是哪件事" }, o)));
    const T = [
      [M.yearMin, false, "年份下界本身收录"],
      [M.yearMin - 1, true, "下界外一年拒绝"],
      [M.yearMax, false, "年份上界本身收录"],
      [M.yearMax + 1, true, "上界外一年拒绝"],
      [0, true, "没有公元 0 年（time.js 同口径）"],
      [-1, false, "前 1 年是合法年份"],
      [1, false, "公元 1 年是合法年份"],
      [1990.5, true, "非整数年份拒绝"],
      ["1990", false, "数字字符串由 buildRecord 归一后收录"],
      ["abc", true, "非数字年份拒绝"],
    ];
    let green = 0, red = 0;
    for (const [y, wantErr, name] of T) {
      const errs = mk({ year: y });
      eq(errs.length > 0, wantErr, `${name}（实得 ${JSON.stringify(errs)}）`);
      wantErr ? red++ : green++;
    }
    ok(green > 0 && red > 0, `年份边界表两侧都有用例（绿 ${green} 红 ${red}：单侧表会让恒真/恒假的判据蒙混）`);
    for (const [o, wantErr, name] of [
      [{ track: "nope" }, true, "未知轨道拒绝"],
      [{ dim: "nope" }, true, "未知维度拒绝"],
      [{ title: "短" }, true, "过短标题拒绝"],
      [{ summary: "短" }, true, "过短摘要拒绝"],
      [{ yearApprox: "1" }, false, "推定年代标记放行"],
      [{}, false, "正控制：一条合式的新条目必须判为可提交"],
    ]) {
      eq(mk(o).length > 0, wantErr, `${name}（实得 ${JSON.stringify(mk(o))}）`);
    }

    /* ---------- 报错文案与判据同线 ----------
     * 浏览器验收实测：六字摘要被打回「摘要不能空着」——字段明明有内容。
     * 读者按文案自查看不出毛病，补到九字照样被拒，表单的文案变成劝退。
     * 阈值一律从 CC.MIN 现推，不写死数字：改了判据而文案没跟上，正是要抓的那件事。 */
    for (const f of ["title", "summary"]) {
      const below = mk({ [f]: "字".repeat(CC.MIN[f] - 1) });
      const exact = mk({ [f]: "字".repeat(CC.MIN[f]) });
      const empty = mk({ [f]: "" });
      eq(below.length > 0, true, `${f} 比下限少一字即判废（实得 ${JSON.stringify(below)}）`);
      eq(exact.length, 0, `${f} 正好落在下限即放行（实得 ${JSON.stringify(exact)}）：门槛是「不少于」而不是「大于」`);
      eq(empty.length > 0, true, `${f} 空着判废`);
      const mBelow = below.join("；"), mEmpty = empty.join("；");
      ok(mBelow.includes(String(CC.MIN[f])),
         `${f} 的过短文案点名了下限 ${CC.MIN[f]} 字（不含数的文案读者没法照做）`);
      ok(!mBelow.includes("空着"),
         `${f} 有内容时报错不得说「空着」（六字摘要曾被说成「不能空着」，读者无从改起）`);
      ok(mEmpty.includes("空着") || mEmpty.includes(String(CC.MIN[f])),
         `${f} 空着时要么直说是空的、要么给同一个下限口径`);
      const ph = ((CC.formSpec("event").fields.find((x) => x.name === f) || {}).ph) || "";
      ok(ph.includes(String(CC.MIN[f])),
         `${f} 的输入提示提前写明下限 ${CC.MIN[f]} 字（改了判据不改提示=把同一句话说到用户面前）`);
    }
    const tgt = [
      [{ kind: "source", target: "no-such-id", locator: "《史记》" }, "目标条目不存在即废件"],
      [{ kind: "source", target: CONTRIB_FIXTURES[0].id, locator: "" }, "出处空着即废件"],
      [{ kind: "check", target: CONTRIB_FIXTURES[0].id, locator: "《史记》卷六" }, "核对缺结论即废件"],
    ];
    for (const [r, name] of tgt) {
      const rec = Object.assign({ schema: CC.SCHEMA, at: CC.todayISO(), app: "x" }, r);
      eq(CC.checkRecord(rec).length > 0, true, `${name}：${JSON.stringify(CC.checkRecord(rec))}`);
    }
    eq(CC.checkRecord({ schema: CC.SCHEMA, at: CC.todayISO(), kind: "nonsense" }).length > 0, true,
       "未知投稿类型直接判废（不能默认放过）");
    eq(CC.checkRecord({ schema: CC.SCHEMA, kind: "source", target: CONTRIB_FIXTURES[0].id, locator: "《史记》卷六·秦始皇本纪", at: CC.todayISO() }).length, 0,
       "正控制：一条合式的补出处记录必须判为可提交（否则上面三条红可能只是恒红）");
  }

  /* ---------- issue 出口：宁可没有链接，也不能有死链与截半的正文 ---------- */
  {
    const rec = CC.buildRecord("source", { target: CONTRIB_FIXTURES[0].id, locator: "《史记》卷六·秦始皇本纪", who: "张三" });
    const cases = [
      ["", rec, "", "仓库未登记 → 不画 issue 出口"],
      ["owner/name", rec, true, "合式仓库 → 给出 issues/new 链接"],
      ["a b", rec, "", "含空格的仓库名 → 不画"],
      ["../../x", rec, "", "路径穿越样子的仓库名 → 不画"],
      ["owner/", rec, "", "缺仓库段 → 不画"],
      ["owner/name/", rec, "", "多一段斜杠 → 不画"],
      ["ow-ner.n_a/on-2", rec, true, "点横线下划线都算合法字符"],
    ];
    for (const [repo, r, want, name] of cases) {
      CC.setRepo(repo);
      const u = CC.issueUrl(r);
      if (want === true) {
        ok(u.startsWith("https://github.com/owner/name/issues/new?") || u.startsWith("https://github.com/ow-ner.n_a/on-2/issues/new?"),
           `${name}（实得 ${u.slice(0, 46)}…）`);
        ok(/issues\/new/.test(u) && u.includes("labels=" + encodeURIComponent(CC.LABEL)),
           `${name}：链接指向新建 issue 并带上投稿标签（标签取 CC.LABEL="${CC.LABEL}"，不抄字面量）`);
      } else eq(u, "", name + `（实得长度 ${u.length}：宁可不画也不能画个死链）`);
    }
    const big = CC.buildRecord("event", { year: 1900, track: "cn", dim: "politics",
      title: "长".repeat(CC.MAX.title), summary: "摘".repeat(CC.MAX.summary), locator: "位".repeat(CC.MAX.locator) });
    CC.setRepo("owner/name");
    eq(CC.issueUrl(big) === "", true, "正文超长的记录不生成链接（被服务端截半比没有链接更坏）");
    eq(big.event.summary.length, CC.MAX.summary, "但记录本身不截：拒的是链接，不是内容");
    eq(JSON.parse(CC.jsonText(big)).event.locator === undefined && JSON.parse(CC.jsonText(big)).event.sources[0].length === CC.MAX.locator, true,
       "超长出处按 MAX 定长裁剪后仍在 sources 里（裁剪发生在建记录时，送达时不再切）");
    const xss = CC.buildRecord("source", { target: CONTRIB_FIXTURES[0].id, locator: '"><img src=x onerror=alert(1)>' });
    const xu = CC.issueUrl(xss);
    ok(xu.length > 0, "注入样例也要能生成链接（否则下面的转义断言是空话）");
    eq(/[<>"']/.test(xu), false, "issue 链接里没有裸的尖括号与引号（都被百分号编码）");
    ok(/href="' \+ esc\(url\) \+ '/.test(src), "链接写进 HTML 前过 esc()：编码只在一处兜底不算数");
    const body = CC.issueBody(rec);
    const fence = /```json\n([\s\S]*?)\n```/.exec(body);
    ok(!!fence, "issue 正文里 fenced 的 JSON 块解析得到（维护侧并档就靠它）");
    if (fence) eq(JSON.parse(fence[1]), rec, "正文里的 JSON 与原记录逐字段相同：这条记录真的可被机器消费");
    eq(/[a-z_]*(tier|verified|confidence)[a-z_]*/i.test(CC.jsonText(rec)), false,
       "序列化后的文本里不含 tier/verified/confidence 字样");
    CC.setRepo("");
    eq(CC.repo(), "", "出口配置默认空：仓库地址由部署侧一行注入，不写死在模块里");
  }

  /* ---------- issue = 第一版唯一的写入通道（#43） ----------
   * 通道成立的条件全在仓库之外的那几个文件里：模板没被 GitHub 认、标签与代码不同源、
   * 或者表单往一个不存在的节点上写文案——没有一种会在页面上显形。所以逐条量。 */
  {
    const tplDir = path.join(ROOT, ".github", "ISSUE_TEMPLATE");
    const tpls = fs.existsSync(tplDir)
      ? fs.readdirSync(tplDir).filter((f) => f.endsWith(".md")).sort() : [];
    const tplFile = tpls.find((f) => /contribution/.test(f));
    ok(!!tplFile, `.github/ISSUE_TEMPLATE/ 里有 contribution 模板（实得 ${JSON.stringify(tpls)}：模板没了，issue 通道等于口头承诺）`);
    if (tplFile) {
      const tpl = fs.readFileSync(path.join(tplDir, tplFile), "utf8");
      const fm = /^---\n([\s\S]*?)\n---/.exec(tpl);
      ok(!!fm, "模板有 YAML 头：没有它 GitHub 只当普通文档，投稿页面上不会出现这个选项");
      const fmOf = (k) => ((fm ? fm[1] : "").match(new RegExp("^" + k + ":\\s*(.+)$", "m")) || [, ""])[1].trim();
      /* GitHub 靠 name 挑模板、靠 labels 分流；缺任一条通道都会静默降级成「没人认领的 issue」 */
      for (const k of ["name", "about", "labels"])
        ok(fmOf(k).length > 0, `模板头里有 ${k}（空 = GitHub 不列这个模板或不开标签，读者点不到通道）`);
      const tplLabels = fmOf("labels").split(",").map((s) => s.trim()).filter(Boolean);
      ok(tplLabels.includes(CC.LABEL),
         `模板 labels=${JSON.stringify(tplLabels)} 含代码里的 "${CC.LABEL}"：不同源则投稿开出来无人分流`);
      const body = tpl.replace(/^---[\s\S]*?---/, "");
      ok(/```json/.test(body), "模板正文留了 ```json 围栏：仓库地址未登记时，手动投稿要有地方贴");
      ok(/只交证据|不交结论/.test(body), "模板写明「只交证据不交结论」：等级与权重不许自报，这条口径得在入口处说");
    }
    /* 表单写文案的每个 .contrib-* 节点都必须在骨架里存在：写向 null 是提交那一刻的 TypeError，
     * 而不是页面上看得见的一处坏样式。 */
    const written = [...new Set([...src.matchAll(/querySelector\("\.([a-z-]*contrib[a-z-]*|contrib[a-z-]*)"\)/g)]
      .map((m) => m[1]))];
    eq(written.length > 0, true, `模块里往 .contrib-* 节点写内容的地方解析得到 ${written.length} 处（0 处=上面的对账是空对账）`);
    const skeleton = (src.match(/form\.innerHTML =([\s\S]*?);\s*\n\s*document\.body\.appendChild/) || [, ""])[1];
    ok(skeleton.length > 0, "弹窗骨架取得到（取不到下面的清单会在空串上恒真）");
    const absent = written.filter((c) => !skeleton.includes('class="' + c + '"') &&
      !skeleton.includes('class="' + c + " ") && !new RegExp('class="[^"]*\\b' + c + '\\b').test(skeleton));
    eq(absent.join(","), "", `每个被写入的节点都在骨架里（缺 ${absent.join(",")}：提交时会以 TypeError 收场）`);
    /* 页脚那句：写进骨架一次、由 CSS 走令牌上色，才会同时被上面的对比度门量到 */
    const motto = (src.match(/class="contrib-motto">([^<]*)</) || [, ""])[1];
    ok(motto.includes("见证者") && motto.includes("创造者"),
       `页脚那句在弹窗骨架里（实得 ${JSON.stringify(motto)}：只写进文档等于读者永远看不到）`);
    eq((src.match(/contrib-motto/g) || []).length, 1,
       "模块里 contrib-motto 只出现一次：多出来的一处多半是某个阶段重画页脚时把它连字带节点一起清了");
    const mottoCss = /\.contrib-motto\s*\{([^}]*)\}/.exec(cssAll2);
    ok(!!mottoCss, "css 里给 .contrib-motto 定了样式（没样式=继承卡片正文，句子里的「我们」没人认领）");
    if (mottoCss) ok(/color:\s*var\(--[\w-]+\)/.test(mottoCss[1]),
       ".contrib-motto 的字色取自令牌（写死 hex 就绕开了本文件那道逐主题量对比度的门）");
  }

  /* ---------- 首页开场那句收束语（#45） ----------
   * 这句由读者提出，落点在开场题记：引言是「站在时间的角度看人」，它是「站在人的角度看时间」。
   * 位置、次数、无障碍承载与减动效延迟都得钉住——只钉文案的话，其余四处随便坏一处都看不出来。 */
  {
    const we = (indexHtml.match(/<p class="ep-we"[^>]*>([^<]*)</) || [, ""])[1];
    ok(we.length > 0, `开场收束语从 index.html 取得到（实得 ${JSON.stringify(we)}：取不到下面的文案断言全在空串上恒真）`);
    ok(we.includes("我们都是历史的见证者") && we.includes("我们都是历史的创造者"),
       `开场那句与读者给的口径逐字相同（实得 ${JSON.stringify(we)}）`);
    eq((indexHtml.match(/ep-we/g) || []).length, 1,
       "index.html 里 ep-we 只出现一次：多处同串会让下面的位置判据挑错锚点");
    const epiAt = indexHtml.indexOf('class="epigraph"'), logoAt = indexHtml.indexOf('class="logo"');
    const weAt = indexHtml.indexOf('class="ep-we"');
    ok(epiAt >= 0 && logoAt > epiAt && weAt > epiAt && weAt < logoAt,
       `收束语在题记之内（epigraph@${epiAt} → ep-we@${weAt} → logo@${logoAt}）：落在外面，点击进入后它不会随引言淡出，会糊在时间轴上`);
    const figLabel = (indexHtml.match(/class="epigraph"[^>]*aria-label="([^"]*)"/) ||
                      indexHtml.match(/aria-label="([^"]*)"[^>]*class="epigraph"/) || [, ""])[1];
    ok(figLabel.includes(we), "题记的 aria-label 含这句（可见行都标了 aria-hidden，标签不补=读屏听众永远听不到它）");
    const weCss = /#boot \.ep-we\s*\{([^}]*)\}/.exec(cssAll2);
    ok(!!weCss, "css 里给 #boot .ep-we 定了样式（没样式=继承 <p> 的默认字体与裸色，题记的宋体断在此处）");
    if (weCss) ok(/color:\s*var\(--[\w-]+\)/.test(weCss[1]),
       "#boot .ep-we 的字色取自令牌（上面那道清单才量得到它）");
    /* 减动效块有两处（base.css 压全局时长、layout.css 归零题记延迟），只取第一处会把第二处判成缺失 */
    const rmBlocks = [...cssAll2.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1]);
    ok(rmBlocks.length >= 1, `css 里至少切得出 1 个 prefers-reduced-motion 块（实得 ${rmBlocks.length} 个：一个都切不出，下面的归零判据就在空串上恒假）`);
    ok(/\.ep-we/.test(rmBlocks.join("\n")),
       "减动效时 .ep-we 的入场延迟一并归零（引言行都归了，独留这句晚到=偏好挡不住一句话）");
  }

  /* ---------- ICP 备案号展示位（方案 B：境内接入） ----------
   * 备案号是境内接入的法定标识：境内必须有、必须可点、格式须与工信部下发的一致；解析到境外
   * 则整行都不该存在。本站当前在境外 ⇒ 真件走「0 处」分支，而 0 处会让下面每一条判据在空清单
   * 上恒真——所以同批复活样本与四类坏样本，先证明这把尺子本身能为红。 */
  {
    const BEIAN_HREF = "https://beian.miit.gov.cn/";
    const ICP_RE = /^[一-龥]{1,3}ICP备\d{6,14}号(?:-\d{1,4})?$/;
    const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, "");
    function beianErrs(html) {
      const real = stripHtml(html);
      const ms = [...real.matchAll(/<a\b[^>]*class="[^"]*\bbeian\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
      if (ms.length > 1) return [`出现 ${ms.length} 处 .beian 链接（法定标识只该有一处，多处必有一处是残骸）`];
      if (!ms.length) return [];
      const tag = ms[0][0], inner = ms[0][1].trim();
      const e = [];
      if (!ICP_RE.test(inner)) e.push(`备案号「${inner}」不匹配工信部形状（省简称 + ICP备 + 6~14 位数字 + 号[-后缀]）`);
      if (!new RegExp('href="' + BEIAN_HREF + '"').test(tag)) e.push(`备案号的链接不是 ${BEIAN_HREF}`);
      if (!/target="_blank"/.test(tag)) e.push("备案号链接没写 target");
      if (!/rel="[^"]*noopener/.test(tag)) e.push("备案号链接的 rel 没有 noopener（外链不切断 window.opener 是现成的攻击面）");
      return e;
    }
    const OK_LINE = '<a class="beian" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">京ICP备2026000001号-1</a>';
    eq(beianErrs("<footer>" + OK_LINE + "</footer>").join("；"), "",
       "自审正例：合规挂法判 0 错（它若报错，下面关于真件的结论就不可信）");
    for (const [bad, want] of [
      [OK_LINE.replace("京ICP备2026000001号-1", "备案号正在办理"), "不匹配工信部形状"],
      [OK_LINE.replace("https://beian.miit.gov.cn/", "https://example.com/"), "链接不是"],
      [OK_LINE.replace(' target="_blank"', ""), "没写 target"],
      [OK_LINE.replace("noopener", ""), "noopener"],
      ["<footer>" + OK_LINE + OK_LINE + "</footer>", "只该有一处"],
    ]) {
      const got = beianErrs(bad).join("；");
      ok(got.includes(want), `自审负例「${want}」被抓到并点名（实得 ${JSON.stringify(got)}：抓不到＝0 处分支下这些判据全在空转）`);
    }
    /* ---- 以下是真件 ---- */
    const nBeian = (stripHtml(indexHtml).match(/class="[^"]*\bbeian\b/g) || []).length;
    ok(nBeian <= 1, `真实 DOM 里的备案号链接不超过 1 处（实得 ${nBeian}）`);
    eq(beianErrs(indexHtml).join("；"), "",
       `index.html 当前的备案号挂法合规（0 处＝境外接入，本身就是合规状态；挂了就要条条合规）`);
    const cmt = (indexHtml.match(/<!--[\s\S]*?ICP 备案号[\s\S]*?-->/) || [""])[0];
    ok(cmt.length > 0, "index.html 里留着注释形式的备案号挂法（换宿主的人只翻文件，不翻对话记录）");
    ok(cmt.includes("beian.miit.gov.cn"), "注释里那行的链接指向工信部（贴进去即可点，不必再查地址）");
    const beianCss = /\.statusbar \.beian\s*\{([^}]*)\}/.exec(cssAll2);
    ok(!!beianCss, "css 里给 .statusbar .beian 定了样式（没样式=跟着状态条的 --ink-faint 走，法定标识灰到看不见）");
    if (beianCss) ok(/color:\s*var\(--[\w-]+\)/.test(beianCss[1]),
       ".beian 的字色取自令牌（写死 hex 就绕开了本文件那道逐主题量对比度的门）");
  }

  /* ---------- 蜜罐与限频：礼貌层不能反过来吞掉正常投稿 ---------- */
  {
    for (const [v, want] of [["", false], ["   ", false], [null, false], [undefined, false], ["机器人", true], ["0", true]]) {
      eq(CC.honeypotFilled(v), want, `蜜罐值 ${JSON.stringify(v)} 判为${want ? "已填" : "空"}`);
    }
    const sub = src.slice(src.indexOf("function submitForm("));
    const at = (re) => { const m = re.exec(sub); return m ? m.index : -1; };
    ok(sub.length > 200, `submitForm 函数体切得到（长度 ${sub.length}：切空则下面的次序断言全在空转）`);
    const hp = at(/if \(honeypotFilled\(v\.fax\)\)/), commit = at(/rlCommit\(now\)/), build = at(/buildRecord\(kind, Object\.assign/);
    ok(hp >= 0 && commit >= 0 && build >= 0, `蜜罐/建记录/落账三处在 submitForm 里都定位得到（${hp},${build},${commit}）`);
    ok(hp < build && build < commit,
       "蜜罐分支在建记录与落账之前就返回（填了蜜罐既不落库也不占限频额度，且不给任何解释）");
    ok(/if \(honeypotFilled\(v\.fax\)\) \{ setMsg\("[^"]*", "good"\); return; \}/.test(sub),
       "蜜罐判的是「填了才拦」（条件取反=把每条正常投稿静默吞掉，界面还回一句好话），且必须带 return");
    const W = CC.RL.WINDOW, MX = CC.RL.MAX, D = CC.RL.DAY, now = 1700000000000;
    const j = (st) => CC.rlJudge(st, now);
    eq(j([]).ok, true, "空历史放行");
    eq(j(Array.from({ length: MX - 1 }, (_, i) => now - i * 1000)).ok, true, `窗口内 ${MX - 1} 条仍放行（差一条到顶）`);
    eq(j(Array.from({ length: MX }, (_, i) => now - i * 1000)).ok, false, `窗口内第 ${MX} 条拦截`);
    eq(j(Array.from({ length: MX }, (_, i) => now - i * 1000)).win, MX, "win 计到上限值而非上限减一");
    eq(j(Array.from({ length: MX }, (_, i) => now - i * 1000)).waitMin >= 1, true, "拦截时的等待提示至少 1 分钟（0 分钟=叫人来撞墙）");
    eq(j([now - W]).win, 0, "正好落在窗口边沿的一条不计入窗口（边界属于过去）");
    eq(j([now - W + 1]).win, 1, "窗口内一毫秒也算在窗口里");
    eq(j([now + 60000, now + 9e12]).ok, true, "未来时间戳一律忽略：改过系统时钟不该把人锁到永远");
    eq(j([now + 60000]).day, 0, "未来的单条时间戳不进当日账（时钟守卫 >=0 那半条被删就会在这里红）");
    eq(j([now + 60000]).win, 0, "未来的单条时间戳不进窗口账");
    eq(j(Array.from({ length: D - 1 }, (_, i) => now - 20 * 3600 * 1000 - i)).day, D - 1, "20 小时前的记录仍计入当日");
    eq(j(Array.from({ length: D }, (_, i) => now - 20 * 3600 * 1000 - i)).ok, false, `当日满 ${D} 条即拦（与窗口无关的另一条线）`);
    eq(j(Array.from({ length: D + 5 }, (_, i) => now - 30 * 3600 * 1000 - i)).day, 0, "整批超 24 小时的记录全部作废（不会永远背着）");
    eq(j(["x", null, undefined, {}, NaN, now - 5000]).day, 1, "非数字条目不进账");
    eq(typeof CC.rlState(now).ok, "boolean", "无打桩入口的 rlState(now) 仍可用（真实调用路径）");
  }

  /* ---------- 蜜罐必须画得出来又看不见：display:none 会被脚本直接跳过 ---------- */
  {
    const hpRule = /\.contrib-hp\s*\{([^}]*)\}/.exec(cssAll2);
    ok(!!hpRule, "css 里有 .contrib-hp 规则");
    if (hpRule) {
      eq(/display:\s*none|visibility:\s*hidden/.test(hpRule[1]), false,
         "蜜罐不用 display:none/visibility:hidden（藏起来脚本就不填了，蜜罐变装饰）");
      ok(/left:\s*-?\d{3,}/.test(hpRule[1]), "蜜罐靠移出视口隐藏");
    }
    ok(/name="fax"/.test(src), "表单里确实画了蜜罐字段（判据不能对着一张不存在的表单讲规则）");
    ok(/openForm[\s\S]{0,900}name="fax"[\s\S]{0,80}\.value = ""/.test(src),
       "每次 openForm 都重置蜜罐：留着上一次的脏值会把此后每条正常投稿静默吞掉");
  }
}

/* ============ CI 与本地发布面的门清单 1:1（#54） ============
 * CI 是贡献者 PR 的第一道闸。它比本地少跑一道门，缺陷就在评论里判绿、在维护者机器上判红；
 * 而那道门是哪一天被顺手删掉的，没有人会知道。所以两边的清单当同一件事核对。 */
{
  const yml = (() => { try { return fs.readFileSync(path.join(ROOT, ".github/workflows/gates.yml"), "utf8"); } catch { return ""; } })();
  const pre = fs.readFileSync(path.join(ROOT, "tools/predeploy.mjs"), "utf8");
  ok(yml.length > 200, `CI 工作流读得到（长度 ${yml.length}：读空了下面的断言全在空清单上恒真）`);

  const ciNames = (s) => [...s.matchAll(/node\s+tools\/([a-z0-9_-]+)\.mjs/g)].map((m) => m[1]);
  const declared = (s) => {
    const m = /const GATES = \[([^\]]*)\]/.exec(s);
    return m ? [...m[1].matchAll(/"([a-z0-9_-]+)"/g)].map((x) => x[1]) : null;
  };
  /* 差集判据本身先自审：两侧同时为空时 A⊆B 恒真，那是最典型的假绿。 */
  {
    const dead = [];
    if (declared('const GATES = ["a", "b"];').join() !== "a,b") dead.push("声明侧取不到清单");
    if (declared("nothing") !== null) dead.push("声明缺失时没有报 null（空清单会被当成「无缺口」放行）");
    if (ciNames("run: node tools/x.mjs").join() !== "x") dead.push("执行侧取不到 node tools/*.mjs");
    if (ciNames("steps:").length) dead.push("执行侧把无关文本误当成命令");
    ok(dead.length === 0, `门清单两侧解析自审：声明/执行/缺失三种形态都判对${dead.length ? "（" + dead.join("；") + "）" : ""}`);
  }

  const ci = ciNames(yml), gates = declared(pre);
  const stagingMatch = /const STAGING_GATES = \[([^\]]*)\]/.exec(pre);
  const staging = stagingMatch ? [...stagingMatch[1].matchAll(/"([a-z0-9_-]+)"/g)].map((m) => m[1]) : null;
  eq(!!gates && gates.length > 0, true, `predeploy 的 GATES 取得到（实得 ${JSON.stringify(gates)}）`);
  eq(ci.length > 0, true, `CI 里的门解析得到 ${ci.length} 处（0 处＝这个对账是空对账）`);

  const missing = (gates || []).filter((g) => !ci.includes(g));
  eq(missing.join(), "", `本地发布面跑的 ${gates && gates.length} 道门在 CI 里一处不少（缺 ${missing.join()}：那类缺陷 PR 上判绿、合进来才红）`);

  const ghost = [...new Set(ci)].filter((n) => !fs.existsSync(path.join(ROOT, "tools", n + ".mjs")));
  eq(ghost.join(), "", `CI 点名的每个脚本都在盘上（${ghost.join()} 不存在：CI 会在别人机器上报一门看不懂的红灯）`);

  eq(!!staging, true, `predeploy 的 STAGING_GATES 取得到（实得 ${JSON.stringify(staging)}）`);
  const outsideStaging = (staging || []).filter((g) => !(gates || []).includes(g));
  eq(outsideStaging.join(), "", `staging 那道子集（${staging && staging.length} 门）不越出全量清单`);

  /* 反方向：盘上有门、清单里没有 ⇒ 它从不运行，而写它的人以为它在。
   * 本轮加 validate-story / test-story 时正是这条最容易被漏（改三个文档、少改一行 GATES）。 */
  {
    const gateNames = (s) => {
      const m = /const GATES = \[([^\]]*)\]/.exec(s);
      return m ? [...m[1].matchAll(/"([a-z0-9_-]+)"/g)].map((x) => x[1]) : [];
    };
    /* 假绿控制：拿一个必然不在清单里的名字问它抓不抓得到。抓不到就说明下面的
     * 「未登记＝零」只是清单恰好为空，而不是这条判据在起作用。 */
    const ctrl = gateNames('const GATES = ["a", "b"];').concat("__probe_never_registered__")
      .filter((g) => !["a", "b"].includes(g));
    if (ctrl.join() !== "__probe_never_registered__") {
      ok(false, `登记判据取样失效（实得 ${JSON.stringify(ctrl)}）：下面的「全部已登记」不可信`);
    } else {
      const onDisk = fs.readdirSync(path.join(ROOT, "tools"))
        .filter((f) => /^(validate|test)-[a-z0-9-]+\.mjs$/.test(f))
        .map((f) => f.replace(/\.mjs$/, ""));
      const unreg = onDisk.filter((g) => !gates.includes(g));
      eq(unreg.join(), "", `tools/ 下每道 validate-*/test-* 门都已登记（盘上 ${onDisk.length} 道，清单 ${gates.length} 道）`);
    }
  }

  /* 这份工作的立身之本是「不带凭据、不做部署」，以及「它真的会跑」。
   * 两条都写成可自审的判据：判据先拿合成正/负例验一遍，否则「没有凭据」只是空话。 */
  const CRED_RE = /secrets\.|environment:|uses:[^\n]*(deploy|publish)/i;
  const TRIG_RE = /^on:\s*\n(?:[^\n]*\n){0,4}\s*push:[\s\S]{0,120}?branches:[^\n]*main/m;
  {
    const POS = ["        run: echo ${{ secrets.TOKEN }}", "    environment: production",
      "      - uses: some-org/deploy-action@v1"];
    const dead = POS.filter((s) => !CRED_RE.test(s));
    if (dead.length) ok(false, `凭据判据漏网：${dead.join(" | ")}（下面那条「CI 无凭据」不可信）`);
    else ok(!CRED_RE.test(yml), "CI 里没有 secrets/environment/部署动作（一旦凭据进工作流，绿色检查就等于已上线）");
    const tdead = [yml, "on:\n  push:\n    branches: [main]\n  pull_request: null"]
      .filter((s) => !TRIG_RE.test(s));
    if (tdead.length > 1) ok(false, `触发判据连合成样例都抓不到（${JSON.stringify(tdead[0].slice(0, 40))}）：下面那条「会跑」不可信`);
    else ok(TRIG_RE.test(yml), "CI 在 main 与 PR 上触发（否则它是装饰，从不跑）");
  }
}

/* ============ 报告 ============ */
console.log(`\n单元/纯函数测试：${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`);
if (fail) {
  console.log("\n" + failures.join("\n"));
  process.exitCode = 1;   // 不用 process.exit：管道下会截断这份失败清单
}
if (!fail) console.log("✅ 全部通过");
