#!/usr/bin/env node
/* 明史编年层 · 底本规范化
 *
 * 输入：build/mingshi/raw/msN.html —— 维基文库 action=parse 返回的卷页 HTML（繁体）
 * 输出：build/mingshi/txt/msN.txt   —— 去壳、繁转简后的纯正文
 *       build/mingshi/ledger.json   —— 逐卷台账（卷号、部类、卷题、字数、字节、抓取与转写时间、
 *                                      表外未收字、异体口径计数）
 *
 * 为什么要留台账：编年层每条引文都声称「核在某卷」，那就必须能说清
 * 我手里这一卷是什么时候抓的、有多少字、转写动过哪些字。缺了这一步，
 * 语料快照一旦中途追加，先前的「零命中」结论就会静默失效。
 *
 * 用法：node tools/mingshi-normalize.mjs [--from 1] [--to 332]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { juanNum } from "./mingshi-lib.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "build/mingshi/raw");
const TXT = path.join(ROOT, "build/mingshi/txt");
const LEDGER = path.join(ROOT, "build/mingshi/ledger.json");
const T2S_BASE = require(path.join(ROOT, "tools/t2s-table.js"));

/* 维基文库简体页与 OpenCC 字符级口径的已知异体差异，在繁体侧改写映射，
   使「引文与出处页同字」。不在简体侧回折——那会把「余姚」「余干」一类
   本字是「余」的地名错改成「馀」。逐卷对拍得出，登记于 README 编年层小节。 */
const T2S = { ...T2S_BASE, 餘: "馀", 諮: "谘" };
delete T2S.釐;

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const FROM = opt("from", 1);
const TO = opt("to", 332);

fs.mkdirSync(TXT, { recursive: true });

const toSimplified = (s) => s.replace(/[㐀-鿿]/g, (c) => T2S[c] || c);

function strip(html) {
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<table class="box-notice[\s\S]*?<\/table>/gi, "")
    .replace(/<div class="mw-editsection[\s\S]*?<\/div>/gi, "")
    .replace(/<sup class="reference[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘").replace(/&rsquo;/g, "’")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  s = s.replace(/[ \t\r\n\u3000]+/g, "");
  // 脚注序号（实体解码后形如「[2]」）是维基文库的编辑装置，不是《明史》正文；
  // 一律剥离，底本与引文才同字。
  s = s.replace(/\[\d+\]/g, "");
  // 年号标记重复：页面把「洪武元年」既作小标题又作正文起首，出现
  // 「洪武元年洪武元年春正月」「至正十二年十二年春二月」两式。合并后引文才是史文原样。
  s = s.replace(/([一-龥]{2})([元一二三四五六七八九十]{1,3})年\1\2年/g, "$1$2年");
  s = s.replace(/([一-龥]{2})([元一二三四五六七八九十]{1,3})年\2年/g, "$1$2年");
  // 史臣「赞曰／论曰」评述同样有标题与正文重出的现象（卷二十四末作「赞赞曰」）。
  s = s.replace(/(赞曰|论曰)(\1)/g, "$1");
  return s;
}

/** 掐头去尾：去导航与公版声明，只留卷文。
 *  头：卷页固定形如「◄明史卷七十二志第48職官一►職官二→姊妹计划:数据项<正文>」，
 *      「姊妹计划:数据项」是 MediaWiki 元数据条，正文一律从它之后起（117 卷全含此锚）。
 *  尾：「校勘记」小节一律截去（实测出现在页末 200 字内），再兜底清公版声明页脚。
 *  注：早先用的裸「取自」会在正文里误命中（卷九十三刑法一在第 372 字即出现），
 *      故改为只认页脚形「取自「URL」」。 */
function body(text) {
  let head = "";
  let s = text;
  const nav = s.indexOf("姊妹计划");
  if (nav > 0) {
    const open = s.lastIndexOf("◄", nav);
    const close = s.indexOf("►", nav);
    head = s.slice(open >= 0 ? open + 1 : 0, close > nav ? close : nav);
    s = s.slice(nav).replace(/^姊妹计划[:：]?数据项/, "");
  } else {
    const m = s.match(/明史卷[一二三四五六七八九十百零〇\d]+/);
    if (m && m.index > 0) { head = m[0]; s = s.slice(m.index); }
  }
  for (const c of ["校勘記", "校勘记", "此清朝作品", "Publicdomain"]) {
    const i = s.indexOf(c);
    if (i > 200) s = s.slice(0, i);
  }
  const footer = s.search(/取自[「"“]/);
  if (footer > 200) s = s.slice(0, footer);
  return { head, text: s.trim() };
}

/** 卷题与部类：本纪／志／表／列传。以页头（◄…►之间的卷题）为主判据，正文兜底。
 *  卷题一律剥到「卷N＋篇目」为止：列传页头在篇目后面紧跟一整串传主姓名
 *  （卷二百〇三是「列传第九十一郑岳刘玉汪元锡…」十四人），把它当卷题会误导核对，
 *  所以篇目串只在「不超过 6 字」时才收——「太祖诸子二」收，人名长串不收。
 *  「巻」（U+5DFB）是维基文库部分卷页用的异体，不并回来这些卷的卷题恒为空。
 *
 *  卷题有三种形状，门（ANNALS_CORPUS）按形状判它能不能当出处用：
 *    A「明史卷N＋篇目」——页上照抄，且 N 必须等于页名卷次；
 *    B「（页内无卷题…）＋页上篇目」——外国传几卷页头只有「列传第二百十四 外国七」，
 *      没有「明史卷N」，于是卷次只能依页名，这件事必须写在题里；
 *    C「（页内卷题作「…」，与页名卷N不符，不取）」——维基文库确有页内卷题写错的卷
 *      （卷154 的页头作「卷一百五十七」），照抄就是把读者支到另一页上去，宁可只报冲突。 */
function classify(head, text, juan) {
  const raw = (head || "") + (head ? "" : text.slice(0, 400));
  const t = raw.replace(/巻/g, "卷");
  let section = "unknown";
  if (/本紀|本纪/.test(t)) section = "本纪";
  else if (/列傳|列传/.test(t)) section = "列传";
  else if (/志第/.test(t)) section = "志";
  else if (/表第|年表/.test(t)) section = "表";
  const NUM = "[一二三四五六七八九十百千零〇\\d]+";
  const re = new RegExp(`明史(?:\\[\\d+\\])?卷${NUM}(?:${section === "unknown" ? "" : section}第${NUM})?`);
  const m = t.match(re);
  if (m) {
    let title = m[0];
    const rest = t.slice(m.index + m[0].length).match(/^([^◄►\s]{1,6})(?=►|$)/);
    if (rest) title += rest[0];
    const quoted = juanNum(title.match(new RegExp(`卷(${NUM})`))[1]);
    if (quoted === juan) return { title, section };
    return { title: `（页内卷题作「${title}」，与页名卷${juan}不符，不取）`, section };
  }
  const p = t.match(new RegExp(`(?:本紀|本纪|志|表|列傳|列传)第${NUM}`));
  /* 页上既无「明史卷N」也无「志第N／列传第N」：B 形状声明必须带一个读者翻到页上能核对的尾巴，
      写「页上无篇目」而不是留空——门（ANNALS_CORPUS）判 `）(.+)`，空尾巴在那一侧是判红的，
      两边形状不一致就是抽取器能合法产出门必拒的卷题。 */
  if (!p) return { title: `（页内无卷题，卷次依页名卷${juan}）页上无篇目`, section };
  let title = `（页内无卷题，卷次依页名卷${juan}）` + p[0];
  const rest = t.slice(p.index + p[0].length).match(/^ ?([^◄►\s]{1,6})(?=\s|►|$)/);
  if (rest) title += " " + rest[1];
  return { title, section };
}

/** 页脚注释里带 MediaWiki 的 revision id——它是「我核的到底是哪一版」的硬锚，
 *  比抓取时间戳可靠（同一 URL 内容可改，revision 不可改）。 */
function revision(html) {
  const m = html.match(/revision id (\d+)/);
  return m ? Number(m[1]) : null;
}

const ledgerPath = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {};
const now = new Date().toISOString().slice(0, 16).replace("T", " ");
let n = 0, thin = [];
const missing = [];

for (let v = FROM; v <= TO; v++) {
  const src = path.join(RAW, `ms${v}.html`);
  if (!fs.existsSync(src)) { missing.push(v); continue; }
  const rawHtml = fs.readFileSync(src, "utf8");
  const { head, text } = body(strip(toSimplified(rawHtml)));
  const { title, section } = classify(head, text, v);
  const rev = revision(rawHtml);
  const entry = {
    juan: v, section, title, head: head || undefined,
    chars: [...text].length,
    bytes: Buffer.byteLength(text),
    sourceBytes: Buffer.byteLength(rawHtml),
    revision: rev,
    at: now,
  };
  if (text.length < 500) {
    entry.thin = true;                 // 页面确实存在，但正文是「表格略」一类无可抽内容
    ledgerPath[`ms${v}`] = entry;
    thin.push(v);
    continue;
  }
  fs.writeFileSync(path.join(TXT, `ms${v}.txt`), text, "utf8");
  ledgerPath[`ms${v}`] = entry;
  n++;
}

fs.writeFileSync(LEDGER, JSON.stringify(ledgerPath, null, 1), "utf8");
const bySection = {};
for (const e of Object.values(ledgerPath)) bySection[e.section] = (bySection[e.section] || 0) + 1;
console.log(`本次转写 ${n} 卷；台账共 ${Object.keys(ledgerPath).length} 卷`);
console.log("部类分布：", JSON.stringify(bySection));
if (thin.length) console.log(`薄卷 ${thin.length} 个（页在而正文不足 500 字，多为「表格略」）：${thin.join(",")}`);
if (missing.length) console.log(`缺卷 ${missing.length} 个：${missing.slice(0, 30).join(",")}${missing.length > 30 ? "…" : ""}`);
