/* gen-basemap.mjs | 由公有领域 Natural Earth 陆界 + 自绘水系生成 data/geo/basemap.js
 * 用法: node tools/gen-basemap.mjs [--tol 0.15] [--check]
 *
 * 为什么自己解码而不引第三方库：本站第一约束是零构建 + file://，
 * 运行时不能有任何依赖。TopoJSON 的解码只有几十行（delta 解码 + 变换 + 拼弧），
 * 在构建期做一次，产物是纯坐标数组，浏览器侧零解析。
 *
 * 许可：Natural Earth 为公有领域（U.S. government work）；world-atlas 打包层 ISC；
 * 水系与湖泊为作者按公开资料自绘示意。三者逐项登记在产物的 licenses 字段。
 *
 * 只取陆地轮廓，不取国界与省界：现代行政边界既不是本站要讲的东西，
 * 又是最敏感的合规项（见 README「地图合规」）。陆地海岸线足以支撑「古今对照」的落针。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "tools", "geo-src", "land-110m.json");
const WATER = path.join(ROOT, "tools", "geo-water.tbl");
const OUT = path.join(ROOT, "data", "geo", "basemap.js");

/* ---------- TopoJSON 解码 ---------- */
function decodeArcs(topo) {
  const [sx, sy] = topo.transform ? topo.transform.scale : [1, 1];
  const [tx, ty] = topo.transform ? topo.transform.translate : [0, 0];
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map((p) => { x += p[0]; y += p[1]; return [x * sx + tx, y * sy + ty]; });
  });
}
function stitch(indices, arcs) {
  let pts = [];
  for (const i of indices) {
    const rev = i < 0;
    const a = arcs[rev ? ~i : i];
    if (!a) throw new Error("弧索引越界 " + i);
    const seg = rev ? a.slice().reverse() : a;
    pts = pts.length ? pts.concat(seg.slice(1)) : pts.concat(seg);
  }
  return pts;
}

/* ---------- Ramer–Douglas–Peucker：把海岸线压到能看出不列颠是岛、印度是半岛 ---------- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const perp2 = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (!L2) return d2(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return d2(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  let max = -1, at = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = perp2(pts[i], a, b); if (d > max) { max = d; at = i; } }
  if (max > eps * eps) {
    const left = rdp(pts.slice(0, at + 1), eps), right = rdp(pts.slice(at), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/* ---------- 水系表 ---------- */
function parseWater() {
  const rows = [];
  const errs = [];
  fs.readFileSync(WATER, "utf8").split("\n").forEach((line, idx) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const c = l.split("|");
    if (c.length !== 7) { errs.push(`水系表第 ${idx + 1} 行列数 ${c.length}（应 7）`); return; }
    const [, zh, kind, appear, vanish, ptsTxt, note] = c;   /* 列序同表头：name|zh|kind|appear|vanish|点|说明 */
    const pts = ptsTxt.split(";").map((s) => s.split(",").map(Number));
    if (pts.length < 2 && kind === "river") { errs.push(`水系表第 ${idx + 1} 行：河流少于 2 点`); return; }
    if (kind === "lake" && pts.length !== 1) { errs.push(`水系表第 ${idx + 1} 行：湖泊应为单点`); return; }
    pts.forEach(([lng, lat]) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90)
        errs.push(`水系表第 ${idx + 1} 行坐标非法：${lng},${lat}`);
    });
    const row = { zh, kind, pts };
    if (appear) row.appear = Number(appear);
    if (vanish) row.vanish = Number(vanish);
    if (note) row.note = note;
    if (row.appear != null && row.vanish != null && row.appear >= row.vanish)
      errs.push(`水系表第 ${idx + 1} 行：appear ${row.appear} 不早于 vanish ${row.vanish}`);
    rows.push(row);
  });
  if (errs.length) { console.error("✗ 水系表：\n  " + errs.join("\n  ")); process.exit(1); }
  return rows;
}

/* ---------- 主流程 ---------- */
const tolArg = process.argv.indexOf("--tol");
const TOL = tolArg > 0 ? Number(process.argv[tolArg + 1]) : 0.15;
if (!Number.isFinite(TOL) || TOL <= 0) { console.error("✗ --tol 必须是正数"); process.exit(1); }
if (!fs.existsSync(SRC)) {
  console.error(`✗ 缺源文件 ${path.relative(ROOT, SRC)}\n  取法：curl -sSL -o tools/geo-src/land-110m.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json`);
  process.exit(1);
}

const topo = JSON.parse(fs.readFileSync(SRC, "utf8"));
const arcs = decodeArcs(topo);
const geoms = (topo.objects && topo.objects.land && topo.objects.land.geometries) || [];
if (!geoms.length) { console.error("✗ 源里没有 land 几何（对象名或结构变了）"); process.exit(1); }

let rawPts = 0, outPts = 0, droppedSlivers = 0;
const land = [];
for (const g of geoms) {
  const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : null;
  if (!polys) { console.error(`✗ 不认识的几何类型 ${g.type}`); process.exit(1); }
  for (const rings of polys) {
    /* 只取外环：Natural Earth 陆地几乎无洞，带洞会让「面」的语义复杂化。 */
    const pts = stitch(rings[0], arcs);
    rawPts += pts.length;
    const simp = rdp(pts, TOL);
    if (simp.length < 4) continue;
    /* 闭合：首尾同点，渲染侧才能直接当 polygon 用 */
    const first = simp[0], last = simp[simp.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) simp.push([first[0], first[1]]);
    /* 跨 180° 经线的环（楚科奇/阿留申/南极）在经纬展开的投影里会拉成
     * 一条横贯全幅的窄条——它不是地理，是投影伪影。判据用几何形状本身：
     * 环宽接近全图而高不足全图的 2% 就丢掉，而不是按索引硬写「跳过第 91 条」。 */
    var xs = simp.map(function (q) { return q[0]; }), ys = simp.map(function (q) { return q[1]; });
    var wDeg = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    var hDeg = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    if (wDeg > 300 && hDeg < 7) { droppedSlivers++; continue; }
    outPts += simp.length;
    land.push(simp.map(([lng, lat]) => [round(lng), round(lat)]));
  }
}
function round(n) { return Math.round(n * 1000) / 1000; }

const water = parseWater();

/* ---------- 自审：产物必须能证明解码没跑偏 ---------- */
const problems = [];
if (!land.length) problems.push("陆地环为 0（解码或简化把数据全滤掉了）");
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
land.forEach((r) => r.forEach(([lng, lat]) => {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) problems.push("出现非数坐标");
  minX = Math.min(minX, lng); maxX = Math.max(maxX, lng);
  minY = Math.min(minY, lat); maxY = Math.max(maxY, lat);
}));
/* 三条地理常识做正控制：解码错一个量级，这三条立刻红。
 * 只断言「环数>0」的话，把经纬度整体平移/缩放错了也照样绿。 */
if (!(minX < -100 && maxX > 140)) problems.push(`经度范围 ${minX}..${maxX} 不像世界地图（应跨西半球到东亚）`);
if (!(minY < -50 && maxY > 70)) problems.push(`纬度范围 ${minY}..${maxY} 不像世界地图（应跨南美到北冰洋）`);
if (!(land.length > 40 && land.length < 4000)) problems.push(`陆地环数 ${land.length} 异常`);
if (outPts > rawPts) problems.push(`简化后点数反而变多（${outPts} > ${rawPts}）：RDP 没生效`);
land.forEach((r, i) => {
  const a = r[0], b = r[r.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) problems.push(`环 #${i} 未闭合`);
});
const estBytes = JSON.stringify(land).length + JSON.stringify(water).length;
if (estBytes > 900000) problems.push(`产物约 ${(estBytes / 1024).toFixed(0)}KB，超预算 900KB（地图首屏会拖慢全站）`);
if (problems.length) { console.error("✗ 底图自审失败：\n  " + problems.join("\n  ")); process.exit(1); }

const out = `/* chronicle geo | 舆图底图（由 tools/gen-basemap.mjs 生成，勿手改）
 *
 * 陆地：Natural Earth 1:110m（公有领域），经 TopoJSON 解码 + RDP 简化（tol=${TOL}°）。
 * 水系与湖泊：作者按公开资料自绘示意，非测绘成果。
 * 只画海岸线与水系，不画现代国界与省界——本站不讲边界，讲事件落在哪里。
 * 渲染侧（js/atlas.js）按 __CHRONICLE_BASEMAP.view 的默认视野取景。
 */
window.__CHRONICLE_BASEMAP = {
  version: 1,
  generatedBy: "tools/gen-basemap.mjs",
  tolerance: ${TOL},
  licenses: [
    { what: "陆地轮廓", src: "Natural Earth 1:110m land", license: "Public Domain", note: "U.S. government work，无版权" },
    { what: "打包格式", src: "world-atlas v2 (TopoJSON)", license: "ISC", note: "仅构建期使用，运行时零依赖" },
    { what: "水系与湖泊", src: "作者自绘示意", license: "CC BY-NC 4.0", note: "随本项目授权；非测绘成果，不作边界依据" }
  ],
  disclaimer: "底图为示意性海岸线与水系，不含现代国界/省界；不作为疆域与主权的依据。",
  view: { west: 65, east: 145, south: 0, north: 60 },
  bounds: [${round(minX)}, ${round(minY)}, ${round(maxX)}, ${round(maxY)}],
  land: ${JSON.stringify(land)},
  water: ${JSON.stringify(water)}
};
`;

if (process.argv.includes("--check")) {
  console.log(`自审通过：环 ${land.length} · 点 ${rawPts}→${outPts}（省 ${(100 - outPts / rawPts * 100).toFixed(0)}%）· 水系 ${water.length} 条 · 产物约 ${(estBytes / 1024).toFixed(0)}KB`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = OUT + ".tmp";
  fs.writeFileSync(tmp, out, "utf8");
  fs.renameSync(tmp, OUT);
  console.log(`已生成 ${path.relative(ROOT, OUT)}：环 ${land.length}（滤去投影伪影 ${droppedSlivers} 条）· 点 ${rawPts}→${outPts} · 水系 ${water.length} 条 · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
}
