/* geo-lib.mjs | 古今地名匹配的唯一口径（候选器 / 落盘器 / 校验器共用一份）
 *
 * 为什么单独成文件：匹配规则一旦在三个脚本里各写一遍，就会量出三个答案——
 * 候选器说覆盖了 62%，落盘器只落 55%，校验器按第三套口径判绿。本项目在权重门上
 * 踩过这个坑（文案一条带、代码另一条带），这里从一开始就不给第二次机会。
 *
 * 口径：取 detail.place 里「今<地名>」的宾语，在 gazetteer 的 keys 里做**最长子串**命中。
 *   「陕西西安西北」→ 西安（方位 NW，落针时偏移）
 *   「湖北荆州西北纪南城」→ 纪南城（比「荆州」长，命中楚都而非今市）
 *   「山东淄博临淄」→ 临淄
 * 命中不到的一律进「未映射」清单，由 tools/geo-candidates.mjs 按条数排序报出来，
 * 让补表的人先补最肥的缺口，而不是凭印象猜。
 */
import fs from "fs";
import path from "path";
import vm from "vm";

const DEFAULT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let ROOT = DEFAULT_ROOT;
/* 测试与工具可以指向一个夹具目录跑同一套判据（test-geo 用合成语料证明每道门能红）。
 * 只留这一个入口：夹具若另抄一份解析逻辑，测的就不再是生产的那道门。 */
export function useRoot(dir) { ROOT = dir ? path.resolve(dir) : DEFAULT_ROOT; }
export function getRoot() { return ROOT; }

/* 语料分片与 gazetteer 都是 window.__X = ... 形态（file:// 硬约束），用 vm 垫片求值。 */
function evalWindowFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const sb = { window: {} };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  return sb;
}

export function loadCorpus() {
  const out = [];
  for (const d of ["data/cn", "data/wd"]) {
    const dir = path.join(ROOT, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
      const sb = evalWindowFile(path.join(d, f));
      const chunk = sb && sb.__CHRONICLE_CHUNK;
      if (!chunk) continue;
      for (const id of Object.keys(chunk)) for (const ev of chunk[id]) out.push(ev);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function loadPlaces() {
  const sb = evalWindowFile("data/geo/places.js");
  const P = sb && sb.__CHRONICLE_PLACES;
  if (!P || !Array.isArray(P.list)) return { version: 0, list: [], byKey: new Map(), keyIndex: [] };
  const byKey = new Map(P.list.map((p) => [p.key, p]));
  /* key -> place，排序即命中优先级：
   * ① 长词优先——「纪南城」赢过「荆州」、「大理国」赢过「大理」。
   * ② 同长时点位优先于区域——「河南洛阳」里「洛阳」与「河南」同长，
   *    若让省份赢，实测 henan_region 一口气吞 170 条，地图上一片糊。
   * ③ 字典序只作最后决胜，保证可重复产出。 */
  const keyIndex = [];
  for (const p of P.list) for (const k of p.keys || []) if (k && k.length >= 2) keyIndex.push({ k, key: p.key, region: p.kind === "region" ? 1 : 0 });
  keyIndex.sort((a, b) => b.k.length - a.k.length || a.region - b.region || a.k.localeCompare(b.k));
  return { version: P.version || 1, list: P.list, byKey, keyIndex };
}

/* 「今江苏徐州」/「今陕西西安西北」/「今（河南洛阳）」——取今后面的宾语，
 * 以标点/括号/空白截断，最多 14 字（再长基本是句子不是地名）。 */
const JIN_RE = /今[（(]?([^\s（）()、，,。；;：:""""]{2,14})/g;
export function jinTokens(placeStr) {
  if (!placeStr) return [];
  const out = [];
  for (const m of String(placeStr).matchAll(JIN_RE)) out.push(m[1]);
  return out;
}

const DIRS = {
  "东北": "ne", "西北": "nw", "东南": "se", "西南": "sw",
  "东": "e", "南": "s", "西": "w", "北": "n", "中": "c", "内": "c", "附近": "c", "一带": "c",
};
/* 方位词必须出现在命中 key **之后**才算偏移：「山西大同东北」是平城东北方向，
 * 而「陕西咸阳东北」里的「东北」同样落在 key 之后——两种写法都靠尾缀判定。 */
function dirAfter(token, key) {
  const at = token.indexOf(key);
  if (at < 0) return null;
  const tail = token.slice(at + key.length);
  for (const [zh, code] of Object.entries(DIRS)) if (tail.startsWith(zh)) return code;
  return null;
}

/* 返回 { key, dir } 或 null。dir 只在 key 之后出现方位词时给。 */
export function matchToken(token, places) {
  for (const { k, key } of places.keyIndex) {
    if (token.indexOf(k) >= 0) return { key, dir: dirAfter(token, k) };
  }
  return null;
}

export function matchEvent(ev, places) {
  const raw = (ev.detail && ev.detail.place) || "";
  /* ① 先按「今X」宾语命中——这是语料里最明确的古今对照信号。 */
  for (const t of jinTokens(raw)) {
    const m = matchToken(t, places);
    if (m) return { place: m.key, dir: m.dir || null, via: t, how: "jin" };
  }
  /* ② 兜底：整串走同一条最长命中。
   * 全库只有 2036/4910 条写了「今」，另外「浙江杭州余杭区瓶窑镇一带」「山西襄汾陶寺乡」
   * 这类写法没有「今」字，只按①判就永久命不中——覆盖率天花板会卡在 41%，
   * 而看起来像「表不够全」。兜底用同一个匹配器、同一套优先级，不另起口径。 */
  const m = matchToken(raw, places);
  if (m) return { place: m.key, dir: m.dir || null, via: raw.slice(0, 20), how: "whole" };
  return null;
}

/* 全量映射：eventId -> { place, dir }。纯函数，不落盘。 */
export function buildMapping(corpus, places) {
  const map = new Map();
  for (const ev of corpus) {
    const m = matchEvent(ev, places);
    if (m) map.set(ev.id, { place: m.place, dir: m.dir });
  }
  return map;
}

/* 未命中 token 的词频——补表时先看这份清单，别猜。
 * 判「未命中」必须与 matchEvent 同口径（今X 与整串两条都失败才算漏），
 * 否则候选器报的缺口比真实缺口大，补表的人会去补一批其实已经命中的词。 */
export function unmatchedTokens(corpus, places) {
  const cnt = new Map();
  for (const ev of corpus) {
    if (matchEvent(ev, places)) continue;
    const toks = jinTokens(ev.detail && ev.detail.place);
    const pool = toks.length ? toks : [String((ev.detail && ev.detail.place) || "").slice(0, 14)];
    for (const t of pool) {
      const bare = t.replace(/(一带|附近|境内|周边|市|县|区|镇|乡)$/, "");
      if (bare.length < 2) continue;
      cnt.set(bare, (cnt.get(bare) || 0) + 1);
    }
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function coverage(corpus, mapping) {
  const hi = corpus.filter((e) => e.weight >= 4);
  const n = (list) => list.filter((e) => mapping.has(e.id)).length;
  return {
    all: [n(corpus), corpus.length],
    w45: [n(hi), hi.length],
    cn: [n(corpus.filter((e) => e.track === "cn")), corpus.filter((e) => e.track === "cn").length],
    world: [n(corpus.filter((e) => e.track === "world")), corpus.filter((e) => e.track === "world").length],
  };
}

/* 叠加层的唯一序列化处：geo-apply 写它，validate-geo 重算它并与盘上逐字比。
 * 两边各写一遍序列化，就会有一边先改格式、另一边把「格式不同」当成「数据不同」。 */
export function renderOverlay(mapping) {
  const body = [...mapping.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, m]) => `  ${JSON.stringify(id)}: {p:${JSON.stringify(m.place)}${m.dir ? `,d:${JSON.stringify(m.dir)}` : ""}}`)
    .join(",\n");
  return `/* chronicle geo | 事件地理叠加层（由 tools/geo-apply.mjs 生成，勿手改）
 *
 * 来源只有一条：tools/geo-places.tbl 的 gazetteer 对语料 detail.place 做最长命中
 * （口径唯一实现在 tools/geo-lib.mjs）。改语料或改地名表后必须重跑
 *   node tools/geo-apply.mjs --write
 * 否则 tools/validate-geo.mjs 的 SYNC 门会重算一遍并与本文件比对，不一致即判红。
 *
 * 字段：p = placeKey（指向 __CHRONICLE_PLACES），d = 语料方位词（nw/ne/se/sw/n/s/e/w/c）。
 * 方位偏移在渲染侧按固定表换算，这里只存语义，不存算出来的坐标。
 */
window.__CHRONICLE_EVENT_PLACES = {
${body}
};
`;
}

export { ROOT };
