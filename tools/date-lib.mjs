/* date-lib.mjs | 「日」的唯一派生口径：从条目自己的文本里取出月与日，一个数都不手写
 *
 * 为什么必须由机器派生：本站要办「历史上的今天」，就必须给条目补上 month/day。
 * 手打的日期有两类错法——抄错一个数，以及把出处文书的日期当成事件发生的日期。
 * 前者门禁查不出（它只看得见格式），后者会把一条史实的日期抬进另一条史实里。
 * 实测证据（2026-11-06 对本库 4919 条取样）：cn--1949--p01 的 background 写的是
 * 「1949年6月15日新政协筹备会」，而 process 写的是「9月21日至30日」的全会本身——
 * 一个字段里两个年号两个日子，随便取一个就是造假。所以：
 *
 *   **只认条目自己文本里已经写明、且年份与本条一致的日子；同年出现两个不同日子即判歧义，整条不收。**
 *
 * 取数层级（自上而下，命中即止；how 字段就是这一层的名字，界面按它区别标示）：
 *   text     title/summary 里的阿拉伯「X年Y月Z日」，X === 本条 year
 *   process  detail.process 里的同形日期（经过段是本条自己的时间线）
 *   src      只在 detail.sources 里——这是**文书/文件落款的日期**，不等于事件发生日，界面必须另标
 *   text-cn  中文月日（「十二月十三日」）出现在 title/summary/process；只收 1912 年及以后。
 *            此前的人写中文月日多半是农历（实测样本：1898 年「四月二十三日」即农历四月廿三），
 *            换算要历表，而历表错一次就是把日期造假，所以一律不收。
 *   background / impact / related 一律不查：那两段本来就要提别的事件的日期。
 *
 * 本文件被 tools/date-candidates.mjs（出候选、落盘）与 tools/validate-dates.mjs（门）共用：
 * 生成器与校验器必须共用一份口径，否则门校验的是门自己的想象。
 */

const AR = "(\\d{1,4})\\s*年\\s*(0?[1-9]|1[0-2])\\s*月\\s*(0?[1-9]|[12][0-9]|3[01])\\s*日";
const AR_RE = new RegExp(AR, "g");
const CN_MON = "正元二三四五六七八九十冬腊";
const CN_DAY = "初十廿卅一二三四五六七八九";
/* 中文月日：可带一个阿拉伯年前缀（「1937年十二月十三日」），也可光杆（「十二月十三日」） */
const CN_RE = new RegExp("(?:(\\d{1,4})年)?([" + CN_MON + "]{1,2})月([" + CN_DAY + "]{1,3})日", "g");

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
export function cnNum(s) {
  if (!s) return 0;
  if (s[0] === "初") return CN_NUM[s[1]] || 0;
  if (s[0] === "廿") return 20 + (s[1] ? CN_NUM[s[1]] || 0 : 0);
  if (s[0] === "卅") return 30 + (s[1] ? CN_NUM[s[1]] || 0 : 0);
  if (s.length === 1) return CN_NUM[s] || 0;
  if (s[0] === "十") return 10 + (CN_NUM[s[1]] || 0);
  if (s[1] === "十") {
    const tens = CN_NUM[s[0]];
    if (!tens) return 0;
    return s.length === 2 ? tens * 10 : tens * 10 + (CN_NUM[s[2]] || 0);
  }
  return 0;
}
export function cnMonth(s) {
  if (s === "正" || s === "元") return 1;
  if (s === "冬") return 11;
  if (s === "腊") return 12;
  return cnNum(s);
}

export const MDAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function validMD(m, d) {
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= MDAYS[m - 1];
}

/**
 * 日历空格：一年里真实存在、且日层没有任何条目的日子（返回 "m-d" 列表）。
 * 这里算一次，生成器与门都调它——各自写一遍 `d <= 31` 的循环就会把 4/31、6/31、9/31、11/31
 * 当成「空着的一天」数进去（实测虚报 14 天，实况 10 天）。页脚要印的就是这个长度，
 * 虚报等于对读者撒谎说这一页比实际更空。
 * @param {Array<{m:number,d:number}>} recs
 * @returns {string[]}
 */
export function blankCells(recs) {
  const hit = new Set();
  for (const r of recs || []) if (validMD(r.m, r.d)) hit.add(r.m + "-" + r.d);
  const out = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= MDAYS[m - 1]; d++) if (!hit.has(m + "-" + d)) out.push(m + "-" + d);
  return out;
}

function one(md) { const p = md.split("-"); return { m: Number(p[0]), d: Number(p[1]) }; }

/* 一段文本里「年份等于本条」的阿拉伯日期，去重 */
function arSet(text, year) {
  const out = new Set();
  if (!text) return out;
  for (const m of String(text).matchAll(AR_RE)) {
    if (Number(m[1]) !== year) continue;
    const mo = Number(m[2]), d = Number(m[3]);
    if (validMD(mo, d)) out.add(mo + "-" + d);
  }
  return out;
}

/* 中文月日：农历语境（前面出现「农历/旧历/阴历/夏历/闰」）直接跳过，不假装会换算 */
const LUNAR_HINT = /农历|旧历|阴历|夏历|闰/;
function cnSet(text, year) {
  const out = new Set();
  if (!text) return out;
  for (const m of String(text).matchAll(CN_RE)) {
    const before = String(text).slice(Math.max(0, m.index - 4), m.index);
    if (LUNAR_HINT.test(before)) continue;
    if (m[1] != null && Number(m[1]) !== year) continue;
    const mo = cnMonth(m[2]), d = cnNum(m[3]);
    if (!mo || !d) continue;
    if (validMD(mo, d)) out.add(mo + "-" + d);
  }
  return out;
}

/**
 * 对一条语料条目求它的「日」。
 * @returns {{id:string,how:string,m:number,d:number}|{ambiguous:Array}|null}
 */
export function deriveOne(e) {
  if (!e || !e.id || typeof e.year !== "number") return null;
  const d = e.detail || {};
  const tiers = [
    ["text", [e.title, e.summary].filter(Boolean).join(" ")],
    ["process", d.process || ""],
    ["src", (d.sources || []).join(" ")],
  ];
  for (const [how, text] of tiers) {
    const s = arSet(text, e.year);
    if (s.size > 1) return { ambiguous: [...s].map(one) };
    if (s.size === 1) return { id: e.id, how, ...one([...s][0]) };
  }
  if (e.year >= 1912) {
    const cnText = [e.title, e.summary, d.process || ""].filter(Boolean).join(" ");
    const s = cnSet(cnText, e.year);
    if (s.size > 1) return { ambiguous: [...s].map(one) };
    if (s.size === 1) return { id: e.id, how: "text-cn", ...one([...s][0]) };
  }
  return null;
}

/** 全库派生：{recs, ambiguous} */
export function deriveAll(corpus) {
  const recs = [], ambiguous = [];
  for (const e of corpus) {
    const r = deriveOne(e);
    if (!r) continue;
    if (r.ambiguous) { ambiguous.push({ id: e.id, year: e.year, cands: r.ambiguous }); continue; }
    recs.push(r);
  }
  recs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  ambiguous.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { recs, ambiguous };
}

/** 1583 年以前的「公历日」都是后世历表推出来的，界面必须说这一句 */
export const PROLEPTIC_BEFORE = 1583;
export function isProleptic(year) { return year < PROLEPTIC_BEFORE; }

export const DATE_RULE = "same-year|text>process>src|cn1912|v1";
