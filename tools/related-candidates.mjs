/* related-candidates.mjs | 跨轨 related 候选清单生成器（只读，绝不改数据）
 * 用法: node tools/related-candidates.mjs [--top N] [--min S] [--all] [--json]
 *
 * 为什么要这个脚本：`related` 5501 条边里跨轨 0 条（实测），而对照视图（#/compare/<年>）
 * 恰恰靠"同一时间两岸各发生了什么"成立。缺边不是数据错，是连接缺口——补它必须逐边裁定，
 * 所以第一步只能是**给出可裁定的候选**，而不是往数据里写。
 *
 * 判据取向是**高精确率优先**：宁可漏候选，也不能让裁定者把时间花在误报上。因此单靠
 * "共享人物名"不够（忽必烈出现在几十个节点里，两两相连毫无信息量），必须再叠加
 * 共词/同年/同维等独立信号。每个信号都写进 evidence，裁定时看得见理由，也才拆得开。
 *
 * 退出码：0 正常；2 用法错；判据退化（候选 0 组而语料非空）不报错而是打印醒目一行——
 * 这个脚本的"0 命中"通常意味着窗口或信号写坏了，所以它自带阳性对照（test-related-candidates.mjs）。 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAP_MAX = 5;          // 跨轨关联的时间窗上限（年）
const CO_WORD_MIN = 4;      // 汉字最长公共子串下限；<4 时"战役""国王"这类通名会淹没一切
const LAT_MIN = 3;          // 拉丁 token 短于 3 字符（UN/AI/II）噪声大于信息
const argNum = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  if (i < 0) return dflt;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) { console.error(`用法错：${flag} 需要一个数字参数`); process.exit(2); }
  return v;
};
const TOP = argNum("--top", 60);
const MIN = argNum("--min", 0);
const SHOW_ALL = process.argv.includes("--all");
const WEAK = process.argv.includes("--weak");   // 连"仅同年/同维"的邻近对一起出（实测绝大多数是噪声）
const COMPACT = process.argv.includes("--compact");
const AS_JSON = process.argv.includes("--json");

/* ---------- 载入语料 ---------- */
function loadAll() {
  const out = [];
  for (const [sub, prefix] of [["cn", "cn"], ["wd", "world"]]) {
    for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
      const key = path.basename(n, ".js");
      const win = { window: {} };
      const buf = fs.readFileSync(path.join(ROOT, "data", sub, n), "utf8");
      try { new Function("window", buf)(win.window); } catch (e) { throw new Error(`${key}: ${e.message}`); }
      const arr = win.window.__CHRONICLE_CHUNK[key];
      if (!Array.isArray(arr)) throw new Error(`${key}: 没有导出同名全局数组`);
      for (const e of arr) out.push({ ...e, __shard: key, __prefix: prefix });
    }
  }
  return out;
}

const nom = (s) => String(s || "").replace(/[\s（）()、,，。.:：;；"'「」『』《》]/g, "").trim();
const hanOnly = (t) => (typeof t === "string" ? t : "").replace(/[^\p{Script=Han}]/gu, "");
const LATIN = /[A-Za-z][A-Za-z0-9-]{1,}/g;
const latTokens = (e) => new Set((((e.title || "") + " " + (e.summary || "")).match(LATIN) || [])
  .map((s) => s.toUpperCase()).filter((s) => s.length >= LAT_MIN));

/* 汉字最长公共连续子串：标题是十来字的汉字串，DP 的 O(nm) 在这里是常数级 */
function hanLcs(a, b) {
  let best = 0, end = 0;
  const m = b.length;
  let prev = new Array(m + 1).fill(0), cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) { best = cur[j]; end = i; }
    }
    const tmp = prev; prev = cur; cur = tmp; cur.fill(0);
  }
  return { s: a.slice(end - best, end), n: best };
}

/* ---------- 打分：list 里每个事件向对侧轨道找候选 ----------
 * 每个"名号类"信号都要过**文档频率 df** 这一关：毛泽东在语料里出现 120 次、
 * 中华人民共和国出现在几乎所有中轨条目里——这类 token 相连的两点没有信息量，
 * 只配做排序项，不配做准入项。强信号（strong）= 至少一个 df 足够低的共名/共词/拉丁，
 * 仅靠"同年""同维"永远进不来（实测：那样 44102 组里 43236 组是这类噪声）。 */
const DF_FIG = 25;          // 共享人物名可作强信号的语料出现上限
const DF_TAG = 8;           // 共享标签
const DF_GEO = 8;           // 共享地望
const CO_DF = 6;            // 共词可作强信号的"标题里出现过几次"上限

function score(pairs, list, byYear, df) {
  for (const ev of list) {
    const myFig = new Set((ev.detail?.figures || []).map(nom).filter(Boolean));
    const myLat = latTokens(ev);
    const myTag = new Set((ev.detail?.tags || []).map(nom).filter(Boolean));
    const myGeo = new Set([nom(ev.detail?.place), nom(ev.detail?.state)].filter(Boolean));
    const hanTitle = hanOnly(ev.title);
    for (let y = ev.year - GAP_MAX; y <= ev.year + GAP_MAX; y++) {
      for (const o of byYear.get(y) || []) {
        if (o.track === ev.track) continue;
        if (o.id <= ev.id) continue;               // 每对只留一次，且顺序稳定
        const gap = Math.abs(o.year - ev.year);
        const why = [];
        let s = gap === 0 ? 2 : gap <= 1 ? 1 : 0;
        let strong = false;
        const oFig = new Set((o.detail?.figures || []).map(nom).filter(Boolean));
        const shFig = [...myFig].filter((x) => oFig.has(x));
        if (shFig.length) {
          /* 多个共享人物时以**最稀见**那个定档：真关联常同时提到主角与高频配角，只要有一个低频共名
           * 就是证据。若反取 df 最大值（要求全低频），实测 --min 4 候选从 121 组掉到 101 组，
           * 并丢掉 8 条已裁定的真边——含 cn--1976--p04⟷world--1976--p01（毛泽东逝世 ⟷ 毛泽东在北京逝世），
           * 其共名只有 毛泽东(120)/华国锋(17)/叶剑英(24)，按"最泛者定档"必被判过泛。 */
          const f = Math.min(...shFig.map((x) => df.fig.get(x) || 1));
          if (f <= DF_FIG) {
            strong = true;
            s += f <= 3 ? 4 : f <= 10 ? 3 : 1;
            why.push(`人物:${shFig.join("/")}(${shFig.map((x) => df.fig.get(x) || 1).join("/")})`);
          } else why.push(`人物(过泛):${shFig.join("/")}(${f})`);
        }
        const shLat = [...myLat].filter((x) => latTokens(o).has(x));
        if (shLat.length) { strong = true; s += 4; why.push(`拉丁:${shLat.join("/")}`); }
        const cw = hanLcs(hanTitle, hanOnly(o.title));
        if (cw.n >= CO_WORD_MIN) {
          /* 共词必须"不通用"才算强信号：实测真候选的标题 df 最高 4，而国名
           * 「中华人民共和国」df 17、「届三中全会」df 8——都是噪声。取 6 只拦得住
           * 这一类；「条约生效」「颗原子弹」这种通名残片 df 本身就是 4，拦不住，留给裁定。 */
          const tdf = df.titleCount(cw.s);
          if (tdf <= CO_DF) { strong = true; s += cw.n >= 6 ? 4 : 2; }
          else s += 1;
          why.push(`共词「${cw.s}」${cw.n}字(标题${tdf})`);
        }
        const oTag = new Set((o.detail?.tags || []).map(nom).filter(Boolean));
        const shTag = [...myTag].filter((x) => oTag.has(x) && x.length >= 3 && (df.tag.get(x) || 1) <= DF_TAG);
        if (shTag.length) { strong = true; s += 2; why.push(`标签:${shTag.join("/")}(${shTag.map((x) => df.tag.get(x) || 1).join("/")})`); }
        const oGeo = new Set([nom(o.detail?.place), nom(o.detail?.state)].filter(Boolean));
        const shGeo = [...myGeo].filter((x) => oGeo.has(x) && (df.geo.get(x) || 1) <= DF_GEO);
        if (shGeo.length) { strong = true; s += 2; why.push(`地望:${shGeo.join("/")}(${shGeo.map((x) => df.geo.get(x) || 1).join("/")})`); }
        if (ev.dim === o.dim) { s += 1; why.push(`同维:${ev.dim}`); }
        if (s < MIN) continue;
        if (!strong && !WEAK) continue;
        pairs.push({
          a: ev.id, b: o.id, aW: ev.weight, bW: o.weight,
          aTitle: ev.title, bTitle: o.title, aYear: ev.year, bYear: o.year,
          aDim: ev.dim, bDim: o.dim,
          aShard: ev.__shard, bShard: o.__shard,
          score: s, gap, strong, evidence: why.join("、"),
        });
      }
    }
  }
}

/* ---------- 主流程 ---------- */
const all = loadAll();
const cn = all.filter((e) => e.track === "cn"), wd = all.filter((e) => e.track === "world");
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
const df = { fig: new Map(), tag: new Map(), geo: new Map() };
for (const e of all) {
  for (const f of new Set((e.detail?.figures || []).map(nom).filter(Boolean))) bump(df.fig, f);
  for (const t of new Set((e.detail?.tags || []).map(nom).filter(Boolean))) bump(df.tag, t);
  for (const g of new Set([nom(e.detail?.place), nom(e.detail?.state)].filter(Boolean))) bump(df.geo, g);
}
/* 共词的"通用度"= 有多少条标题含它。候选对的共词串种类有限，按串缓存。 */
const hanTitles = all.map((e) => hanOnly(e.title));
const tcache = new Map();
df.titleCount = (s) => {
  if (!tcache.has(s)) tcache.set(s, hanTitles.reduce((n, t) => n + (t.includes(s) ? 1 : 0), 0));
  return tcache.get(s);
};
const byYear = new Map();
for (const e of all) {
  if (!byYear.has(e.year)) byYear.set(e.year, []);
  byYear.get(e.year).push(e);
}
const pairs = [];
score(pairs, cn, byYear, df);
score(pairs, wd, byYear, df);
pairs.sort((x, y) => y.score - x.score || x.gap - y.gap || (x.a < y.a ? -1 : 1));

if (AS_JSON) { console.log(JSON.stringify(pairs, null, 1)); process.exit(0); }

const uniq = new Set();
for (const p of pairs) { uniq.add(p.a); uniq.add(p.b); }
const sideCount = (t) => [...uniq].filter((i) => i.startsWith(t + "--")).length;
console.log(`语料 ${all.length} 条（中 ${cn.length} / 世 ${wd.length}）`);
console.log(`±${GAP_MAX} 年窗口内跨轨候选 ${pairs.length} 组，涉及事件 ${uniq.size} 个（中 ${sideCount("cn")} / 世 ${sideCount("world")}）`);
if (!pairs.length && all.length) console.log("!! 候选为 0 组：要么真的无可关联，要么窗口/信号写坏了——先跑 test-related-candidates.mjs 的阳性对照再下结论");
const dist = {};
for (const p of pairs) dist[p.score] = (dist[p.score] || 0) + 1;
console.log("分数分布: " + Object.entries(dist).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k}分=${v}`).join(" "));
const shown = SHOW_ALL ? pairs : pairs.slice(0, TOP);
if (COMPACT) {
  for (const p of shown)
    console.log(`[${String(p.score).padStart(2)}] ${p.a} w${p.aW} ${p.aTitle}(${p.aYear}) ⟷ ${p.b} w${p.bW} ${p.bTitle}(${p.bYear}) | ${p.evidence}`);
} else for (const p of shown) {
  console.log(`\n[${p.score}] ${p.a} w${p.aW}「${p.aTitle}」 (${p.aYear})`);
  console.log(`  ⟷  ${p.b} w${p.bW}「${p.bTitle}」 (${p.bYear}) 年差${p.gap}`);
  console.log(`     证据: ${p.evidence}`);
}
if (!SHOW_ALL && pairs.length > TOP) console.log(`\n（共 ${pairs.length} 组，已按分数截断显示前 ${TOP}；--all 看全量，--min N 提高下限）`);
