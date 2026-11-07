/* e2e-static.mjs | 零构建 / file:// 可跑不变量的静态门
 * 用法: node tools/e2e-static.mjs
 *
 * 为什么需要这道门：本项目的第一约束是「双击 index.html 在 file:// 下完整工作」。
 * 这条约束一旦破坏，浏览器里往往仍能跑（http 伺服下 fetch/Worker/module 都合法），
 * 只在用户真实使用场景下才炸——也就是说日常测试抓不到它。
 * 更糟的是它会被一行代码悄悄破坏：加一个 fetch、把某模块改成 ES module、
 * 或引用一个不存在的 css 资源。故把不变量写成硬门。
 *
 * 检查项：
 *   ASSET_MISSING  index.html 引用的本地资源不存在
 *   ASSET_REMOTE   引用了 http(s):// 外部资源（离线即失效）
 *   ABS_PATH       用了根绝对路径（/js/…）：file:// 与子路径部署下必 404
 *   FILE_URL_BREAK 使用 fetch/XHR/Worker/动态 import/ES module/require
 *   CHRON_ORDER    脚本顺序与 window.Chron* 的实际读取顺序矛盾（顶层读取先于发布）
 *   CSS_URL        css 内 url() 指向不存在的本地文件
 *   SHARD_UNLISTED manifest 声明的分片文件缺失
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const errs = [];
const notes = [];

const html = read("index.html");

/* ① 本地资源存在性 + ② 无外部引用 */
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?>/gi)]
  .map((m) => {
    const tag = m[0];
    const src = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    return src ? { tag, url: src[1] } : null;
  })
  .filter(Boolean);

const jsFiles = [], cssFiles = [];
for (const { tag, url } of refs) {
  if (/^(https?:)?\/\//i.test(url)) {
    errs.push(`ASSET_REMOTE 外部引用，离线即失效: ${url}`);
    continue;
  }
  /* 根绝对路径在两种部署形态下都是死的：file:// 解析成 file:///js/…，
   * 项目页解析成 https://<owner>.github.io/js/…（少了 /<repo>）——两边都 404，
   * 而站点主页托管下却正常，等于埋一颗只有换域名才炸的雷。必须在存在性检查之前拦。 */
  if (url.startsWith("/")) {
    errs.push(`ABS_PATH 根绝对路径，file:// 与子路径部署下必失效: ${url}`);
    continue;
  }
  if (/^[a-z]+:/i.test(url) || url.startsWith("data:")) continue;
  const clean = url.split(/[?#]/)[0];
  if (!fs.existsSync(path.join(ROOT, clean))) {
    errs.push(`ASSET_MISSING 引用目标不存在: ${clean}`);
    continue;
  }
  if (/\bscript\b/i.test(tag) && clean.endsWith(".js")) jsFiles.push(clean);
  if (/\blink\b/i.test(tag) && clean.endsWith(".css")) cssFiles.push(clean);
}

/* 内联 <script> 也要查 FILE_URL_BREAK */
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

/* ③ file:// 破坏性 API */
const BREAK = [
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bnew\s+(?:Worker|SharedWorker|ServiceWorker)\b/, "Worker"],
  [/\bimport\s*\(/, "动态 import()"],
  [/^\s*import[\s{]/m, "ES module import 语句"],
  [/^\s*export[\s{]/m, "ES module export 语句"],
  [/\brequire\s*\(/, "require()"],
  [/<script[^>]*\btype\s*=\s*["']module["']/i, 'type="module"'],
];
for (const f of jsFiles) {
  const src = read(f);
  for (const [re, label] of BREAK) {
    if (re.test(src)) errs.push(`FILE_URL_BREAK ${f}: 使用 ${label}，file:// 下不可用`);
  }
}
for (let i = 0; i < inline.length; i++) {
  for (const [re, label] of BREAK) {
    if (re.test(inline[i])) errs.push(`FILE_URL_BREAK index.html 内联脚本#${i}: 使用 ${label}`);
  }
}

/* 整行注释（含块注释体内的行）不参与顺序判定。
 * 为什么要显式排掉：模块头普遍写着「发布：window.ChronX」这类说明，
 * 把它当成加载期读取会让门为一行散文变红——噪声门的下场是被人改写注释绕过，
 * 而不是有人去修脚本顺序。真正的读取发生在代码行，那条路径保持原样照抓。 */
function blankLineComments(src) {
  let inBlock = false;
  return src.split("\n").map((line) => {
    const t = line.trim();
    if (inBlock) { if (t.includes("*/")) inBlock = false; return ""; }
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; return ""; }
    if (t.startsWith("//") || t.startsWith("*")) return "";
    return line;
  }).join("\n");
}

/* ④ 脚本顺序 vs window.Chron* 读取顺序（只算顶层读取，函数体内的延迟读取不算） */
const PUB = /window\.(Chron[A-Za-z]*)\s*=/g;
/* (?!=) 排除赋值左值：`window.ChronTime = {` 这一行同时命中 PUB 和 READ，
 * 不排掉的话每个自发布文件都会被判成"顶层读取自己"——实测基线 18 条全是这条假阳性。
 * 副作用：`if (window.ChronX === ...)` 这类存在性探测也会被排掉，
 * 那是少报不是多报，可以接受。 */
const READ = /window\.(Chron[A-Za-z]*)\b\s*(?!=)/g;
/* 顶层 = 加载期就会执行的读取。
 * 全站模块写成 (function(){...})()，所以「模块体内顶层」是大括号深度 1，不是 0——
 * 实测 timeline.js 的 4 个 Chron* 读取点有 3 个在深度 1。用深度 0 过滤会把它们全滤掉，
 * 使 CHRON_ORDER 变成永不变红的死门。深度 >=2 在函数体内，属延迟读取，不算。 */
function depthLines(src) {
  let depth = 0;
  return blankLineComments(src).split("\n").map((line) => {
    const d = depth;
    for (const ch of line) { if (ch === "{") depth++; else if (ch === "}") depth = Math.max(0, depth - 1); }
    return { d, line };
  });
}
/** 全局名 -> {f, line} 最早发布点；行号用于区分同文件内的前向/后向引用 */
const published = new Map();
const order = [];
for (const f of jsFiles) {
  depthLines(read(f)).forEach(({ line }, i) => {
    for (const m of line.matchAll(PUB)) if (!published.has(m[1])) published.set(m[1], { f, line: i + 1 });
  });
  order.push(f);
}
const seenPub = new Set();
for (const f of order) {
  depthLines(read(f)).forEach(({ d, line }, i) => {
    if (d > 1) return;
    const ln = i + 1;
    for (const m of line.matchAll(READ)) {
      const g = m[1];
      if (g === "ChronicleChunk" || g === "__CHRONICLE_CHUNK") continue;
      if (seenPub.has(g)) continue;
      const pub = published.get(g);
      /* 本文件自己发布、且读取不在发布之前 —— 顺序是安全的 */
      if (pub && pub.f === f && ln >= pub.line) continue;
      if (!pub) {
        errs.push(`CHRON_ORDER ${f}:${ln} 顶层读取 window.${g}，但全库无任何文件发布它`);
      } else {
        const ahead = pub.f === f ? `同一文件第 ${pub.line} 行才发布` : `由 ${pub.f} 发布且不在之前加载`;
        errs.push(`CHRON_ORDER ${f}:${ln} 顶层读取 window.${g}，而它${ahead}（脚本顺序=${order.join(" ")})`);
      }
    }
  });
  for (const m of read(f).matchAll(PUB)) seenPub.add(m[1]);
}

/* ⑤ CSS url() */
for (const f of cssFiles) {
  const src = read(f);
  for (const m of src.matchAll(/url\(\s*["']?([^"')]+)/g)) {
    const u = m[1].trim();
    if (/^(https?:|data:)/i.test(u)) { errs.push(`ASSET_REMOTE ${f}: url(${u})`); continue; }
    /* 与 html 侧同一条判据：css 里的 /… 相对的是域名根，不是本站根 */
    if (u.startsWith("/")) { errs.push(`ABS_PATH ${f}: url(${u}) 根绝对路径，子路径部署必失效`); continue; }
    const rel = path.join(path.dirname(f), u.split(/[?#]/)[0]);
    if (!fs.existsSync(path.join(ROOT, rel))) errs.push(`CSS_URL ${f}: url(${u}) 指向不存在的 ${rel}`);
  }
}

/* ⑥ manifest 声明的分片必须都在 */
const man = read("data/manifest.js");
const declared = [...man.matchAll(/["']?file["']?\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]);
if (!declared.length) {
  notes.push("SHARD_UNLISTED 未从 manifest 解析出 file 字段（格式可能已变），跳过该项检查");
} else {
  for (const d of declared) {
    if (!fs.existsSync(path.join(ROOT, "data", d)) && !fs.existsSync(path.join(ROOT, d))) {
      errs.push(`SHARD_UNLISTED manifest 声明缺失文件: ${d}`);
    }
  }
}

console.log(`file:// 不变量门 · 脚本 ${jsFiles.length} · 样式 ${cssFiles.length} · manifest 声明分片 ${declared.length}`);
notes.forEach((n) => console.log("  ~ " + n));
if (errs.length) {
  console.log(`\n✗ ${errs.length} 项违规：`);
  errs.slice(0, 40).forEach((e) => console.log("  " + e));
  if (errs.length > 40) console.log(`  …另 ${errs.length - 40} 项`);
  process.exit(1);
}
console.log("\n✅ 零构建不变量全部成立");
