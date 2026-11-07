/* gen-places.mjs | 由紧凑表生成 data/geo/places.js
 * 用法: node tools/gen-places.mjs [--check]
 *
 * 为什么不直接手写 places.js：200 多条 JS 对象，逗号/引号/漏字段是必然事故；
 * 竖线表每行同构，解析器当场报错（列数、坐标范围、kind 枚举、key 唯一、keys 非空），
 * 写错一行立刻知道是哪一行。生成物仍是 window.__CHRONICLE_PLACES，file:// 约束不变。
 *
 * 表格式（| 分隔，8 列）：
 *   key | 古称 | kind | 今地 | 经度,纬度 | 命中词(;分隔) | 说明 | 出处(;分隔)
 *   kind 末尾可加 ~approx 表示区域而非点位（界面画成软盘，不画精确落针）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TBL = path.join(ROOT, "tools", "geo-places.tbl");
const OUT = path.join(ROOT, "data", "geo", "places.js");

const KINDS = ["capital", "city", "pass", "battle", "site", "work", "region", "foreign", "port"];

/* 表在 tools/geo-places.tbl：改地名只动数据文件，不动 JS。
 * 每行 8 列同构，parseRow 逐行校验，一次报全部错误。 */
const TABLE = fs.readFileSync(TBL, "utf8");

/* 今地 → 命中词：把「陕西西安西北」削成「西安」、「日本京都」削成「京都」。
 * 为什么要机器补这一把：语料里的「今X」绝大多数写的是今地名，而人写表时最容易
 * 只把古称（长安、平安京）放进 keys——于是 61 条「今北京」一条也命不中，
 * 覆盖率还照样显示「表有 459 条」。今地名由生成器保证进 keys，不靠记性。 */
const ADMIN_PREFIX = "河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|宁夏|新疆|西藏|香港|澳门|北京|天津|上海|重庆";
const COUNTRY_PREFIX = "意大利|土耳其|希腊|埃及|突尼斯|摩洛哥|马里|加纳|尼日利亚|肯尼亚|埃塞俄比亚|苏丹|南非|津巴布韦|伊拉克|伊朗|阿富汗|乌兹别克斯坦|土库曼斯坦|巴基斯坦|印度|孟加拉|斯里兰卡|也门|坦桑尼亚|叙利亚|以色列|巴勒斯坦|黎巴嫩|保加利亚|塞尔维亚|罗马尼亚|乌克兰|俄罗斯|英国|荷兰|比利时|瑞士|法国|德国|捷克|奥地利|匈牙利|波兰|瑞典|挪威|丹麦|芬兰|冰岛|西班牙|葡萄牙|美国|加拿大|墨西哥|危地马拉|秘鲁|玻利维亚|澳大利亚|新西兰|日本|朝鲜|韩国|越南|柬埔寨|泰国|缅甸|印尼|沙特|老挝";
const DIR_TAIL = "(?:北部|南部|东部|西部|中部|西北|西南|东北|东南|一带|附近|市区|市|县|区|州)$";

const COUNTRIES = new Set(COUNTRY_PREFIX.split("|"));

function modernKey(modern) {
  const stripped = modern.replace(new RegExp("^(" + ADMIN_PREFIX + "|" + COUNTRY_PREFIX + ")"), "");
  /* 剥空了就退回原词：北京/上海/天津既是直辖市前缀、本身就是命中词，
   * 退不回原词的后果是「今北京」61 条一条命不中，而覆盖率照样显示表有 461 条。 */
  let m = (stripped || modern).replace(new RegExp(DIR_TAIL, ""), "");
  if (m.length < 2 || /[\/]/.test(m)) return null;
  /* 国名不做命中词：「伊朗」「伊拉克」这类 modern 剥完前缀就只剩国名，
   * 把它当城市命中词会让德黑兰/伊斯法罕/大不里士互相抢——国名交给 region 条目处理。 */
  if (COUNTRIES.has(m) || COUNTRIES.has(modern)) return null;
  return m;
}

function parseRow(line, idx) {
  const c = line.split("|");
  if (c.length !== 8) throw new Error(`第 ${idx + 1} 行列数 ${c.length}（应 8）：${line}`);
  let [key, zh, kind, modern, xy, keys, note, src] = c.map((s) => s.trim());
  const approx = /~approx$/.test(kind);
  if (approx) kind = kind.replace(/~approx$/, "");
  if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error(`第 ${idx + 1} 行 key 非法：${key}`);
  if (KINDS.indexOf(kind) < 0) throw new Error(`第 ${idx + 1} 行 kind 非法：${kind}（枚举 ${KINDS.join("/")}）`);
  const [lng, lat] = xy.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`第 ${idx + 1} 行坐标不是数：${xy}`);
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new Error(`第 ${idx + 1} 行坐标越界：${xy}`);
  const ks = keys.split(";").map((s) => s.trim()).filter(Boolean);
  if (!ks.length) throw new Error(`第 ${idx + 1} 行 keys 为空（永不命中，写了也没用）`);
  const sources = src.split(";").map((s) => s.trim()).filter(Boolean);
  if (!sources.length) throw new Error(`第 ${idx + 1} 行 sources 为空（地名识别必须给得出处）`);
  if (!zh) throw new Error(`第 ${idx + 1} 行古称为空`);
  if (!modern) throw new Error(`第 ${idx + 1} 行今地为空`);
  return { key, zh, kind, approx, modern, coord: [lng, lat], keys: ks, note, sources };
}

/* 一次报全部：逐行 throw 会让我修一个错才看见下一个，200 行表要跑 20 轮。 */
const rows = [], rowErrs = [];
TABLE.split("\n").map((l) => l.trim()).filter(Boolean).forEach((line, idx) => {
  try { rows.push(parseRow(line, idx)); }
  catch (e) { rowErrs.push(e.message); }
});
if (rowErrs.length) {
  console.error(`✗ ${rowErrs.length} 行有问题：\n  ` + rowErrs.join("\n  "));
  process.exit(1);
}

/* 第二遍：把今地名与本名补成命中词，但只补「还没人占着」的词。
 * 为什么要补本名（zh）：巴黎/伦敦/莫斯科/君士坦丁堡这些条目我把 modern 写成了国家，
 * 于是 keys 里只剩别名（塞纳;卡佩;波旁），本名一个都没进——33 条「今英国伦敦」命不中，
 * 而表自审照样「通过」。本名与今地名都由生成器保证进 keys，不靠记性。
 * 已属他条就跳过并列出来给人看——跳过的原因要么是重名让位（大散关的今地写作宝鸡），
 * 要么是我真漏了；清单逼我看清是哪一种。 */
const owner0 = new Map();
rows.forEach((r) => r.keys.forEach((k) => owner0.set(k, r.key)));
const skipped = [];
function tryAdd(r, cand, label) {
  if (!cand || cand.length < 2 || /[\/]/.test(cand)) return;
  if (r.keys.indexOf(cand) >= 0) return;
  if (owner0.has(cand)) { skipped.push(`${r.key}：${label}「${cand}」已属 ${owner0.get(cand)}，未自动补`); return; }
  r.keys.push(cand); owner0.set(cand, r.key);
}
rows.forEach((r) => {
  tryAdd(r, modernKey(r.modern), "今地名");
  tryAdd(r, r.zh, "本名");
});

/* key 唯一 + 命中词跨条目冲突检测：同一个词挂在两个条目下，最长命中会随机选一个。 */
const seenKey = new Map(), conflicts = [];
rows.forEach((r) => {
  if (seenKey.has(r.key)) conflicts.push(`key 重复 ${r.key}`);
  seenKey.set(r.key, 1);
});
const keyOwner = new Map();
rows.forEach((r) => r.keys.forEach((k) => {
  const prev = keyOwner.get(k);
  if (prev && prev !== r.key) {
    /* 允许「一个词是另一个词的一部分」（如 荆州 ⊂ 江陵? 不算），只禁完全同词 */
    conflicts.push(`命中词「${k}」同时属于 ${prev} 与 ${r.key}`);
  }
  keyOwner.set(k, r.key);
}));
if (conflicts.length) {
  console.error("✗ 表有冲突：\n  " + [...new Set(conflicts)].join("\n  "));
  process.exit(1);
}

/* 最长命中自检：拿每条自己的 keys 反查，必须命中自己（否则被别的词抢走）。
 * 排序口径与 tools/geo-lib.mjs 完全一致：长词先、同长时点位先于区域。 */
const index = [];
rows.forEach((r) => r.keys.forEach((k) => index.push({ k, key: r.key, region: r.kind === "region" ? 1 : 0 })));
index.sort((a, b) => b.k.length - a.k.length || a.region - b.region || a.k.localeCompare(b.k));
const wrong = [];
rows.forEach((r) => r.keys.forEach((k) => {
  for (const e of index) if (k.indexOf(e.k) >= 0) { if (e.key !== r.key) wrong.push(`「${k}」(${r.key}) 会被「${e.k}」判给 ${e.key}`); break; }
}));
if (wrong.length) {
  console.error("✗ 最长命中自审失败：\n  " + wrong.join("\n  "));
  process.exit(1);
}

const out = "/* chronicle geo | 古今地名 gazetteer v1（由 tools/gen-places.mjs 生成，勿手改）\n" +
  " *\n" +
  " * 命中口径：keys 对语料 detail.place 里的「今X」做最长子串匹配（唯一实现在 tools/geo-lib.mjs）。\n" +
  " * 坐标：现代市区／遗址的 WGS84 经纬度，作者按公开地名资料自绘，非测绘成果，不作疆域依据。\n" +
  " * 识别：古今地名的通行判定参考谭其骧主编《中国历史地图集》——只取「某古城即今某地」这一类\n" +
  " *       结论（事实），未复制该书的图幅、边界线或编绘成果（表达）。\n" +
  " * approx:true 表示语料给的是区域（如「今山西」）而非点位，界面按区域渲染，不画成精确落针。\n" +
  " * kind: capital 都城 | city 城邑 | pass 关隘 | battle 战场 | site 名胜诗路 | work 工程 | region 区域 | foreign 域外\n" +
  " */\n" +
  "window.__CHRONICLE_PLACES = { version: 1, list: [\n" +
  rows.map((r) => JSON.stringify(r)).join(",\n") +
  "\n]};\n";

if (process.argv.includes("--check")) {
  console.log(`表自审通过：${rows.length} 条 · kind 分布 ${JSON.stringify(rows.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {}))}`);
  if (skipped.length) console.log(`今地名未自动补入 ${skipped.length} 处（重名让给先占者，逐条确认不是漏加）：\n  ` + skipped.join("\n  "));
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`已生成 ${path.relative(ROOT, OUT)}：${rows.length} 条地点`);
}
