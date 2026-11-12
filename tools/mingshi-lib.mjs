/* mingshi-lib.mjs | 明史编年层的单一真源：年号表、时锚、类别表、预算常量
 *
 * 为什么单独一个文件：抽取器（tools/mingshi-annals.mjs）与门（tools/validate-annals.mjs）
 * 必须用同一张表。两处各写一份时，门只会检查「自己那份表」，抽取器改了口径门还判绿——
 * 那是假门。这里只许有一份。
 *
 * 口径来源都写在各表旁边，改表就是改口径，改完必须重跑抽取＋全套门。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* 可变而非 const：门要在一份打了变异的副本上跑（tools/test-annals.mjs），
   装载路径必须能整体改道。抽取器永远用默认根。 */
let _root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export let CORPUS_DIR = path.join(_root, "data/corpus/mingshi");
export let ANNALS_DIR = path.join(_root, "data/annals");
export function useRoot(r) {
  _root = path.resolve(r);
  CORPUS_DIR = path.join(_root, "data/corpus/mingshi");
  ANNALS_DIR = path.join(_root, "data/annals");
}
export function root() { return _root; }

/* ── 预算（门与抽取器同值）────────────────────────────────── */
export const MAXQ = 170;                 // 单节点原文上限（字符）
export const MINQ = 5;                   // 低于此字数的句子不单独成节点，只可能尾随并入
export const SHARD_BYTES = 256 * 1024;   // 单分片字节上限
export const YEAR_MIN = 1260, YEAR_MAX = 1662;   // 可接受的系年区间（元统→南明末）

/* ── 年号 → 元年公元 ────────────────────────────────────────
 * 起手收元末与南明，因为本纪卷一自至正四年叙起、卷二十四末附福王监国事。
 * 「至元」在元初(世祖, 1264)与元末(顺帝, 1335)重号，《明史》写元末那一系常作
 * 「后至元」（地理志、五行志共见 6 处，如「元后至元四年十二月置邦牙宣慰司」）。
 * 所以表里同时收 后至元:1335 与 至元:1264，且 ERA_NAMES 按长度降序拼正则——
 * 「后至元」必须先于「至元」匹配，否则顺帝的事会被算成世祖年，早整整七十年。 */
export const ERAS = {
  至正: 1341, 后至元: 1335, 至元: 1264, 大德: 1297, 至大: 1308, 皇庆: 1312, 延祐: 1314,
  泰定: 1324, 天历: 1328, 至顺: 1330, 元统: 1333,
  洪武: 1368, 建文: 1399, 永乐: 1403, 洪熙: 1425, 宣德: 1426, 正统: 1436,
  景泰: 1450, 天顺: 1457, 成化: 1465, 弘治: 1488, 正德: 1506, 嘉靖: 1522,
  隆庆: 1567, 万历: 1573, 泰昌: 1620, 天启: 1621, 崇祯: 1628,
  弘光: 1645, 隆武: 1645, 永历: 1646,
};
export const ERA_NAMES = Object.keys(ERAS).sort((a, b) => b.length - a.length);
export const ERA_RE = new RegExp(`(${ERA_NAMES.join("|")})([元一二三四五六七八九十]{1,3})年`, "g");
/* 「明年改元洪武」「国号大明，建元洪武」里的年号年不作当前纪年 */
export const ERA_CTX_BAD = /改元|建元|国号|明年|将改|追尊/;

const CN1 = { 元: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function numeral(s) {
  let m = s.match(/^十([一二三四五六七八九])?$/);
  if (m) return 10 + (m[1] ? CN1[m[1]] : 0);
  m = s.match(/^([二三四五六七八九])十([一二三四五六七八九])?$/);
  if (m) return CN1[m[1]] * 10 + (m[2] ? CN1[m[2]] : 0);
  return s.length === 1 && CN1[s] ? CN1[s] : null;
}
/* 卷号中文数字 → 整数（1—332）。numeral() 只管年号里的两位数，这里要多一位百，
 * 且维基文库卷题惯用两种写法：省「十」（「一百四五」=145、「二百一八」=218）
 * 和用〇/零占住空位（「二百〇一」=201、「三百零五」=305）——
 * 门拿它把卷题里自称的卷号和清单登记的卷号对撞，对不上就是伪托。 */
export function juanNum(s) {
  s = String(s || "").trim().replace(/巻/g, "卷");
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let total = 0, rest = s;
  const bm = rest.match(/^([一二三四五六七八九])?百/);
  if (bm) { total += (bm[1] ? CN[bm[1]] : 1) * 100; rest = rest.slice(bm[0].length); }
  const tm = rest.match(/^([一二三四五六七八九])?十/);
  if (tm) {
    total += (tm[1] ? CN[tm[1]] : 1) * 10;
    rest = rest.slice(tm[0].length);
    return !rest ? total : CN[rest] && rest.length === 1 ? total + CN[rest] : null;
  }
  if (!rest) return total || null;
  /* 〇/零 占住十位：二百〇一 */
  const zm = rest.match(/^[〇零]([一二三四五六七八九])$/);
  if (zm) return total + CN[zm[1]];
  const ds = [...rest].map((c) => CN[c]);
  if (ds.some((d) => !d)) return null;
  if (ds.length === 1) return total + ds[0];
  /* 省「十」：一百四五 = 100 + 45。两位以上不是合法写法。 */
  return ds.length === 2 ? total + ds[0] * 10 + ds[1] : null;
}

/* 年号串（如「洪武十三」）→ 公元年；不合法返回 null。门用它复算节点的 y。 */
export function eraYear(e) {
  const m = String(e || "").match(new RegExp(`^(${ERA_NAMES.join("|")})([元一二三四五六七八九十]{1,3})$`));
  if (!m) return null;
  const n = numeral(m[2]);
  if (n == null) return null;
  return ERAS[m[1]] + n - 1;
}

/* ── 时锚 ─────────────────────────────────────────────────── */
export const GAN = "甲乙丙丁戊己庚辛壬癸", ZHI = "子丑寅卯辰巳午未申酉戌亥";
export const GZ = new Set();
for (const g of GAN) for (const z of ZHI) GZ.add(g + z);
export const MONTH_NUM = { 正: 1, 元: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
export const MONTH_RE = /(?:(春|夏|秋|冬))?(闰)?(正|元|十[一二]|[一二三四五六七八九十])月/;
export const YEAR_WORD_RE = /^[是其]年[,，]?/;     // 「是年，琉球入贡」一类以年计而不言月者
export function firstGz(seg) {
  for (let i = 0; i < seg.length - 1; i++) { const p = seg.slice(i, i + 2); if (GZ.has(p)) return p; }
  return "";
}

/* ── 句内自标纪年（抽取器与门共用同一份切法，防止「抽取这么算、门那么算」的假门）──
 * 取最后一个可用匹配：文言里「洪武三年伐，二十年复征」这类承前省略只有末句才是本句系年。
 * 「可用」= 年份数字解析得出、落在 YEAR_MIN—MAX 内、且不是「改元/建元/国号/明年」等语境词。 */
export function eraIn(seg) {
  let own = null, era = "";
  ERA_RE.lastIndex = 0;
  let m;
  while ((m = ERA_RE.exec(seg)) !== null) {
    const y = numeral(m[2]);
    if (y == null) continue;
    const cand = ERAS[m[1]] + y - 1;
    if (cand < YEAR_MIN || cand > YEAR_MAX) continue;
    if (ERA_CTX_BAD.test(seg.slice(Math.max(0, m.index - 6), m.index))) continue;
    own = cand; era = m[1] + m[2];
  }
  return { own, era };
}

/* ── 分句：引号内的「。」不断句 ──────────────────────────────
 * 记言常有「太祖曰：「……，……。……」」，按裸句号切会把一句话从引文中间劈开
 * （实测 132 个节点以闭引号开头或引号不平衡）。这里按 「」/“” 深度切，
 * 并在史臣评述「赞曰／论曰」前强制断句。引号若源页即失配（长段不闭合），
 * 退化为裸切并丢弃以闭引号开头的残片——宁可少收，不收半句。
 * 门（ANNALS_MERGE）用它认出节点 q 里哪些是「并进来的尾句」，所以它必须住在这里。 */
export function splitSegments(text) {
  const segs = [];
  let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "「" || c === "“") depth++;
    else if (c === "」" || c === "”") { if (depth > 0) depth--; }
    if (c === "。" && depth === 0) { segs.push([start, i + 1]); start = i + 1; continue; }
    if ((text.startsWith("赞曰", i) || text.startsWith("论曰", i)) && i > start) {
      segs.push([start, i]); start = i;
    }
  }
  if (start < text.length) segs.push([start, text.length]);
  const out = [];
  for (const [a, b] of segs) {
    if (b - a <= MAXQ * 3) { out.push([a, b]); continue; }
    let p = a;                                  // 退化路径：源页引号失配的长段
    for (let i = a; i < b; i++) {
      if (text[i] !== "。") continue;
      const frag = text.slice(p, i + 1).replace(/^[。，、\s]*/, "");
      if (!/^[」”]/.test(frag)) out.push([p, i + 1]);
      p = i + 1;
    }
    if (p < b) out.push([p, b]);
  }
  return out;
}

/* ── 类别（派生字段）：自上而下第一条命中即定，同表可复算 ──
 * 之所以敢用关键词派生：k 不进 q、不改原文，读者看到的分类错了，重跑工具就变回来。
 * 顺序即优先级——「帝崩于万岁山」是丧殁不是兵事，「大水溃堤」是灾异不是工役。 */
export const KINDS = [
  ["sang", /崩|殂|薨|大行|山陵|升遐|殉国|殉城|死之|弃市|伏诛/],
  ["zai", /地震|大水|水溢|河决|江溢|旱|蝗|饥|疫|大风|雹|霜|雪|海溢|火灾|灾/],
  ["si", /入贡|瓦剌|鞑靼|女直|亦立|火州|哈密|倭|土司|互市|虏|寇边|朝鲜|安南|琉球|占城|爪哇|真腊|撒马尔罕|番/],
  ["bing", /征|讨|伐|袭|克|陷|溃|反|叛|寇|阵|战|捷|总兵|帅师|出师|军|卫|所|关|城堡/],
  ["guan", /拜|除|迁|擢|召|授|罢|免|致仕|下狱|诛|夺|设|置|会试|殿试|举/],
  ["cai", /赋|税|漕|盐|钞|钱|田|仓|屯|役|币|课|折银|给俸|禄/],
  ["li", /祀|祭|郊|庙|陵|谥|葬|封|册|诏|制|敕|议|奏|请|上尊号|大宴|朝|学|书|史|修|撰|志|表/],
];
export const KIND_KEYS = KINDS.map(([k]) => k).concat(["za"]);
export const KIND_LABEL = { sang: "丧殁", zai: "灾异", si: "边藩朝贡", bing: "兵事", guan: "官制除授", cai: "财赋", li: "礼文", za: "杂记" };
export function kindOf(q) { for (const [k, re] of KINDS) if (re.test(q)) return k; return "za"; }

/* ── 部类 ─────────────────────────────────────────────────── */
export const SECTION_CODE = { 本纪: "ji", 志: "zhi", 表: "biao", 列传: "zhuan" };
export const SECTION_LABEL = { ji: "本纪", zhi: "志", biao: "表", zhuan: "列传" };
export const CODE_SECTION = Object.fromEntries(Object.entries(SECTION_CODE).map(([k, v]) => [v, k]));

/* 史臣评述：赞曰／论曰不是系日记事，抽取器在它们前面强制断句并整段丢弃 */
export const COMMENTARY = /^(赞曰|论曰)/;

export const ID_RE = /^ms-\d{3}-\d{4}-\d{3}$/;

/* ── 分片归属规则（抽取器、门、变异夹具三方共用同一份）──────
 * 本纪按 40 年一片、志传按 60 年一片：本纪节点密（实测 24 卷 5674 节点，2026-11-10 全量），
 * 切细一点才装得进 SHARD_BYTES。 */
export const BUCKET_SPAN = { ji: 40, zhi: 60, zhuan: 60, biao: 60 };
export function bucketOf(code, y) {
  const span = BUCKET_SPAN[code];
  return `${code}-${Math.floor(y / span) * span}`;
}
export const pad3 = (n) => String(n).padStart(3, "0");

/* ── 回归检测线（不是目标线）───────────────────────────────
 * 数值取 2026-11-09 实测（底本 218 卷／编年 7219 节点）向下取整到「明显缩水才红」的量级：
 * 332 卷抓齐后这些线只该往上抬。它的职责是抓「重建把一层洗没了」，
 * 不是催作者多收——收得全是 census 逐卷账和人工抽读的事。
 * 放在这里而不是藏在门里：变异夹具 tools/test-annals.mjs 按同一份数铺生产形态数据，
 * 两边各写一份的话，夹具永远站在红线以下，那种「变红」证明不了任何事。 */
export const COVERAGE_FLOOR = {
  corpusJuans: 300,   // 底本入册卷数（全量 332 卷，页内正文不足 500 字的薄卷不收：实测 330）
  annalJuans: 190,    // 真的产出过节点的卷数（比总数灵敏：转写一坏就成片归零）
  nodes: 7500,
  ji: 5600, zhi: 1500, zhuan: 300,   // 分部类节点数
  years: 310,         // 覆盖到的不同公元年数
  chunks: 20,
};
/* 体积上限：≤25MB 是这一期定下的硬约束（纪+志+表全量、列传只收硬锚）。
 * 新两层单列一条 12MB，是为了在 data/ 全站还没顶到天花板时就能指出「是这两层涨的」。 */
export const BUDGET = { layersBytes: 12 * 1024 * 1024, dataBytes: 25 * 1024 * 1024 };

/* ── 装载 ─────────────────────────────────────────────────── */
export function evalFile(absPath) {
  const win = {};
  new Function("window", fs.readFileSync(absPath, "utf8"))(win);
  return win;
}
export function loadCorpusManifest() {
  return evalFile(path.join(CORPUS_DIR, "manifest.js")).__CHRONICLE_CORPUS_MANIFEST || null;
}
export function loadCorpus(juan) {
  const p = path.join(CORPUS_DIR, `ms${juan}.js`);
  if (!fs.existsSync(p)) return null;
  return evalFile(p).__CHRONICLE_CORPUS[`ms${juan}`] ?? null;
}
export function loadAnnalsManifest() {
  const p = path.join(ANNALS_DIR, "manifest.js");
  return fs.existsSync(p) ? evalFile(p).__CHRONICLE_ANNALS_MANIFEST : null;
}
export function loadAnnalsShard(file, id) {
  return evalFile(path.join(ANNALS_DIR, file)).__CHRONICLE_ANNALS[id] ?? null;
}
/* 整片节点数组（门要逐节点复算，不是按 id 点查）。片里没有这个 id 时返回 null，
   空数组是合法值——不能用 || [] 把「装载不到」伪装成「一片皆空」。 */
export function loadAnnalsChunk(file, id) {
  const all = evalFile(path.join(ANNALS_DIR, file)).__CHRONICLE_ANNALS;
  return all && Array.isArray(all[id]) ? all[id] : null;
}
