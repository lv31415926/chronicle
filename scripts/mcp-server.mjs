#!/usr/bin/env node
/* mcp-server.mjs | 零依赖 MCP（stdio, JSON-RPC 2.0）：把本站语料暴露给 Agent
 * 用法: node scripts/mcp-server.mjs
 *
 * 与同类项目的差别：它返回的不只是「某地在某年属于哪个政权」，
 * 而是**条目 + 出处 + 溯源等级**。本站的立身之处是「读者能查到哪一步」，
 * 所以给 Agent 的每个答案都必须自带 sources 与 tier，否则模型会把我们的
 * 「仅书名」级叙述当成已核事实转述出去。
 *
 * 零依赖是硬约束：等级一律现算自 js/prov.js（唯一派生处），
 * 这里不复制一份判据——两处各写一遍，迟早量出两个答案。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import readline from "readline";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function evalFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const sb = { window: {}, document: undefined };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  return sb;
}

/* 浏览器 IIFE 在 vm 里照原样求值：数据与派生器都不改写。 */
const metaBox = evalFile("data/meta.js");
const provBox = evalFile("js/prov.js");
const MANIFEST = evalFile("data/manifest.js").__CHRONICLE_MANIFEST;
const corpus = [];
for (const c of MANIFEST.chunks) {
  const box = evalFile("data/" + c.file);
  if (box && box.__CHRONICLE_CHUNK) for (const id of Object.keys(box.__CHRONICLE_CHUNK)) corpus.push(...box.__CHRONICLE_CHUNK[id]);
}
const byId = new Map(corpus.map((e) => [e.id, e]));
const geo = {
  places: (evalFile("data/geo/places.js") || {}).__CHRONICLE_PLACES,
  overlay: (evalFile("data/geo/event-places.js") || {}).__CHRONICLE_EVENT_PLACES,
  journeys: (evalFile("data/geo/journeys.js") || {}).__CHRONICLE_JOURNEYS,
};
const placeByKey = new Map((geo.places ? geo.places.list : []).map((p) => [p.key, p]));
const PV = provBox.ChronProv;
const META = metaBox.__CHRONICLE_META;

const SITE = (process.env.CHRONICLE_SITE || "https://lv31415926.github.io/chronicle/").replace(/\/?$/, "/");

/* 等级一律现算自 js/prov.js：labelOf 吃的是档名、rankOf 吃的才是条目，
 * 传错参数不会报错，只会静默给出错误的标签——所以这里包一层，只暴露一种用法。 */
function tierOf(e) { return PV ? { key: PV.tierOf(e), label: PV.labelOf(PV.tierOf(e)), why: PV.explain(e) } : null; }
function view(e) {
  const m = geo.overlay ? geo.overlay[e.id] : null;
  const p = m && placeByKey.get(m.p) ? placeByKey.get(m.p) : null;
  return {
    id: e.id, track: e.track, year: e.year, yearApprox: !!e.yearApprox,
    dim: e.dim, dimLabel: META.dimensions[e.dim] ? META.dimensions[e.dim].label : e.dim,
    weight: e.weight, title: e.title, summary: e.summary,
    place: e.detail.place, state: e.detail.state, figures: e.detail.figures,
    tags: e.detail.tags, sources: e.detail.sources, checks: e.checks || [],
    provenance: tierOf(e),
    detail: { background: e.detail.background, process: e.detail.process, impact: e.detail.impact },
    related: e.related || [],
    location: p ? { key: p.key, zh: p.zh, modern: p.modern, coord: p.coord, approx: !!p.approx } : null,
    url: SITE + "index.html#/event/" + encodeURIComponent(e.id),
  };
}
function brief(e) {
  return { id: e.id, year: e.year, title: e.title, track: e.track, dim: e.dim,
    weight: e.weight, provenance: tierOf(e), sources: (e.detail.sources || []).slice(0, 3) };
}

/* ---------- 工具 ---------- */
const TOOLS = [
  { name: "inspect_event",
    description: "按条目 id 取一条编年事件的完整记录：背景/经过/影响、人物、地点、出处，以及本站现算的溯源等级与可分享链接。",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "条目 id，如 cn--b221--p01" } }, required: ["id"] },
    run: ({ id }) => { const e = byId.get(id); return e ? view(e) : { error: "条目不存在：" + id }; } },

  { name: "search_events",
    description: "在语料里做关键词检索（标题/摘要/人物/标签/正文），按重要度与年代排序。返回结果自带出处与溯源等级。",
    inputSchema: { type: "object", properties: {
      query: { type: "string" },
      track: { type: "string", enum: ["cn", "world"], description: "限定轨道" },
      dim: { type: "string", description: "限定维度 key，如 politics/military" },
      from: { type: "integer" }, to: { type: "integer" },
      minWeight: { type: "integer", minimum: 1, maximum: 5 },
      minTier: { type: "string", enum: ["unsourced", "titled", "locatable", "verified"], description: "只给查得到某一程度的结果" },
      limit: { type: "integer", maximum: 100 } }, required: ["query"] },
    run: ({ query, track, dim, from, to, minWeight, minTier, limit }) => {
      const q = String(query || "").toLowerCase().replace(/\s+/g, "");
      const floor = minTier && PV.RANK[minTier] != null ? PV.RANK[minTier] : 0;
      const out = [];
      for (const e of corpus) {
        if (track && e.track !== track) continue;
        if (dim && e.dim !== dim) continue;
        if (from != null && e.year < from) continue;
        if (to != null && e.year > to) continue;
        if (minWeight && e.weight < minWeight) continue;
        if (floor && PV.rankOf(e) < floor) continue;
        const hay = [e.title, e.summary, e.detail.background, e.detail.process, e.detail.impact,
          (e.detail.figures || []).join(""), (e.detail.tags || []).join(""), e.detail.place, e.detail.state].join("").toLowerCase().replace(/\s+/g, "");
        if (hay.indexOf(q) < 0) continue;
        out.push(e);
      }
      out.sort((a, b) => b.weight - a.weight || Math.abs(a.year) - Math.abs(b.year));
      return { total: out.length, returned: Math.min(out.length, limit || 20),
        items: out.slice(0, limit || 20).map(brief),
        note: "provenance 是本站按 sources/checks 现算的等级；verified=有人写明谁在何时查了哪一处" };
    } },

  { name: "place_at",
    description: "给一个古今地名（长安/建康/罗马/贝加尔湖…）与可选年代，返回该地的今名、坐标、出处，以及本库在此地的条目（含溯源等级）。不需要经纬度。",
    inputSchema: { type: "object", properties: {
      place: { type: "string", description: "中文/英文/拼音地名，古称或今名皆可" },
      from: { type: "integer" }, to: { type: "integer" }, limit: { type: "integer", maximum: 100 } },
      required: ["place"] },
    run: ({ place, from, to, limit }) => {
      const p = resolvePlace(place);
      if (!p) return { error: "地名表里没有「" + place + "」。可先调 search_atlas_places 看相近写法。" };
      const list = corpus.filter((e) => { const m = geo.overlay[e.id]; return m && m.p === p.key; })
        .filter((e) => (from == null || e.year >= from) && (to == null || e.year <= to))
        .sort((a, b) => a.year - b.year);
      return { place: { key: p.key, zh: p.zh, aliases: p.keys, modern: p.modern, coord: p.coord, kind: p.kind, approx: !!p.approx, sources: p.sources },
        total: list.length, items: list.slice(0, limit || 30).map(brief),
        url: SITE + "index.html#/place/" + encodeURIComponent(p.key),
        mapUrl: SITE + "index.html#/atlas?place=" + encodeURIComponent(p.key) };
    } },

  { name: "person_events",
    description: "给一个人名，返回本库提到他/她的全部条目（按年排序）；若该人物有策展行迹，一并给出站点与出处。",
    inputSchema: { type: "object", properties: { person: { type: "string" }, limit: { type: "integer", maximum: 200 } }, required: ["person"] },
    run: ({ person, limit }) => {
      const list = corpus.filter((e) => (e.detail.figures || []).some((f) => f === person || f.indexOf(person) >= 0))
        .sort((a, b) => a.year - b.year);
      const j = (geo.journeys || []).find((x) => x.person === person || x.zh.indexOf(person) >= 0);
      return { person, total: list.length, items: list.slice(0, limit || 40).map(brief),
        journey: j ? { key: j.key, zh: j.zh, span: j.span, sources: j.sources,
          stops: j.stops.map((s) => ({ year: s.year, place: s.place, title: s.title, ev: s.ev || null, src: s.src || [] })),
          url: SITE + "index.html#/atlas?journey=" + encodeURIComponent(j.key) } : null };
    } },

  { name: "compare_year",
    description: "同一年中国与世界各自收录了什么（本站的双线对照），按重要度排序并给溯源等级。",
    inputSchema: { type: "object", properties: { year: { type: "integer", description: "公元前用负数，无公元 0 年" }, window: { type: "integer", maximum: 50 } }, required: ["year"] },
    run: ({ year, window }) => {
      const w = window || 0;
      const inY = (e) => Math.abs(e.year - year) <= w;
      const cn = corpus.filter((e) => e.track === "cn" && inY(e)).sort((a, b) => b.weight - a.weight);
      const world = corpus.filter((e) => e.track === "world" && inY(e)).sort((a, b) => b.weight - a.weight);
      return { year, window: w, cn: cn.slice(0, 20).map(brief), world: world.slice(0, 20).map(brief),
        counts: { cn: cn.length, world: world.length },
        url: SITE + "index.html#/compare/" + year };
    } },

  { name: "atlas_stats",
    description: "本站规模与口径：条目数、两轨分布、地理覆盖率、溯源四档构成、地名表与行迹数量。用来判断引用是否够格。",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      const st = PV.stats(corpus);
      const geoHits = corpus.filter((e) => geo.overlay[e.id]).length;
      const hi = corpus.filter((e) => e.weight >= 4);
      return { events: corpus.length,
        byTrack: { cn: corpus.filter((e) => e.track === "cn").length, world: corpus.filter((e) => e.track === "world").length },
        yearRange: [Math.min(...corpus.map((e) => e.year)), Math.max(...corpus.map((e) => e.year))],
        provenance: st,
        geocoded: geoHits, geocodedW45: hi.filter((e) => geo.overlay[e.id]).length + "/" + hi.length,
        places: placeByKey.size, journeys: (geo.journeys || []).length,
        note: "溯源等级由 js/prov.js 现算，不写在数据里；「已核」需要 checks 里有谁/何时/查的哪一处。" };
    } },
];

function resolvePlace(q) {
  if (!geo.places) return null;
  const s = String(q || "").trim();
  for (const p of geo.places.list) {
    if (p.key === s || p.zh === s || p.modern === s) return p;
    if ((p.keys || []).indexOf(s) >= 0) return p;
  }
  let best = null, bestLen = 0;
  for (const p of geo.places.list) for (const k of p.keys || []) {
    if (k.length >= 2 && s.indexOf(k) >= 0 && k.length > bestLen) { best = p; bestLen = k.length; }
  }
  return best;
}

/* ---------- MCP 传输 ---------- */
const rpc = { jsonrpc: "2.0", id: null };
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyErr(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  const { id, method, params } = msg;
  if (method === "initialize") {
    return reply(id, { protocolVersion: (params && params.protocolVersion) || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "chronicle-atlas", version: "1.0.0" } });
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "tools/list") return reply(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === params.name);
    if (!t) return replyErr(id, -32601, "未知工具 " + params.name);
    let out;
    try { out = t.run(params.arguments || {}); }
    catch (e) { return replyErr(id, -32603, "工具执行失败：" + e.message); }
    return reply(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: !!(out && out.error) });
  }
  if (method === "ping") return reply(id, {});
  return replyErr(id, -32601, "不支持的方法 " + method);
});
