/* gen-topics.mjs | 由语料与地理层生成可被搜索索引的静态专题页 + sitemap
 * 用法: node tools/gen-topics.mjs [--base https://<owner>.github.io/<repo>/] [--places 40] [--check]
 *
 * 为什么要静态页：主站是 hash 路由的单页应用，`#/place/xian` 对爬虫不是页面。
 * 参考项目靠 30 多个专题页吃到搜索流量，这是它分发上真正领先的一环——
 * 我们照做的是「把同一批数据摊成静态页」，不是抄它的文案。
 *
 * 页内每一个事实都来自语料或地名表，逐条带出处；生成器不写一句自己的判断。
 * canonical 基址默认从 index.html 里 __CHRONICLE_CONTRIB_REPO 的 owner/repo 推出来
 * （GitHub Pages 的固定形状），换域名必须显式传 --base——猜错的 canonical 比没有更坏。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import * as geoLib from "./geo-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "topics");

const baseArg = process.argv.indexOf("--base");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const repoM = /__CHRONICLE_CONTRIB_REPO\s*=\s*"([^"]+)"/.exec(html);
const derived = repoM ? "https://" + repoM[1].split("/")[0].toLowerCase() + ".github.io/" + repoM[1].split("/")[1] + "/" : "";
const BASE = baseArg > 0 ? process.argv[baseArg + 1].replace(/\/?$/, "/") : derived;
if (!BASE) { console.error("✗ 推不出 canonical 基址（index.html 里没写 __CHRONICLE_CONTRIB_REPO），请显式传 --base"); process.exit(1); }
if (!/https?:\/\//.test(BASE)) { console.error("✗ --base 必须是绝对 URL：" + BASE); process.exit(1); }
const placesArg = process.argv.indexOf("--places");
const TOP_PLACES = placesArg > 0 ? Number(process.argv[placesArg + 1]) : 40;

geoLib.useRoot(null);
const corpus = geoLib.loadCorpus();
const places = geoLib.loadPlaces();
const mapping = geoLib.buildMapping(corpus, places);

function evalFile(rel) {
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), sb, { filename: rel });
  return sb;
}
const meta = evalFile("data/meta.js").__CHRONICLE_META;
const journeys = evalFile("data/geo/journeys.js").__CHRONICLE_JOURNEYS || [];
if (!meta || !meta.tracks) { console.error("✗ data/meta.js 读不到 tracks"); process.exit(1); }

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtYear = (y, approx) => (approx ? "~" : "") + (y < 0 ? "前" + (-y) : String(y)) + "年";

/* 事件按地点归堆 */
const byId = new Map(corpus.map((e) => [e.id, e]));
const byPlace = new Map();
corpus.forEach((e) => {
  const m = mapping.get(e.id);
  if (!m) return;
  if (!byPlace.has(m.place)) byPlace.set(m.place, []);
  byPlace.get(m.place).push(e);
});
byPlace.forEach((list) => list.sort((a, b) => a.year - b.year || b.weight - a.weight));

function eventRow(e) {
  const p = mapping.get(e.id);
  const pl = p ? places.byKey.get(p.place) : null;
  const tk = meta.tracks[e.track];
  return "<li>" + esc(fmtYear(e.year, e.yearApprox)) +
    ' <a href="' + APP + "#/event/" + encodeURIComponent(e.id) + '">' + esc(e.title) + "</a>" +
    '<span class="sum">' + esc(e.summary) + "</span>" +
    '<span class="src">出处：' + (e.detail.sources || []).map(esc).join("；") + "</span>" +
    (pl ? '<span class="pl">地点：<a href="' + BASE + "topics/place-" + pl.key + '.html">' + esc(pl.zh) + "</a></span>" : "") +
    "</li>";
}
const APP = BASE + "index.html";

function shell({ file, title, desc, kw, body, crumbs, jsonLd }) {
  const htmlOut = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(kw)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${BASE}topics/${file}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}topics/${file}">
<meta property="og:site_name" content="时间长河 · River of Time">
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/layout.css">
<link rel="stylesheet" href="../css/components.css">
<link rel="stylesheet" href="./topic.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="topic-body">
<nav class="tp-crumb">${crumbs}</nav>
${body}
<footer class="tp-foot">
  <p>本页由 <code>tools/gen-topics.mjs</code> 从语料与地名表现算生成，不手写内容；
  每条事实自带出处，未标「已核」的叙述按本站口径只算「可查到哪一步」。</p>
  <p><a href="${APP}">打开完整时间轴</a> ｜ <a href="./index.html">专题目录</a></p>
</footer>
</body>
</html>
`;
  return htmlOut;
}

function listBlock(list, cap) {
  const shown = list.slice(0, cap || 60);
  return '<ol class="tp-list">' + shown.map(eventRow).join("") + "</ol>" +
    (list.length > shown.length ? `<p class="tp-more">本页列出前 ${shown.length} 条，共 ${list.length} 条；
      其余在<a href="${APP}">完整站点</a>里按筛选查看。</p>` : "");
}

/* ================= 地点页 ================= */
const topPlaces = [...byPlace.entries()]
  .filter(([k]) => { const p = places.byKey.get(k); return p && p.kind !== "region"; })
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .slice(0, TOP_PLACES);

const made = [];
topPlaces.forEach(([key, list]) => {
  const p = places.byKey.get(key);
  const pv = { locatable: 0, titled: 0 };
  list.forEach((e) => {
    const s = (e.detail.sources || [])[0] || "";
    if (/卷|篇|志|纪|传|年|页|§|\bv?\d/.test(s)) pv.locatable++; else pv.titled++;
  });
  const file = "place-" + key + ".html";
  const title = `${p.zh}（${p.modern}）· 本库 ${list.length} 条落点 | 时间长河`;
  const desc = `${p.zh}，今${p.modern}。本库在此地共收录 ${list.length} 条编年事件`
    + (p.note ? "。" + p.note : "") + `；出处：${(p.sources || []).join("、")}。`;
  const body = `<article class="tp-art">
<h1>${esc(p.zh)}<small>${esc(p.modern)}</small></h1>
<dl class="tp-meta">
  <dt>别名与今名</dt><dd>${esc((p.keys || []).join("、"))}</dd>
  <dt>坐标</dt><dd>${p.coord[0].toFixed(2)}°E, ${p.coord[1].toFixed(2)}°N（现代市区位置，非测绘成果）</dd>
  <dt>类型</dt><dd>${esc(p.kind)}${p.note ? " ｜ " + esc(p.note) : ""}</dd>
  <dt>地名识别参考</dt><dd>${(p.sources || []).map(esc).join("；")}</dd>
  <dt>本库收录</dt><dd>${list.length} 条 ｜ ${esc(fmtYear(list[0].year, list[0].yearApprox))} — ${esc(fmtYear(list[list.length - 1].year, list[list.length - 1].yearApprox))}
   ｜ 出处可定位 ${pv.locatable} 条、仅书名 ${pv.titled} 条</dd>
</dl>
<h2>此地事件（按时间）</h2>
${listBlock(list, 80)}
<p class="tp-cta"><a class="tp-btn" href="${APP}#/place/${encodeURIComponent(key)}">在时间轴里打开此地</a>
<a class="tp-btn" href="${APP}#/atlas?place=${encodeURIComponent(key)}">在舆图上看此地</a></p>
</article>`;
  fs.writeFileSync(path.join(OUT, file), shell({
    file, title, desc, kw: `${p.zh},${p.modern},${p.keys.join(",")},历史编年,时间长河`,
    crumbs: '<a href="./index.html">专题目录</a> › 地点',
    body,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: title, description: desc,
      url: BASE + "topics/" + file, inLanguage: "zh-CN",
      about: { "@type": "Place", name: p.zh, alternateName: p.keys, contentLocation: { "@type": "GeoCoordinates", latitude: p.coord[1], longitude: p.coord[0] } },
      isPartOf: { "@type": "WebSite", name: "时间长河", url: BASE } },
  }));
  made.push(file);
});

/* ================= 时代页 ================= */
const eras = [...(meta.cnEras || []).map((e) => ({ ...e, track: "cn" })), ...(meta.worldEras || []).map((e) => ({ ...e, track: "world" }))];
eras.forEach((era) => {
  const list = corpus.filter((e) => e.track === era.track && e.year >= era.from && e.year <= era.to)
    .sort((a, b) => a.year - b.year || b.weight - a.weight);
  if (list.length < 8) return;
  const hi = list.filter((e) => e.weight >= 4).length;
  const file = "era-" + era.id + ".html";
  const title = `${era.label}（${fmtYear(era.from, era.approx)} — ${fmtYear(era.to)}）· 本库 ${list.length} 条 | 时间长河`;
  const desc = `${era.label}${era.sub ? "（" + era.sub + "）" : ""}：本库收录 ${list.length} 条编年事件，其中重要度 4 级以上 ${hi} 条。`
    + list.filter((e) => e.weight === 5).slice(0, 6).map((e) => e.title).join("、");
  fs.writeFileSync(path.join(OUT, file), shell({
    file, title, desc, kw: `${era.label},编年史,大事年表,时间长河`,
    crumbs: '<a href="./index.html">专题目录</a> › 时代',
    body: `<article class="tp-art"><h1>${esc(era.label)}<small>${esc(era.sub || "")}</small></h1>
<p class="tp-lead">本时代收录 <b>${list.length}</b> 条，重要度 4 级以上 <b>${hi}</b> 条。
${era.approx ? "起止年代为学界推定值，本站一律以「~」标注。" : ""}</p>
${listBlock(list, 120)}
<p class="tp-cta"><a class="tp-btn" href="${APP}#/view/${era.from}/${era.to}">在时间轴里看这段</a></p></article>`,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: title, description: desc, url: BASE + "topics/" + file, inLanguage: "zh-CN" },
  }));
  made.push(file);
});

/* ================= 行迹页 ================= */
journeys.forEach((j) => {
  const file = "journey-" + j.key + ".html";
  const stops = (j.stops || []).map((s) => {
    const p = places.byKey.get(s.place);
    return { ...s, p };
  });
  const title = `${j.zh}（${fmtYear(j.span[0])} — ${fmtYear(j.span[1])}）· ${stops.length} 处行迹 | 时间长河`;
  const desc = `${j.person}：${j.note || ""} 共 ${stops.length} 站：` + stops.map((s) => (s.p ? s.p.zh : s.place)).join(" → ");
  fs.writeFileSync(path.join(OUT, file), shell({
    file, title, desc, kw: `${j.person},${j.zh},历史行迹,时间长河`,
    crumbs: '<a href="./index.html">专题目录</a> › 行迹',
    body: `<article class="tp-art"><h1>${esc(j.zh)}<small>${esc(j.person)}</small></h1>
<p class="tp-lead">${esc(j.note || "")}</p>
<p class="tp-src">行迹依据：${(j.sources || []).map(esc).join("；")}</p>
<ol class="tp-stops">` +
      stops.map((s) => `<li><b>${esc(fmtYear(s.year))}</b> ${esc(s.title)}
        <span class="pl">${s.p ? esc(s.p.zh) + "（" + esc(s.p.modern) + "）" : esc(s.place)}</span>
        <span class="sum">${esc(s.desc || "")}</span>
        <span class="src">${s.ev ? "语料条目 " + esc(s.ev) + "；" : ""}${(s.src || []).map(esc).join("；")}</span></li>`).join("") +
      `</ol>
<p class="tp-cta"><a class="tp-btn" href="${APP}#/atlas?journey=${encodeURIComponent(j.key)}">在舆图上走这条线</a>
<a class="tp-btn" href="${APP}#/person/${encodeURIComponent(j.key)}">读这条行迹</a></p></article>`,
    jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: title, description: desc, url: BASE + "topics/" + file, inLanguage: "zh-CN" },
  }));
  made.push(file);
});

/* ================= 看点页（视角层的静态面） ================= */
{
  const F = evalFile("data/frame/highlights.js").__CHRONICLE_FRAME;
  if (F && F.highlights && F.highlights.length) {
    const cards = F.highlights.map((h) => {
      const e = byId.get(h.id), c = h.claim || {}, pr = h.peer ? byId.get(h.peer.id) : null;
      if (!e) return "";
      return `<article class="hl-card">
  <h3><a href="${APP}#/event/${encodeURIComponent(e.id)}">${esc(e.title)}</a>
      <span class="hl-y">${esc(fmtYear(e.year, e.yearApprox))}</span>
      <span class="hl-tk">${esc(meta.tracks[e.track].short)}</span></h3>
  <p class="hl-why">${esc(h.why)}</p>
  <p class="hl-claim"><b>本站主张</b> ${esc(c.text || "")}
     ${c.strength ? `<em class="hl-st">${esc(c.strength)}</em>` : ""}</p>
  <blockquote class="hl-ground"><b>条目原文</b> ${esc(c.ground || "")}</blockquote>
  ${c.basis ? `<p class="hl-kou">判据：${esc(c.basis)}${c.scope ? " ｜ 范围：" + esc(c.scope) : ""}</p>` : ""}
  ${pr ? `<p class="hl-peer"><b>对照 · ${esc(h.peer.relation || "")}</b>
     <a href="${APP}#/event/${encodeURIComponent(pr.id)}">${esc(pr.title)}</a>
     （${esc(fmtYear(pr.year, pr.yearApprox))}）${esc(h.peer.note || "")}</p>` : ""}
  ${c.dispute ? `<p class="hl-dis"><b>争议与限度</b> ${esc(c.dispute)}</p>` : ""}
  <p class="hl-src">${(e.detail.sources || []).map((x) => "<code>" + esc(x) + "</code>").join(" ")}</p>
</article>`;
    }).join("\n");
    const file = "highlights.html";
    const title = "看点 · 本站的编辑立场（附条目原文与争议）| 时间长河";
    const desc = `时间长河看点 ${F.highlights.length} 条：每条主张逐字标出它所依据的条目原文、同期或后继的另一轨条目，以及学界分歧与限度。`;
    fs.writeFileSync(path.join(OUT, file), shell({
      file, title, desc, kw: "中国成就,历史对照,最早发明,科举,造纸,都江堰,常平仓,时间长河",
      crumbs: '<a href="./index.html">专题目录</a> › 看点',
      body: `<article class="tp-art"><h1>看点<small>视角层，不是事实层</small></h1>
<p class="tp-lead">${esc(F.stance || "")}</p>
<p class="tp-src">本页由 <code>tools/gen-topics.mjs</code> 从 <code>data/frame/highlights.js</code> 现算；
「条目原文」一段由 <code>tools/validate-frame.mjs</code> 逐字校验确实出现在该条目的正文里。</p>
${cards}</article>`,
      jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage",
        name: "时间长河 · 看点", description: desc, url: BASE + "topics/" + file, inLanguage: "zh-CN" },
    }));
    made.push(file);
    console.log(`看点页：${F.highlights.length} 条主张，全部带原文引证`);
  }
}

/* ================= 目录页与 sitemap ================= */
const idx = shell({
  file: "index.html",
  title: "时间长河 · 专题目录（地点 / 时代 / 行迹）",
  desc: `时间长河静态专题目录：${topPlaces.length} 个地点、${made.filter((f) => f.startsWith("era-")).length} 个时代、${journeys.length} 条人物行迹，全部由语料现算并逐条带出处。`,
  kw: "编年史,历史地点,时代年表,历史行迹,时间长河",
  crumbs: "专题目录",
  body: `<article class="tp-art"><h1>专题目录<small>共 ${made.length} 页</small></h1>
<h2><a href="./highlights.html">看点 · 本站编辑立场</a></h2>
<h2>地点（按本库收录条数）</h2><ul class="tp-nav">` +
    topPlaces.map(([k, l]) => { const p = places.byKey.get(k); return `<li><a href="./place-${k}.html">${esc(p.zh)}</a>（${esc(p.modern)}）· ${l.length} 条</li>`; }).join("") +
    `</ul><h2>时代</h2><ul class="tp-nav">` +
    made.filter((f) => f.startsWith("era-")).map((f) => `<li><a href="./${f}">${f.replace(/^era-|\.html$/g, "")}</a></li>`).join("") +
    `</ul><h2>人物行迹</h2><ul class="tp-nav">` +
    journeys.map((j) => `<li><a href="./journey-${j.key}.html">${esc(j.zh)}</a>（${esc(j.person)}）</li>`).join("") +
    `</ul></article>`,
  jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: "时间长河专题目录", url: BASE + "topics/index.html", inLanguage: "zh-CN" },
});
fs.writeFileSync(path.join(OUT, "index.html"), idx);

const today = new Date().toISOString().slice(0, 10);
const urls = [BASE, BASE + "topics/index.html", ...made.map((f) => BASE + "topics/" + f)];
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` + urls.map((u, i) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>${i === 0 ? "weekly" : "monthly"}</changefreq><priority>${i === 0 ? "1.0" : "0.7"}</priority></url>
`).join("") + `</urlset>
`);

console.log(`已生成 topics/：地点 ${topPlaces.length} · 时代 ${made.filter((f) => f.startsWith("era-")).length} · 行迹 ${journeys.length} · 目录 1 · sitemap ${urls.length} 条`);
console.log(`canonical 基址：${BASE}${baseArg > 0 ? "（--base 指定）" : "（由 index.html 的 __CHRONICLE_CONTRIB_REPO 推出，换域名请显式传 --base）"}`);
