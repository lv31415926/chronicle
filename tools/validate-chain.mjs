/* validate-chain.mjs | 涟漪层门：因果可以猜，但猜要想让人看出是猜
 * 用法: node tools/validate-chain.mjs [--json] [--root <目录>]
 *
 * 这一层是全站风险最高的一层。事实层说「哪一年发生了什么」，故事层说「当时那人手上是什么情形」，
 * 而涟漪层说的是「因为 A，所以后来有了 B」——它是在替历史编因果。
 * 读者分不清「史书这样写了」和「本站这样连的」，而后者一旦被当成前者，
 * 造假就不是写错一条，而是写出了一条从来没人主张过的关系。
 *
 * 所以本层的四条硬律（写在 data/chain/ancient.js 文件头，这里是它的机器版本）：
 *   ① 每一环的 ev 必须真在 data/cn·data/wd 里；年份与权重一律由锚点派生，本层不许各存一份
 *   ② 环序按年份严格递增，且不许把一串紧挨着的事当作涟漪（平均每环至少隔三年）
 *   ③ 每一边的连接必须写明「有出处」还是「本站的连接」；说「有出处」时，
 *      所引材料必须逐字出自这一边两端条目自己列出的 sources——不许凭空造一条书名
 *   ④ 落点（末环）必须是当时看来很小的事（weight ≤ 2）：涟漪的定义是「大事的余波落在小事上」，
 *      如果末环本身就是大事，那不是涟漪，是把因果链写成了另一条大事年表
 *
 * 「有出处」这一条为什么这样判：本层引的不是原文，而是「这条连接所凭的材料名」。
 * 它与故事层的 verbatim 判据不同——那边要求定位到篇目卷页，因为逐字引文错一个字就是造假；
 * 这里只要求「这本书确实是这一环依据的材料」，书名级也够读者去查，界面会照溯源四级
 * 如实标出它到了哪一级（仅书名就显示仅书名）。真去核对书里有没有这句话，仍然是人的事。
 *
 * 检查码：
 *   CHAIN_FILE         data/chain 目录或 manifest 不存在／求值塌了（整层缺失）
 *   CHAIN_MANIFEST     manifest 与磁盘分片不一一对应（漏登记的分片界面永远加载不到；登记了没有的会 404）
 *   CHAIN_SCHEMA       字段缺失、类型不对、多存了 year/era/date/weight、id 形态不合、末环私带 basis/prov
 *   CHAIN_DUP          同一链 id 出现两次；同一条链里同一个 ev 出现两次（同一事件连两次等于环序是编的）
 *   CHAIN_ANCHOR       环的 ev 在语料里不存在
 *   CHAIN_ANCHOR_PROV  环的锚点条目自己没有任何出处（这一环悬空，整条链的地基少一块）
 *   CHAIN_ORDER        环序不是严格递增（含同年并列：同年谁先谁后本层无从判断，就不许排）
 *   CHAIN_LINKS        环数不在 3–6；末环带了 claim；非末环缺 claim（说了半句「于是」没有下文）
 *   CHAIN_SPAN         首末年份差 < 3×(环数-1)：一串紧挨着的事不是涟漪
 *   CHAIN_SMALL        末环 weight > 2（落点不是小事，本层就退化成大事年表）
 *   CHAIN_BASIS        basis 不在「有出处／本站的连接」之内；有出处却无 prov；本站的连接却给了 prov
 *   CHAIN_PROV         「有出处」的某条材料在这一边两端条目的 sources 里找不到（凭空造书名）
 *   CHAIN_GROUNDED     整条链一个「有出处」的边都没有（全靠本站推断，那就不该进这一层）
 *   CHAIN_CAVEAT       caveat 缺失、过短，或不含存疑词／没有一句在说这条连接本身
 *   CHAIN_CROSS        跨轨链的条数低于下限，或某一片首环全挤在同一世纪（链条没有铺开）
 *   CHAIN_STANCE       评价词出现在 title／claim 且不在引号对内（立场只许写在视角层）
 *   CHAIN_COVERAGE     链总数、分片数、单片链数低于下限；同一个 ev 被过多条链复用
 *
 * 已知盲区，写在门里而不是藏在心里：
 *   ① 本门验的是「材料名对不对得上」，不验「材料里有没有这句话」。把《史记·大宛列传》
 *      当作「大宛之战导致天山出击」的凭据，形态上能过，真去翻的人才有结论。
 *      所以界面上「有出处」永远写成「本站据以连接的材料」，不写成「史料记载」。
 *   ② 因果的强弱、有没有第三变量，本门一概不知。它只保证：不许把话说成不是自己说的话。
 *   ③ SPAN／SMALL／CROSS 三条阈值都是 2026-11-06 实测的下位整数，是回归线不是目标线：
 *      补充链条时该抬的是内容，不是先把线抬高。
 *   ④ 「落点是小事」按 weight 判，而 weight 是本站对重要性的打分——用它定义涟漪
 *      等于承认本层的口径是本站的口径。这一点不打算遮掩，界面图例里同样这样写。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { loadCorpus, useRoot } from "./geo-lib.mjs";
import { PRAISE, stripQuoted } from "./voice-lib.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootArg = process.argv.indexOf("--root");
const ROOT = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : DEFAULT_ROOT;
if (rootArg > 0) useRoot(ROOT);

const errs = [];
const bad = (c, m) => errs.push(`${c} ${m}`);

function evalFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const sb = { window: {} }; sb.window = sb;
  vm.createContext(sb);
  /* 每个分片都要在全新沙箱里独立求值：浏览器按顺序注入，前一片建好的
   * window.__CHRONICLE_CHAIN_CHUNK 会把后一片缺守卫的毛病盖住。
   * 求值抛异常本身是结论，不许让它把整道门一起拖死。 */
  try {
    vm.runInContext(fs.readFileSync(abs, "utf8"), sb, { filename: rel });
  } catch (e) {
    bad("CHAIN_SCHEMA", `${rel} 单独求值失败：${e.message}（分片必须自带 window.__CHRONICLE_CHAIN_CHUNK = ... || {} 守卫，且不许有语法错误）`);
    return null;
  }
  return sb;
}

const GROUNDED = "有出处";
const INFERRED = "本站的连接";
const BASES = [GROUNDED, INFERRED];
/* 年份与权重全部由锚点派生。存一份就有第二份，两份打架时没人知道该信哪个。 */
const FORBIDDEN = ["year", "era", "dynasty", "date", "weight", "span", "from", "to"];
const ID_RE = /^ch-[a-z][a-z0-9]*-\d{3}$/;
const MIN_LINKS = 3, MAX_LINKS = 6;
/* 平均每环至少隔三年：涟漪不是把紧挨着的事排成一行。 */
const MIN_YEARS_PER_STEP = 3;
/* 落点的「小」按事实层的权重口径：w≤2 实测全库 663 条（cn 417／world 246），推得动。 */
const MAX_EDGE_WEIGHT = 2;
const MIN_TOTAL = 10, MIN_CHUNKS = 2, MIN_PER_CHUNK = 3;
/* 跨轨链的下限故意比实测（6 条）低一条：留余量给「合并重复链」这类合法减项，
 * 但也必须有下限——全是同轨链，这一层就只是中国史内部的小事清单，配不上「影响后续世界」。 */
const MIN_CROSS_TRACK = 5;
const MIN_CENTURIES_PER_CHUNK = 2;
/* 同一个事件被太多条链当环，说明它在被反复挪用因果，而不是它真的到处都有余波。 */
const MAX_TIMES_USED = 4;
/* caveat 必须自己带存疑语气，否则它会退化成一句套话。 */
const HEDGE = /或|可能|未必|不见得|存疑|争议|相传|据称|一说|无法|难以|孤证|单证|缺乏|不足|不能确定|推定|推测|传说|不详|后人|附会/;
/* 而且这句存疑得落在「这条连接」上，不是落在事件本身。 */
const ABOUT_LINK = /因果|相连|联系|连到|连接|先后|顺序|牵合|作为一条链|这条链|这一串/;

/* ---------- 分片装载 ---------- */
const chainDir = path.join(ROOT, "data/chain");
if (!fs.existsSync(chainDir)) {
  bad("CHAIN_FILE", "data/chain 目录不存在，涟漪层整层缺失");
}
const diskFiles = fs.existsSync(chainDir)
  ? fs.readdirSync(chainDir).filter((f) => f.endsWith(".js") && f !== "manifest.js").sort()
  : [];

const sbMan = evalFile("data/chain/manifest.js");
const MAN = sbMan && sbMan.__CHRONICLE_CHAIN_MANIFEST;
if (!MAN || !Array.isArray(MAN.chunks)) {
  bad("CHAIN_FILE", "data/chain/manifest.js 缺失、求值失败或没有 chunks 数组");
} else {
  const declared = MAN.chunks.map((c) => c.file);
  for (const f of diskFiles) {
    if (!declared.includes(f)) bad("CHAIN_MANIFEST", `${f} 在磁盘上但没登记进 manifest（界面按 manifest 注入，这条分片永远加载不到）`);
  }
  for (const f of declared) {
    if (!diskFiles.includes(f)) bad("CHAIN_MANIFEST", `manifest 登记了 ${f} 但磁盘上没有（注入会 404，涟漪层出现空洞）`);
  }
}

const chains = [];
const byFile = new Map();
for (const f of diskFiles) {
  const sb = evalFile(path.join("data/chain", f).replace(/\\/g, "/"));
  const C = sb && sb.__CHRONICLE_CHAIN_CHUNK;
  if (!C) { bad("CHAIN_SCHEMA", `${f} 求值后没有 window.__CHRONICLE_CHAIN_CHUNK`); continue; }
  const keys = Object.keys(C);
  if (keys.length !== 1) { bad("CHAIN_SCHEMA", `${f} 应只写一个分片键，实得 ${keys.length} 个：${keys.join(",")}`); continue; }
  const key = keys[0];
  if (!Array.isArray(C[key])) { bad("CHAIN_SCHEMA", `${f} 的键 ${key} 不是数组`); continue; }
  byFile.set(f, { key, n: C[key].length });
  for (const ch of C[key]) chains.push({ ch, f, key });
}

/* ---------- 语料（锚点唯一出处） ---------- */
const corpus = loadCorpus();
const byId = new Map(corpus.map((e) => [e.id, e]));
/* 条目自己的 sources：本层允许引用的材料名的天花板，只从盘上现取。 */
function anchorSources(id) {
  const e = byId.get(id);
  const s = e && e.detail && e.detail.sources;
  return Array.isArray(s) ? s.map(String) : [];
}
function century(y) { return Math.floor((y - 1) / 100) + 1; }

const seenId = new Set();
const useCount = new Map();
const crossTrack = [];
/* 汇总段也要读 links：坏形态（links 写成对象）在逐链段已经跳过，
 * 但汇总段在循环之外，不挡就会在这里抛 TypeError，把整道门的结论一起带走。 */
const LS = (x) => (x && Array.isArray(x.links) ? x.links : []);

for (const { ch, f, key } of chains) {
  const at = `${f} ${ch && ch.id ? ch.id : "(无 id)"}`;
  if (!ch || typeof ch !== "object" || Array.isArray(ch)) { bad("CHAIN_SCHEMA", `${at} 不是对象`); continue; }

  for (const k of FORBIDDEN) {
    if (k in ch) bad("CHAIN_SCHEMA", `${at} 顶层存了 ${k}：年代与权重由锚点派生，涟漪层不许各存一份`);
  }
  if (typeof ch.id !== "string" || !ID_RE.test(ch.id)) bad("CHAIN_SCHEMA", `${at} id 形态应为 ch-<分片>-<三位数字>`);
  else if (ch.id.indexOf("ch-" + key + "-") !== 0) bad("CHAIN_SCHEMA", `${at} id 前缀与分片键 ${key} 不符（界面上的深链与清单会对不上）`);
  if (seenId.has(ch.id)) bad("CHAIN_DUP", `${at} 链 id 重复`);
  seenId.add(ch.id);
  if (typeof ch.title !== "string" || !ch.title.trim()) bad("CHAIN_SCHEMA", `${at} title 必须是非空字符串`);
  else if (ch.title.length > 40) bad("CHAIN_SCHEMA", `${at} title ${ch.title.length} 字，超 40（抽屉一行放不下）`);
  else {
    const hit = stripQuoted(ch.title).match(PRAISE);
    if (hit) bad("CHAIN_STANCE", `${at} title 出现评价词「${hit[0]}」且不在引号对内——涟漪不评价，要夸请写进视角层`);
  }

  if (!Array.isArray(ch.links) || !ch.links.length) { bad("CHAIN_SCHEMA", `${at} links 必须是非空数组`); continue; }
  if (ch.links.length < MIN_LINKS || ch.links.length > MAX_LINKS)
    bad("CHAIN_LINKS", `${at} 环数 ${ch.links.length}，不在 ${MIN_LINKS}–${MAX_LINKS}（两环不成链，七环以上读者记不住，且多半是在硬凑）`);

  /* 逐环解析出锚点条目：本层所有度量都从这里现取。 */
  const steps = [];
  ch.links.forEach((L, i) => {
    const pos = `${at} 第${i + 1}环`;
    const last = i === ch.links.length - 1;
    if (!L || typeof L !== "object") { bad("CHAIN_SCHEMA", `${pos} 不是对象`); return; }
    for (const k of FORBIDDEN) {
      if (k in L) bad("CHAIN_SCHEMA", `${pos} 存了 ${k}：由 ev 锚点派生，抄一份就有第二份口径`);
    }
    if (typeof L.ev !== "string" || !L.ev.trim()) { bad("CHAIN_SCHEMA", `${pos} 缺 ev`); return; }
    const a = byId.get(L.ev);
    if (!a) { bad("CHAIN_ANCHOR", `${pos} 的 ev=「${L.ev}」在 data/cn·data/wd 里不存在`); return; }
    if (!anchorSources(L.ev).length) bad("CHAIN_ANCHOR_PROV", `${pos} 的锚点 ${L.ev} 本身没有任何出处，这一环悬空`);
    useCount.set(L.ev, (useCount.get(L.ev) || 0) + 1);

    if (last) {
      if (typeof L.claim === "string" && L.claim.trim())
        bad("CHAIN_LINKS", `${pos} 是末环却带了 claim：末环是涟漪落到的那件小事，它后面本站没有再连任何东西`);
      if (L.basis != null || L.prov != null)
        bad("CHAIN_SCHEMA", `${pos} 是末环却带了 basis/prov：没有下一环就没有这条边，凭据也就无所附着`);
    } else {
      if (typeof L.claim !== "string" || !L.claim.trim()) bad("CHAIN_LINKS", `${pos} 缺 claim：这一环到下一环是怎么连的，必须说出来`);
      else {
        const hit = stripQuoted(L.claim).match(PRAISE);
        if (hit) bad("CHAIN_STANCE", `${pos} claim 出现评价词「${hit[0]}」且不在引号对内`);
      }
      if (!BASES.includes(L.basis))
        bad("CHAIN_BASIS", `${pos} basis=「${L.basis}」不在二选一（${BASES.join("／")}）：每边都必须声明这层因果是谁在说`);
      const hasProv = Array.isArray(L.prov) && L.prov.length;
      if (L.basis === GROUNDED && !hasProv)
        bad("CHAIN_BASIS", `${pos} 标了「${GROUNDED}」却没有 prov：说得出书名才配标有出处`);
      if (L.basis === INFERRED && hasProv)
        bad("CHAIN_BASIS", `${pos} 标了「${INFERRED}」却给了 prov：既然列得出材料，就不是本站的连接——要么改 basis，要么删掉材料名`);
      if (L.basis === GROUNDED && hasProv) {
        /* 允许引用的材料名，天花板是这一边两端条目自己列出的 sources。
         * 两端一起算：这条边说的是「从 A 到 B」，A 的依据书里说了或 B 的依据书里说了，
         * 都算这条边有凭；两处都没写过的名字，本站无权凭空造。 */
        const pool = anchorSources(L.ev).concat(nextEvSources(ch, i));
        L.prov.forEach((p, pi) => {
          const s = String(p == null ? "" : p).trim();
          if (!s) { bad("CHAIN_SCHEMA", `${pos} prov 第${pi + 1}项为空`); return; }
          if (!pool.some((x) => x.indexOf(s) >= 0))
            bad("CHAIN_PROV", `${pos} 所引「${s.slice(0, 40)}」不在两端条目（${L.ev}／${ch.links[i + 1] && ch.links[i + 1].ev}）自己的 sources 里——这条材料名是本站造的`);
        });
      }
    }
    steps.push({ ev: L.ev, year: a.year, weight: a.weight, track: a.track, title: a.title });
  });

  /* 有环没解析出来（锚点不存在等）时，链序类判据全部跳过：
   * 那些结论已经在上面报过一遍，再拿残缺的环序去判年代只会添乱。 */
  if (steps.length !== ch.links.length) continue;
  if (steps.length < 2) continue;

  /* 环序：严格递增。同年并列不判「谁先谁后」——本层无从判断，排了就是编的。 */
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].year <= steps[i - 1].year)
      bad("CHAIN_ORDER", `${at} 第${i + 1}环 ${steps[i].ev}（${steps[i].year}）不晚于第${i}环 ${steps[i - 1].ev}（${steps[i - 1].year}）：因果链按年份严格递增，同年先后本站不替读者猜`);
  }
  const span = steps[steps.length - 1].year - steps[0].year;
  const need = MIN_YEARS_PER_STEP * (steps.length - 1);
  if (span < need)
    bad("CHAIN_SPAN", `${at} 首末相差 ${span} 年，不足 ${steps.length} 环 × 每环 ${MIN_YEARS_PER_STEP} 年 = ${need} 年：紧挨着的事排成一行不是涟漪`);

  const tail = steps[steps.length - 1];
  if (tail.weight > MAX_EDGE_WEIGHT)
    bad("CHAIN_SMALL", `${at} 末环 ${tail.ev}（${tail.title || ""}）weight=${tail.weight} > ${MAX_EDGE_WEIGHT}：落点必须是当时看来很小的事，否则这条链只是另一份大事年表`);

  const grounded = ch.links.filter((L, i) => i < ch.links.length - 1 && L.basis === GROUNDED).length;
  if (!grounded) bad("CHAIN_GROUNDED", `${at} 没有一个「${GROUNDED}」的边：整条链的因果全是本站的连接，那就还不该进这一层`);

  const cv = typeof ch.caveat === "string" ? ch.caveat.trim() : "";
  if (!cv) bad("CHAIN_CAVEAT", `${at} 缺 caveat：因果链必须自带一句「这条链哪里站不住」`);
  else if (cv.length < 20) bad("CHAIN_CAVEAT", `${at} caveat 仅 ${cv.length} 字，太短（套话不算存疑）`);
  else if (!HEDGE.test(cv)) bad("CHAIN_CAVEAT", `${at} caveat 没有一个存疑词（或／未必／孤证／争议…），等于把这条链说成已证`);
  else if (!ABOUT_LINK.test(cv)) bad("CHAIN_CAVEAT", `${at} caveat 没有一句在说这条连接本身（因果／相连／顺序…）：只怀疑事件真伪，读者仍会把这条链当成史料的说法`);

  if (new Set(steps.map((s) => s.ev)).size !== steps.length)
    bad("CHAIN_DUP", `${at} 同一条链里同一个 ev 出现两次：同一事件连两次意味着环序不是按年代排的`);
  const tracks = new Set(steps.map((s) => s.track));
  if (tracks.size > 1) crossTrack.push(ch.id);
}

function nextEvSources(ch, i) {
  const nx = ch.links[i + 1];
  return nx && nx.ev ? anchorSources(nx.ev) : [];
}

/* ---------- 铺开度 ---------- */
if (crossTrack.length < MIN_CROSS_TRACK)
  bad("CHAIN_CROSS", `跨轨链 ${crossTrack.length} 条 < ${MIN_CROSS_TRACK}：一条都留在同一轨里，这一层讲的只是内部分支，不是「影响后续世界」`);
for (const [f, v] of byFile) {
  const firstYears = chains.filter((x) => x.f === f)
    .map((x) => LS(x.ch).map((L) => byId.get(L && L.ev)).filter(Boolean)[0])
    .filter(Boolean).map((a) => century(a.year));
  const cs = new Set(firstYears);
  if (firstYears.length && cs.size < MIN_CENTURIES_PER_CHUNK)
    bad("CHAIN_CROSS", `${f}（${v.key}）的 ${firstYears.length} 条链首环全挤在 ${[...cs].join(",")} 世纪：链条没有铺开，像是在同一批材料里挑出来的`);
}

/* ---------- 覆盖与复用 ---------- */
if (chains.length < MIN_TOTAL) bad("CHAIN_COVERAGE", `涟漪层总链数 ${chains.length} < ${MIN_TOTAL}`);
if (byFile.size < MIN_CHUNKS) bad("CHAIN_COVERAGE", `分片数 ${byFile.size} < ${MIN_CHUNKS}`);
for (const [f, v] of byFile) {
  if (v.n < MIN_PER_CHUNK) bad("CHAIN_COVERAGE", `${f}（${v.key}）仅 ${v.n} 条 < ${MIN_PER_CHUNK}`);
}
for (const [ev, n] of useCount) {
  if (n > MAX_TIMES_USED) bad("CHAIN_COVERAGE", `${ev} 被 ${n} 条链当作环（> ${MAX_TIMES_USED}）：一个事件的余波被反复挪用，多半是在凑链而不是在记涟漪`);
}

const out = {
  ok: errs.length === 0,
  errors: errs,
  stats: {
    chains: chains.length,
    links: chains.reduce((a, x) => a + LS(x.ch).length, 0),
    chunks: byFile.size,
    perChunk: [...byFile].map(([f, v]) => `${f}:${v.key}=${v.n}`).join(" "),
    crossTrack: crossTrack.length,
    groundedEdges: chains.reduce((a, x) => a + LS(x.ch).filter((L) => L && L.basis === GROUNDED).length, 0),
    distinctEvents: useCount.size
  }
};
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  for (const e of errs) console.log("FAIL " + e);
  console.log(
    `涟漪层：${out.stats.chains} 条链 / ${out.stats.links} 环 / ${out.stats.chunks} 片` +
    `（跨轨 ${out.stats.crossTrack} 条、有凭的边 ${out.stats.groundedEdges} 条、涉及事件 ${out.stats.distinctEvents} 个）` +
    (errs.length ? ` → ${errs.length} 处不合格` : " → 全部合格")
  );
}
process.exit(errs.length ? 1 : 0);
