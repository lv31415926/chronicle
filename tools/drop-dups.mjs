/* drop-dups.mjs | 同一史事在重叠分片里被写了两遍时，删掉较弱的一条，并把 related 指向留下的那条
 * 用法: node tools/drop-dups.mjs --plan      只出裁定表并写 data/dup-plan.json
 *       node tools/drop-dups.mjs --write     按计划删除（原子写 + sha 守卫）
 *
 * 为什么要人工裁定表而不是自动删：撞车 id 里混着两种情况——
 *   (a) 同一史事写了两遍（cn-02 的战国尾巴与 cn-10/cn-11 整段重叠）→ 必须去重，否则时间轴上同年出现两张同义卡；
 *   (b) 同年同维的两件不同的事（如前256年的「李冰穿二江」与「楚筑淮北之方城」）→ 只是编号撞车，
 *       该由 normalize-ids 换号，绝不能删。
 * 所以判据不能只看 id 相同。本工具把 (b) 列入 OVERRIDE_DIFFERENT，其余按质量定去留。
 *
 * 去留判据（按序）：
 *   1. OVERRIDE_KEEP：主控按文体声口直接指定（世界线 1963–1991 一片：wd-11 摘要以阿拉伯年份开头，
 *      与「悬停某年看当年大事」的版面重复，且全书其他分片不用这种写法 → 留 wd-10）。
 *   2. detail.sources 多者留。
 *   3. 正文（background+process+impact）字数多者留。
 *   4. 仍平手：留「拥有该年份段」的分片（见 BAND_OWNER）。
 *
 * 落盘前的硬闸（防误删独有事件）：
 *   drop 与 keep 必须各自全局唯一存在、同年同维、且标题 2-gram 相似度 ≥0.34；
 *   不满足即整批拒绝。条数守恒按「原条数 = 新条数 + 删除数」逐片核对。 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = process.argv.includes("--plan");
const WRITE = process.argv.includes("--write");
const DIM = { politics: "p", figure: "f", science: "s", culture: "c", art: "a", military: "m", economy: "e", institution: "i", explore: "x", disaster: "d" };
const HEAD_RE = /^\s*\{\s*"?id"?\s*:/;
const ID_SHAPE = /^(cn|world)--(b?)(\d+)--([a-z])\d{2,}$/;
const fail = (m) => { console.error("ABORT: " + m); process.exit(1); };
if (!PLAN && !WRITE) fail("必须指定 --plan 或 --write");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

/* 同年同维但确实是两件不同的事：只换号，不删除。键 = 撞车 id。 */
const OVERRIDE_DIFFERENT = {
  "cn--b338--p01": "前338：惠文王车裂商君 ≠ 孝公卒惠文君立，两件",
  "cn--b311--p01": "前311：燕昭王筑台招贤 ≠ 秦武王立逐张仪，两件",
  "cn--b256--s01": "前256：李冰穿二江 ≠ 楚筑淮北方城，两件",
  "cn--b249--p01": "前249：吕不韦为相邦 ≠ 吕不韦灭东周，两件",
  "cn--b241--p01": "前241：五国攻秦至蕞 ≠ 楚徙都寿春，两件",
  "world--1871--p01": "1871：德意志帝国成立 ≠ 《法兰克福和约》，两件",
  "world--1905--p01": "1905：挪威脱离瑞挪联盟 ≠ 彼得堡流血星期日，两件",
};
/* 成对规则（优先于质量判据）：wd-10 与 wd-11 在 1963–1991 整段重叠，是我重复雇佣造成的——
 * 先存在的分片胜出。且 wd-11 的摘要多以「1974年4月25日…」起头，在「按年浏览」的版面里
 * 年份冗余，与其余分片的声口不一致。 */
const PAIR_RULE = [
  { keys: ["wd-10", "wd-11"], keep: "wd-10", why: "1963–1991 重叠段留先存在分片（重复雇佣）；wd-11 摘要以阿拉伯年份起头，与按年版面冗余" },
];
function pairDecide(list) {
  for (const r of PAIR_RULE) {
    if (list.length !== 2) continue;
    const ks = list.map((m) => m.f.key).sort();
    if (ks.join("|") !== [...r.keys].sort().join("|")) continue;
    const keep = list.find((m) => m.f.key === r.keep) || fail(`PAIR_RULE 指定的 ${r.keep} 不在 ${list.map((m) => m.f.key)} 里`);
    return { keep, drop: keep === list[0] ? list[1] : list[0], why: r.why };
  }
  return null;
}
/* 标题差异大但确系同一史事（键 = 撞车 id），值为裁定理由。 */
const OVERRIDE_SAME = {
  "cn--b475--p01": "同指「周元王元年＝战国断代之始」，一条叙事一条史家断代，仍是一事",
  "cn--b314--m01": "前314 燕内乱、齐入其都杀王哙，一事（cn-02 记结果，cn-11 记主语）",
  "cn--b286--p01": "前286 齐灭宋、宋王偃死，一事",
  "cn--b260--m01": "前260 长平之战（赵括军败、四十余万被坑），一事",
  "cn--b256--p01": "前256 秦取王畿、九鼎入秦、周亡，一事",
  "cn--b225--m01": "前225 王贲引河沟灌大梁、魏王假降，一事",
  "cn--b223--m01": "前223 王翦破项燕、虏楚王负刍而楚亡，一事",
};
/* 年份段归属（平手时用） */
const BAND_OWNER = [["cn-01", -3000, -842], ["cn-02", -841, -477], ["cn-10", -476, -380], ["cn-11", -349, -222], ["wd-10", 1946, 1962], ["wd-11", 1963, 1991]];

/* ---------- 同题异维重复（validate.mjs 的 EVENT_DUP_DIM）----------
 * 上面两个组源都看不见这一类：id 里带维度字母，所以同一史事写成 economy 与 institution
 * 两条时 id 必不相同（byId 不撞）；sig 键含维度（sig 不撞）。
 * 于是这七组长期只有 §3「一条事件只归一个 dim」在约束、无人执行。
 *
 * 去留是史实判断（哪一面最主要），不是质量度量能定的，故逐条人工写死在下面。
 * 工具只执行本表并核验前提，绝不自行决定去留。
 * 「同级参照」一律给可在语料里 grep 到的 id 与其当前值——§4A②③ 要求的口径。 */
const XDIM_SAME = [
  { keep: "cn--b408--e01", drop: "cn--b408--i01",
    why: "初租禾＝履亩而税，§3 economy 明列「赋税」；institution 的土地制度指井田/均田式田制，秦此令是税额而非田制。cn-10 版 sources 3 条 > cn-02 版 2 条，且前408 落在 cn-10 年份段（BAND_OWNER）" },
  { keep: "world--1968--p03", drop: "world--1968--i01",
    why: "NPT 开放签署：§3 politics 明列「条约」，institution 无从属对象（条约不是某一政体的建制）。PAIR_RULE：1963–1991 重叠段留先存在的 wd-10" },
  { keep: "world--1968--f01", drop: "world--1968--p06",
    why: "金案留 wd-10 的 figure 版：其一，出处正确性——wd-11 版 sources 引《沃伦委员会报告》（1964，查的是肯尼迪案）作金案依据，wd-10 版引众议院暗杀案特别委员会1979年金案报告；其二，同级参照 world--1995--p02 拉宾遇刺 w3、world--2022--p01 安倍遇刺 w3、world--1865--p01 林肯遇刺 w3——非国家元首遇刺在本库为 3，被删那条的 4 无先例（在任元首遇刺才及 4：world--1963--p02 肯尼迪遇刺 w4）" },
  { keep: "world--1974--m01", drop: "world--1974--p04",
    why: "塞浦路斯：造成南北分治的是土耳其两次出兵，§3 military（征服/战役）为其最主要面，政变是其前提节点；两版均 w3，无权重损失。PAIR_RULE 留 wd-10" },
  { keep: "world--1981--p01", drop: "world--1981--f02",
    why: "总统就职是 §3 politics「政权更迭」，不是 figure 的生卒或关键抉择节点；同级参照 world--1952--p01 煤钢共同体高级机构就职 w3。被删那条的 4 与同片减税法案叙事重复计分。PAIR_RULE 留 wd-10" },
  { keep: "world--1988--d02", drop: "world--1988--p05",
    why: "洛克比最主要面是二百七十人遇难的空难本身（disaster 收「灾…及其社会后果」）。安理会第731/748号决议、1991年起诉与2001年特别法庭判决在留存这条的 process 与 impact 内已完整叙述，删 politics 副本不丢事实；同片 1988 的 politics 节点是 world--1988--p01 缅甸八八八八起义 w3，与本事无关，故不存在「改挂到政治节点」这条路。PAIR_RULE 留 wd-10" },
  { keep: "world--1991--p04", drop: "world--1991--i02",
    why: "三国独立获承认与入联合国是外交/政权事件（§3 politics），institution 应记三国本国建制而非他国承认行为；同级参照 world--1831--p03 比利时独立获承认 w3、world--1918--p05 波兰恢复独立 w3、world--1821--p02 墨西哥独立获承认 w3、world--1826--p01 巴西独立获承认 w3。PAIR_RULE 留 wd-10" },
];

const files = [];
for (const [sub, prefix] of [["cn", "cn"], ["wd", "world"]]) {
  for (const n of fs.readdirSync(path.join(ROOT, "data", sub)).filter((x) => x.endsWith(".js")).sort()) {
    const p = path.join(ROOT, "data", sub, n);
    const buf = fs.readFileSync(p);
    const key = path.basename(n, ".js");
    const w = { window: {} };
    try { new Function("window", buf.toString("utf8"))(w.window); } catch (e) { fail(`${key} 解析失败: ${e.message}`); }
    const arr = w.window.__CHRONICLE_CHUNK[key];
    const lines = buf.toString("utf8").split("\n");
    const rowIdx = [];
    lines.forEach((ln, i) => { if (HEAD_RE.test(ln)) rowIdx.push(i); });
    if (rowIdx.length !== arr.length) fail(`${key} 行 ${rowIdx.length} ≠ 条 ${arr.length}`);
    files.push({ rel: path.join("data", sub, n), key, prefix, arr, lines, rowIdx, h: sha(buf) });
  }
}
const byId = new Map();
for (const f of files) f.arr.forEach((e, i) => {
  if (!byId.has(e.id)) byId.set(e.id, []);
  byId.get(e.id).push({ f, e, i });
});
const dl = (e) => [...(e.detail?.background || ""), ...(e.detail?.process || ""), ...(e.detail?.impact || "")].length;
const src = (e) => (e.detail?.sources || []).length;
const bigrams = (s) => { const t = [...s].filter((c) => /[一-鿿]/.test(c)); const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t[i] + t[i + 1]); return g; };
const sim = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let x = 0; for (const g of A) if (B.has(g)) x++; return x / Math.min(A.size, B.size); };
const ownerScore = (f, year) => { for (const [k, a, b] of BAND_OWNER) if (f.key === k && year >= a && year <= b) return 1; return 0; };

/* 组 = 撞车 id 组 ∪ 同年同维同标题组 */
const groups = new Map();
const addGroup = (k, list) => { if (list.length > 1) groups.set(k, list); };
for (const [id, list] of byId) if (list.length > 1) addGroup("id:" + id, list);
const sig = new Map();
for (const f of files) f.arr.forEach((e, i) => {
  const k = `${f.prefix}|${e.year}|${DIM[e.dim]}|${e.title}`;
  if (!sig.has(k)) sig.set(k, []);
  sig.get(k).push({ f, e, i });
});
for (const [k, list] of sig) if (list.length > 1) {
  const idk = "id:" + list[0].e.id;
  const cur = groups.get(idk) || [];
  const merged = [...cur];
  for (const m of list) if (!merged.some((x) => x.f === m.f && x.e === m.e)) merged.push(m);
  addGroup(cur.length ? idk : "sig:" + k, merged);
}

/* 裁定 */
const decisions = [];
const unresolved = [];
const note = (reason, cid, list, extra) => {
  unresolved.push({ reason, id: cid, members: list.map(describe), ...(extra || {}) });
};
for (const [k, list] of groups) {
  const cid = k.startsWith("id:") ? k.slice(3) : list[0].e.id;
  if (OVERRIDE_DIFFERENT[cid]) { decisions.push({ kind: "keep-both", id: cid, why: OVERRIDE_DIFFERENT[cid], members: list.map(describe) }); continue; }
  if (list.length > 2) { note(`${list.length} 个持有者，规则未覆盖`, cid, list); continue; }
  const [a, b] = list;
  if (a.e.year !== b.e.year || a.e.dim !== b.e.dim) { note("年/维不同：其中一条 id 编码错了，应先查是谁的编号错", cid, list); continue; }
  let keep, drop, why;
  const pr = pairDecide(list);
  if (pr) {
    keep = pr.keep; drop = pr.drop; why = pr.why;
  } else {
    const cmp = src(b.e) - src(a.e) || dl(b.e) - dl(a.e) || ownerScore(a.f, a.e.year) - ownerScore(b.f, b.e.year);
    if (cmp === 0) { note("两条质量完全相同，规则定不出去留", cid, list); continue; }
    keep = cmp > 0 ? b : a;
    drop = keep === a ? b : a;
    const crit = src(b.e) - src(a.e) ? ["sources", src, "条"] : dl(b.e) - dl(a.e) ? ["正文", dl, "字"] : ["年份段归属", () => 0, ""];
    why = `${crit[0]} ${crit[1](keep.e)} vs ${crit[1](drop.e)}（${crit[2]}）`;
  }
  const s = sim(keep.e.title, drop.e.title);
  if (s < 0.34 && !OVERRIDE_SAME[cid]) { note(`标题相似度 ${(s * 100) | 0}%<34%，不确定是否同一史事`, cid, list, { cand: { keepIdx: keep.i, keepKey: keep.f.key, keepTitle: keep.e.title, dropIdx: drop.i, dropKey: drop.f.key, dropTitle: drop.e.title, why, sim: +s.toFixed(2) } }); continue; }
  if (s < 0.34) why += `；${OVERRIDE_SAME[cid]}`;
  decisions.push({ kind: "drop", id: cid, keepAt: at(keep), dropAt: at(drop), why, sim: +s.toFixed(2), keepTitle: keep.e.title, dropTitle: drop.e.title });
}
function at(m) { return { key: m.f.key, idx: m.i, id: m.e.id }; }
function describe(m) { return { key: m.f.key, idx: m.i, id: m.e.id, title: m.e.title, w: m.e.weight, src: src(m.e), dl: dl(m.e) }; }

/* ---------- 执行 XDIM_SAME，并把它的前提变成硬闸 ----------
 * 这张表是人工裁定，工具管「写的时候是不是真的」：
 *   ① 两个 id 在盘上各恰有一条（被删过的计划不会悄悄再删一遍）；
 *   ② 同年、同轨、dim 必须不同、归一化标题必须相同——即 validate.mjs EVENT_DUP_DIM 的判据本身；
 *   ③ why 里引用的每个语料 id 必须存在，且紧跟其权重、权重与盘上一致。
 * ③ 是 §4A② 的落地：本轮之前有两次按文档例证表推理得出与语料相反的结论，
 * 根因都是引用不可核。引用不可核的裁定表，三个月后就没人敢信。 */
const TKEY = (e) => (typeof e.title === "string" ? e.title : "").replace(/[^\p{Script=Han}0-9A-Za-z]/gu, "");
{
  const one = (id, tag, row) => (byId.get(id) || [])[0];
  const cnt = (id) => (byId.get(id) || []).length;
  let xdDone = 0;
  for (const r of XDIM_SAME) {
    const tag = `${r.drop}→${r.keep}`;
    const checkWhys = () => {
      for (const m of r.why.matchAll(/(?:cn|world)--b?\d+--[a-z]\d{2}/g)) {
        const cid = m[0];
        const cur = byId.get(cid);
        if (!cur || !cur.length) fail(`${tag}: why 引用的 ${cid} 语料里没有（§4A②：引用前先查语料）`);
        const wm = /w([1-5])/.exec(r.why.slice(m.index + cid.length, m.index + cid.length + 24));
        if (!wm) fail(`${tag}: why 里的 ${cid} 没紧跟权重，写成「${cid} 简述 wN」才可核`);
        if (cur[0].e.weight !== Number(wm[1])) fail(`${tag}: why 写 ${cid} w${wm[1]}，盘上实为 w${cur[0].e.weight}——裁定表已过期`);
      }
    };
    if (cnt(r.keep) !== 1) fail(`XDIM_SAME ${tag}：keep ${r.keep} 盘上有 ${cnt(r.keep)} 条（须恰好 1 条）`);
    const k = one(r.keep);
    if (!cnt(r.drop)) {            // 本行已执行过：留着它、核住它的账，但不再产出删除决策
      checkWhys(); xdDone++; continue;
    }
    if (cnt(r.drop) !== 1) fail(`XDIM_SAME ${tag}：drop ${r.drop} 盘上有 ${cnt(r.drop)} 条（须恰好 1 条）`);
    const d = one(r.drop);
    if (k.e.year !== d.e.year) fail(`${tag}: 年份不同（${d.e.year} vs ${k.e.year}），不属同题异维`);
    if (k.f.prefix !== d.f.prefix) fail(`${tag}: 不同轨，不属本类`);
    if (k.e.dim === d.e.dim) fail(`${tag}: 两条同 dim，应走上方传统组而非 XDIM_SAME`);
    if (TKEY(k.e) !== TKEY(d.e)) fail(`${tag}: 归一化标题不同（「${d.e.title}」/「${k.e.title}」），EVENT_DUP_DIM 抓不到这一对，本表不得删`);
    checkWhys();
    decisions.push({ kind: "drop", xdim: true, id: d.e.id, keepAt: at(k), dropAt: at(d),
      why: r.why, keepTitle: k.e.title, dropTitle: d.e.title });
  }
  if (xdDone) console.log(`XDIM_SAME：${xdDone}/${XDIM_SAME.length} 行已在盘上执行完毕，只核账不再产出决策`);
}

decisions.sort((x, y) => (x.kind === y.kind ? x.id.localeCompare(y.id) : x.kind === "drop" ? -1 : 1));
const drops = decisions.filter((d) => d.kind === "drop");
const keepBoth = decisions.filter((d) => d.kind === "keep-both");
console.log(`撞车/同名组 ${groups.size}：拟删 ${drops.length} 条 | 两件并存只换号 ${keepBoth.length} 组 | 待裁定 ${unresolved.length} 组`);
for (const d of decisions) {
  if (d.kind === "keep-both") { console.log(`\n[换号不删] ${d.id}  ${d.why}`); d.members.forEach((m) => console.log(`      ${m.key} w${m.w} dl=${m.dl} src=${m.src} ${m.title}`)); continue; }
  if (d.xdim) { console.log(`\n[删·异维] ${d.dropAt.key}#${d.dropAt.idx} ${d.id}「${d.dropTitle}」  ←  留 ${d.keepAt.key}#${d.keepAt.idx} ${d.keepAt.id}「${d.keepTitle}」（${d.why}）`); continue; }
  console.log(`\n[删] ${d.dropAt.key}#${d.dropAt.idx}「${d.dropTitle}」  ←  留 ${d.keepAt.key}#${d.keepAt.idx}「${d.keepTitle}」（${d.why}，标题相似度 ${(d.sim * 100) | 0}%）`);
}
if (unresolved.length) {
  console.log(`\n===== 待裁定 ${unresolved.length} 组（规则不敢自动决定）=====`);
  for (const u of unresolved) {
    console.log(`\n[待裁] ${u.id}  ${u.reason}`);
    u.members.forEach((m) => console.log(`      ${m.key} w${m.w} dl=${m.dl} src=${m.src} ${m.id} ${m.title}`));
    if (u.cand) console.log(`      规则倾向：删 ${u.cand.dropKey}#${u.cand.dropIdx}「${u.cand.dropTitle}」留 ${u.cand.keepKey}#${u.cand.keepIdx}「${u.cand.keepTitle}」`);
  }
}
if (PLAN) {
  if (unresolved.length) { console.error(`\n✗ 还有 ${unresolved.length} 组未裁定，不写计划文件。逐组判定后补进 OVERRIDE_* / PAIR_RULE。`); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, "data/dup-plan.json"), JSON.stringify({ generatedBy: "tools/drop-dups.mjs", keepBoth: keepBoth.map((d) => d.id), drops: drops.map((d) => ({ drop: d.dropAt, keep: d.keepAt, why: d.why, xdim: !!d.xdim })) }, null, 1));
  console.log(`\n已写 data/dup-plan.json（${drops.length} 条删除计划）。核对无误后：node tools/drop-dups.mjs --write`);
  process.exit(0);
}
if (unresolved.length) fail(`还有 ${unresolved.length} 组未裁定，拒绝落盘`);

/* --write：按计划删除（计划文件为准，保证「先审后改」） */
const planPath = path.join(ROOT, "data/dup-plan.json");
fs.existsSync(planPath) || fail("没有 data/dup-plan.json，先跑 --plan");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const killAt = new Map();          // fileKey -> Set(in-shard idx)
const relMap = new Map();          // 被删条目的 id 串 -> 留存条目的 id 串（仅两侧串不同的那些）
const inherit = new Map();         // 留存条目 id -> 被删条目原本挂着的 related 目标
for (const d of plan.drops) {
  const f = files.find((x) => x.key === d.drop.key) || fail(`计划要删 ${d.drop.key}，盘上没这个分片`);
  const k = files.find((x) => x.key === d.keep.key) || fail(`计划要留 ${d.keep.key}，盘上没这个分片`);
  const e = f.arr[d.drop.idx], ke = k.arr[d.keep.idx];
  if (!e || e.id !== d.drop.id) fail(`计划要删 ${d.drop.key}#${d.drop.idx}，该位置现在是 ${e ? e.id : "（越界）"}——计划过期，重跑 --plan`);
  if (!ke || ke.id !== d.keep.id) fail(`计划要留 ${d.keep.key}#${d.keep.idx}，该位置现在是 ${ke ? ke.id : "（越界）"}——计划过期`);
  if (ke.year !== e.year) fail(`${d.drop.id} 与留存方 ${ke.id} 年份不同，计划过期`);
  if (f.prefix !== k.prefix) fail(`${d.drop.id} 与留存方 ${ke.id} 不同轨，计划过期`);
  if (!!d.xdim === (ke.dim === e.dim)) fail(`${d.drop.id} 与留存方 ${ke.id} ${ke.dim === e.dim ? "同" : "异"}维，与计划标注的「${d.xdim ? "异维" : "同维"}」类不符——重跑 --plan`);
  if (!killAt.has(f.key)) killAt.set(f.key, new Set());
  killAt.get(f.key).add(d.drop.idx);
  if (d.drop.id !== d.keep.id) relMap.set(d.drop.id, d.keep.id);
  /* 关联边属于史事，不属于那一条冗余记录：被删条目的 related 转给留存条目 */
  for (const r of e.related || []) {
    if (r === d.keep.id) continue;
    if (!inherit.has(d.keep.id)) inherit.set(d.keep.id, new Set());
    inherit.get(d.keep.id).add(r);
  }
}
/* relMap 到此处才完整：继承来的边若指向另一条被删项，跟着改指它的留存方 */
for (const [keepId, set] of [...inherit]) {
  const fixed = new Set();
  for (const r of set) { const t = relMap.get(r) || r; if (t !== keepId) fixed.add(t); }
  inherit.set(keepId, fixed);
}
let removed = 0, relRewritten = 0, relInherited = 0;
const REL_SEG = /("?)related("?)(\s*:\s*)(\[[^\]]*\])/g;
for (const f of files) {
  const killIdx = killAt.get(f.key) || new Set();
  const dropLines = new Set();
  const newLines = f.lines.slice();
  f.rowIdx.forEach((li, ri) => {
    const ev = f.arr[ri];
    if (killIdx.has(ri)) { dropLines.add(li); removed++; return; }
    newLines[li] = f.lines[li].replace(REL_SEG, (m0, q1, q2, sep, arrLit) => {
      const items = arrLit.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      const out = [];
      for (const it of items) {
        const quote = it[0];
        const r = it.replace(/^["']|["']$/g, "");
        let v = r;
        if (relMap.has(r)) { v = relMap.get(r); relRewritten++; }
        if (v === ev.id) continue;                       // 去重后指向自身
        const lit = quote + v + quote;
        if (out.includes(lit)) continue;                 // 两条重复指到同一目标
        out.push(lit);
      }
      const add = inherit.get(ev.id);
      if (add) for (const r of add) {
        const lit = `"${r}"`;
        if (out.includes(lit)) continue;
        /* 4 = validate.mjs 的 RELATED_MANY 上限；此处只做守护，不做策略——
         * 超限说明继承来的一堆边里有该剔的，交给人判，不能悄悄丢掉一条关联 */
        if (out.length >= 4) fail(`${ev.id} 继承 related 后会超过 4 条（validate 的 RELATED_MANY）：待接 ${r}；请人工定去留后重跑`);
        out.push(lit);
        relInherited++;
      }
      const rebuilt = `${q1}related${q2}${sep}[${out.join(", ")}]`;
      return rebuilt === m0 ? m0 : rebuilt;
    });
  });
  const text = newLines.filter((_, i) => !dropLines.has(i)).join("\n");
  if (text === f.lines.join("\n")) continue;
  const p = path.join(ROOT, f.rel);
  if (sha(fs.readFileSync(p)) !== f.h) { console.error(`!! ${f.rel} 运行期间被改写，跳过（请重跑）`); continue; }
  /* 复验：条数 = 原条数 − 删除数；除 related 外正文一字未动；不留指向已删条目的 related */
  const w = { window: {} };
  try { new Function("window", text)(w.window); } catch (e) { fail(`${f.rel} 改后无法解析: ${e.message}`); }
  const after = w.window.__CHRONICLE_CHUNK[f.key];
  const expect = f.arr.filter((_, i) => !killIdx.has(i));
  if (after.length !== expect.length) fail(`${f.rel} 条数 ${after.length} ≠ 期望 ${expect.length}`);
  after.forEach((e, i) => {
    const o = expect[i];
    const pa = { ...e }; delete pa.related;
    const pb = { ...o }; delete pb.related;
    if (JSON.stringify(pa) !== JSON.stringify(pb)) fail(`${f.rel}#${i} (${e.title}) 除 related 外正文被改动`);
    for (const r of e.related || []) if (relMap.has(r)) fail(`${f.rel}#${i} related 仍指向已删条目 ${r}`);
  });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}
console.log(`已删 ${removed}/${plan.drops.length} 条重复事件，related 改指 ${relRewritten} 处、随删条搬家转入 ${relInherited} 处`);
if (removed !== plan.drops.length) console.error(`!! 删除数与计划不符（${removed} vs ${plan.drops.length}），请检查计划是否过期`);
