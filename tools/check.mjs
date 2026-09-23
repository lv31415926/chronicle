/* 分片自检（作者侧，比契约 §10 更严）
 * 用法: node tools/check.mjs data/wd/wd-03.js   或   data/cn/cn-05.js
 * track 与 id 前缀按 chunk key 推导，cn / world 两类分片都适用。
 * errs  = 契约硬性错误（必须 0；含 detailThin <90 字的过薄正文）
 * seq   = 同年同维内 id 序号未连号（由最终 normalizer 统一重排，非硬错）
 * miss  = related 指向全库（data/cn + data/wd）都不存在的「年+维」
 * seqref= related 序号不连但目标年维存在（normalizer 会自动映射）
 * lat   = 中文行文里残留的英文句子片段（需改写）
 * overlong = 正文 >300 字，仅计数不作错（代价是分片体积，见 validate 的 CHUNK_SIZE）
 */
import fs from "fs";
import { MAX_TITLE, MAX_SUMMARY } from "./limits.mjs";
global.window = {};
const f = process.argv[2];
if (!f) { console.error("用法: node tools/check.mjs data/{cn,wd}/<分片>.js"); process.exit(2); }
const src = fs.readFileSync(f, "utf8");
new Function("window", src)(global.window);
const key = f.replace(/\.js$/, "").match(/([a-z]{2}-\d\d)$/)[1];
/* track 与前缀必须由 chunk key 推导：写死 "world" 会让 cn 分片 100% 假报错，
 * 而代理会照着假报错把 cn-- 的 id 改成 world--，反而制造真错。 */
const PREFIX = /^cn-/.test(key) ? "cn" : "world";
const TRACK = PREFIX === "cn" ? "cn" : "world";
const arr = global.window.__CHRONICLE_CHUNK[key];
const DIMS = ["politics", "figure", "science", "culture", "art", "military", "economy", "institution", "explore", "disaster"];
const INIT = { politics: "p", figure: "f", science: "s", culture: "c", art: "a", military: "m", economy: "e", institution: "i", explore: "x", disaster: "d" };
const err = [], seq = [], miss = [], seqref = [], lat = [], overlong = [];
const all = [];
for (const dir of ["data/wd", "data/cn"]) {
  for (const g of fs.readdirSync(dir)) {
    if (!/\.js$/.test(g)) continue;
    global.window = {};
    try {
      new Function("window", fs.readFileSync(dir + "/" + g, "utf8"))(global.window);
    } catch (e2) {
      console.log("SKIP(暂不可解析，可能正被写): " + dir + "/" + g);
      continue;
    }
    for (const k of Object.keys(global.window.__CHRONICLE_CHUNK || {})) all.push(...global.window.__CHRONICLE_CHUNK[k]);
  }
}
const seen = new Set(), cnt = {}, ids = new Set(all.map((x) => x.id)), yd = new Set(all.map((x) => x.year + "|" + INIT[x.dim]));
const idOf = (e) => `${PREFIX}--${e.year < 0 ? "b" : ""}${Math.abs(e.year)}--${INIT[e.dim]}${String(cnt[e.year + e.dim]).padStart(2, "0")}`;
let prev = -Infinity;
const EN = /\b(the|and|of|with|for|from|that|this|was|were|its|his|her|their|not|but|also|into|upon|after|before|king|queen|church|battle|city|land|people|only|later|built|made|which|when|where|have|had|been|some|most|more|than|then|there|here|over|under|among|during|because|against|following|including|pilgrimage|collar|oath|dawn|ports|columns|arms|army|law|right|rights|money|trade|market|year|years|day|days|son|daughter|brother|death|power|kingdom|empire|church|god|lord|work|works)\b/;
arr.forEach((e) => {
  if (seen.has(e.id)) err.push("dup id " + e.id);
  seen.add(e.id);
  if (!Number.isInteger(e.year) || e.year === 0) err.push("bad year " + e.id);
  else {
    if (e.year < prev) err.push("year order " + e.id);
    prev = e.year;
  }
  if (!DIMS.includes(e.dim)) err.push("bad dim " + e.id + " " + e.dim);
  if (![1, 2, 3, 4, 5].includes(e.weight)) err.push("bad weight " + e.id);
  if (e.track !== TRACK) err.push("bad track " + e.id);
  if (typeof e.yearApprox !== "boolean") err.push("yearApprox " + e.id);
  const k = e.year + e.dim;
  cnt[k] = (cnt[k] || 0) + 1;
  if (e.id !== idOf(e)) seq.push(e.id);
  if (!e.title || [...e.title].length > MAX_TITLE) err.push(`title>${MAX_TITLE} ` + e.id);
  if (!e.summary || [...e.summary].length > MAX_SUMMARY) err.push(`summary>${MAX_SUMMARY} ` + e.id);
  const d = e.detail || {};
  ["background", "process", "impact", "place", "state"].forEach((x) => { if (!d[x]) err.push("missing detail." + x + " " + e.id); });
  if (!Array.isArray(d.figures) || d.figures.length < 1 || d.figures.length > 8) err.push("figures " + e.id);
  if (!Array.isArray(d.sources) || !d.sources.length) err.push("detail incomplete " + e.id);
  if (d.sources && d.sources.some((s) => /维基百科|wikipedia/i.test(String(s)))) err.push("source wiki " + e.id);
  if (!Array.isArray(d.tags) || d.tags.length < 2 || d.tags.length > 5) err.push("tags " + e.id);
  const extra = Object.keys(d).filter((x) => !["background", "process", "impact", "figures", "place", "state", "sources", "tags"].includes(x));
  if (extra.length) err.push("extra detail key " + e.id);
  if (!Array.isArray(e.related) || e.related.length > 4) err.push("related " + e.id);
  else e.related.forEach((r) => {
    if (r === e.id) err.push("related self " + e.id);
    if (!ids.has(r)) {
      const m = /^(?:cn|world)--(b?)(\d+)--([a-z])/.exec(r);
      if (!m || ![...yd].includes((m[1] === "b" ? -1 : 1) * Number(m[2]) + "|" + m[3])) miss.push(e.id + " -> " + r);
      else seqref.push(e.id + " -> " + r);
    }
  });
  const dl = [...(d.background || ""), ...(d.process || ""), ...(d.impact || "")].length;
  if (dl < 90) err.push("detailThin " + dl + " " + e.id);
  else if (dl > 300) overlong.push(dl + " " + e.id);
  const text = [e.title, e.summary, d.background, d.process, d.impact, d.place, d.state, ...(d.tags || []), ...(d.figures || [])].join(" ");
  (text.match(/[A-Za-z][A-Za-z -]{3,}/g) || []).forEach((w) => { if (EN.test(w)) lat.push(e.id + " | " + w.trim()); });
});
const W = (n) => arr.filter((e) => e.weight === n).length;
const D = (k) => arr.filter((e) => e.dim === k).length;
console.log("count", arr.length, "errs", err.length, "| seq", seq.length, "miss", miss.length, "seqref", seqref.length, "lat", lat.length);
console.log("overlong>300", overlong.length, "(长文不算错：详情面板可滚动；其代价是分片体积，由 validate 的 CHUNK_SIZE 门管)");
console.log("w5", W(5), ((W(5) / arr.length) * 100).toFixed(1) + "%", "w4", W(4), "w3", W(3), "w2", W(2), "w1", W(1), "ge4", (((W(5) + W(4)) / arr.length) * 100).toFixed(1) + "%");
console.log("dims", DIMS.map((k) => k[0] + D(k)).join(" "));
[...err, ...miss, ...lat.slice(0, 15)].slice(0, 40).forEach((x) => console.log(" -", x));
if (process.argv.includes("-v")) seq.forEach((x) => console.log(" seq", x));
