/* validate.mjs | 编年史数据集校验门
 *
 * 用法:
 *   node tools/validate.mjs            人读报告 + 退出码
 *   node tools/validate.mjs --json     机读 JSON
 *   node tools/validate.mjs --strict   数据集完整（14 分片全非空）时把悬空 related 判为错误
 *
 * 判定分层:
 *   ERR  硬性错误 —— 必须为 0 才算通过（语法非法、schema 缺字段、id 冲突、超范围年代…）
 *   WARN 质量告警 —— 分布失衡、密度空洞、疑似重复，不阻塞但需人工过目
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MANGLED, QRUN } from "./corrupt-patterns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.includes("--json");
const STRICT = ARGS.includes("--strict");

const DIMS = ["politics", "figure", "science", "culture", "art", "military", "economy", "institution", "explore", "disaster"];
const DIM_INIT = { p: "politics", f: "figure", s: "science", c: "culture", a: "art", m: "military", e: "economy", i: "institution", x: "explore", d: "disaster" };
const TRACK_DIRS = { cn: "cn", wd: "world" };
const YEAR_MIN = -3000, YEAR_MAX = 2026;
const CN_CONTINUOUS = -841;   // 共和行政：中国确切编年起点
/* 分片数不作硬编码期望：分片会随体量拆分、随空缺新建，写死数字只会过期成
 * 「22/14 分片有数据」这种自相矛盾的报表。完整性的真实口径是「没有空分片」。 */
const MAX_CHUNK_BYTES = 320 * 1024;
const EV_KEYS = ["id", "track", "year", "yearApprox", "dim", "weight", "title", "summary", "detail", "related", "checks"];
const DETAIL_KEYS = ["background", "process", "impact", "figures", "place", "state", "sources", "tags"];
/* 溯源四级由 js/prov.js 从证据现算，数据里没有任何「等级」可写。
 * 下列字段名一旦出现就是有人在手写认证——一律 ERROR，见 TIER_FIELD。 */
const TIER_FIELDS = ["tier", "prov", "provenance", "verified", "certified", "confidence", "badge", "sourceTier"];
/* 与 js/prov.js 的 validCheck 同一个口径：本门放行而前端不计数，
 * 投稿人就会看到「我填了核对记录，标签却没变」。两处正则由 test-units 对账。 */
const CHECK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/* 长度上限的唯一出处是 tools/limits.mjs（validate / check / mcheck 共用同一份数值）。
 * 消息里再抄一遍数字是谎言的温床：改了常量不改文案，
 * 报告就会指着一个不存在的线让人去改数据。 */
import { MAX_TITLE, MAX_SUMMARY } from "./limits.mjs";

/* 语域门：虚词表与 tools/style-probe.mjs 逐字相同，两处量出来的数才会一致。
 * 上限 4.0/百字 = wd-04 整片被改成白话时的实测值——那是全库第一次「不像同一本书」，
 * 故把这个失败值本身钉成错误线；2.6 起先警告，留出观察带。 */
const PARTICLE_RE = /(了|的|是|在|被|把|从|对于|已经|进行)/g;
const REG_WARN = 2.6, REG_ERR = 4.0;
/* 反向过矫信号：摘要被省到没有信息量 */
const MIN_SUMMARY_AVG = 10;

const errs = [];
const warns = [];
const E = (chunk, code, msg) => errs.push({ chunk, code, msg });
const W = (chunk, code, msg) => warns.push({ chunk, code, msg });

/* ---------- 加载 ---------- */
const meta = load("data/meta.js").__CHRONICLE_META;
const chunks = [];
const allFiles = [];
for (const sub of ["cn", "wd"]) {
  const dir = path.join(DATA, sub);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
    const id = path.basename(f, ".js");
    allFiles.push({ id, rel: path.join("data", sub, f), file: `${sub}/${f}` });
    let store = null, synErr = null, evalErr = null;
    try {
      store = load(path.join("data", sub, f));
    } catch (e) {
      const src = fs.readFileSync(path.join(ROOT, "data", sub, f), "utf8");
      try { new Function(src); } catch (e2) { synErr = e2; }
      if (!synErr) evalErr = e;
    }
    if (synErr) {
      E(id, "SYNTAX", `${sub}/${f}: ${synErr.message}`);
      continue;
    }
    if (evalErr) {
      E(id, "EVAL", `${sub}/${f}: 语法可解析但求值抛错 —— ${evalErr.message}（求值期成因至少三类：字段值漏引号如 state: 明、引用未定义变量、生成器表达式未求值；先看 PY_LEAK/PY_VALUE/BARE_VALUE 是否同报）`);
      continue;
    }
    const arr = (store.__CHRONICLE_CHUNK || {})[id];
    if (!Array.isArray(arr)) {
      E(id, "NO_ARRAY", `${sub}/${f}: 缺少 window.__CHRONICLE_CHUNK["${id}"]`);
      continue;
    }
    chunks.push({ id, track: TRACK_DIRS[sub], file: `${sub}/${f}`, arr, bytes: fs.statSync(path.join(dir, f)).size });
  }
}

function load(rel) {
  const win = {};
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  new Function("window", src)(win);
  return win;
}

/* ---------- 原文腐蚀扫描（不求值也要报）----------
 * 一行漏引号或一段编码损坏会让整片在浏览器里消失，
 * 只报 EVAL 拿不到事件 id，故对原文逐行扫。 */
const BARE_VALUE = /(?:^|[{,]\s*)(?:state|place|title|summary|background|process|impact|dim|track|figures|sources|tags)\s*:\s*(?!["'[{\-0-9]|true\b|false\b)[A-Za-z一-鿿]/;
/* 生成器是 Python 时，未求值的表达式会原样漏进 JS（实测：related: [...] if False else q_placeholder）。
 * 这类只会报成语法错误，其「漏引号」提示会把人带偏，故单列一类点名成因。 */
const PY_LEAK = /\bif\s+(?:True|False)\s+else\b|q_placeholder/;
const PY_VALUE = /(?:^|[{,]\s*)(?:state|place|title|summary|background|process|impact|dim|track|figures|sources|tags|related|weight|year|yearApprox)\s*:\s*(?:None|True|False)\s*(?=[,}\]])/;
for (const f of allFiles) {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, f.rel), "utf8"); } catch { continue; }
  let cur = "<文件头>";
  for (const ln of src.split("\n")) {
    const m = /["']?id["']?\s*:\s*["']((?:cn|world)--[^"']+)["']/.exec(ln);
    if (m) cur = m[1];
    if (BARE_VALUE.test(ln)) E(f.id, "BARE_VALUE", `${cur}: 字段值缺引号（整片会求值失败）→ ${ln.trim().slice(0, 60)}`);
    if (PY_LEAK.test(ln))
      E(f.id, "PY_LEAK", `${cur}: Python 源码漏进 JS（生成器未求值）——该行本身即语法错误 → ${ln.trim().slice(-70)}`);
    if (PY_VALUE.test(ln))
      E(f.id, "PY_VALUE", `${cur}: Python 字面量 None/True/False 未转为 JS——该行语法可解析，但求值到此中断，本片其后记录全部丢失 → ${ln.trim().slice(-70)}`);
    /* 两条判据的口径与实测依据见 tools/corrupt-patterns.mjs */
    const bad = ln.match(MANGLED);
    if (bad) E(f.id, "CORRUPT", `${cur}: ${bad.length} 处「汉字后跟 ?」编码腐蚀，文本需重写`);
    const qrun = ln.match(QRUN);
    if (qrun) E(f.id, "CORRUPT", `${cur}: ${qrun.length} 处问号连排（「？ ？ …」），疑为整句留白，须重写不得保留`);
  }
}

/* ---------- 逐条 schema ---------- */
const seenId = new Map();       // id -> chunk
const idSet = new Set();
const perChunkStats = [];

for (const c of chunks) {
  const st = { id: c.id, n: c.arr.length, dimC: {}, wC: {}, trackC: {}, years: [], dupTitle: 0, unsorted: 0, part: 0, pchars: 0 };
  let prevYear = -Infinity;
  for (const e of c.arr) {
    const at = c.id + " " + (e && e.id ? e.id : "<no id>");

    /* id 形态：公元前年份必须带 b 中缀，否则 前1500 与 公元1500 会撞成同一 id */
    if (typeof e.id !== "string") { E(c.id, "ID_TYPE", `${at}: id 非字符串`); continue; }
    const m = /^(cn|world)--(b?)(\d+)--([pfscmeixad])(\d+)$/.exec(e.id);
    if (!m) {
      E(c.id, "ID_FORMAT", `${at}: 不符合 {track}--{b?}{yearAbs}--{dimInitial}{seq}（公元前年份需 b 中缀）`);
    } else {
      const [, tr, bpre, ydigits, ini, seq] = m;
      if (tr !== e.track) E(c.id, "ID_TRACK", `${at}: id 前缀 ${tr} 与 track=${e.track} 不一致`);
      if (Math.abs(e.year) !== Number(ydigits)) E(c.id, "ID_YEAR", `${at}: id 年份 ${ydigits} 与 year=${e.year} 不一致`);
      if ((e.year < 0) !== (bpre === "b")) E(c.id, "ID_ERA", `${at}: ${e.year < 0 ? "公元前年份需 b 中缀" : "公元年份不得带 b 中缀"}`);
      if (DIM_INIT[ini] !== e.dim) E(c.id, "ID_DIM", `${at}: id 维度字母 ${ini} 与 dim=${e.dim} 不一致`);
      if (seq.length !== 2) W(c.id, "ID_SEQ", `${at}: seq 非两位数字（软提示：normalizer 会统一重排；真正会出事的是 p1 与 p01 撞同一命名空间，那由 DUP_ID 兜底）`);
    }
    if (seenId.has(e.id)) E(c.id, "DUP_ID", `${e.id} 与 ${seenId.get(e.id)} 重复`);
    else seenId.set(e.id, c.id);
    idSet.add(e.id);

    /* track */
    if (!["cn", "world"].includes(e.track)) E(c.id, "TRACK", `${at}: track 非法 ${e.track}`);
    st.trackC[e.track] = (st.trackC[e.track] || 0) + 1;

    /* year */
    if (!Number.isInteger(e.year)) E(c.id, "YEAR_INT", `${at}: year 非整数 ${e.year}`);
    else {
      if (e.year === 0) E(c.id, "YEAR_ZERO", `${at}: 不存在公元 0 年`);
      if (e.year < YEAR_MIN || e.year > YEAR_MAX) E(c.id, "YEAR_RANGE", `${at}: year=${e.year} 超出 [${YEAR_MIN}, ${YEAR_MAX}]`);
      st.years.push(e.year);
      if (e.year < prevYear) st.unsorted++;
      if (e.year < CN_CONTINUOUS && c.track === "cn" && e.yearApprox !== true)
        W(c.id, "APPROX", `${at}: 前${-e.year}年早于确切编年起点(前${-CN_CONTINUOUS})，应标 yearApprox:true`);
      prevYear = e.year;
    }
    if (typeof e.yearApprox !== "boolean") E(c.id, "APPROX_TYPE", `${at}: yearApprox 必须显式为布尔`);

    /* dim / weight */
    if (!DIMS.includes(e.dim)) E(c.id, "DIM", `${at}: dim 非法 ${e.dim}`);
    else st.dimC[e.dim] = (st.dimC[e.dim] || 0) + 1;
    if (!Number.isInteger(e.weight) || e.weight < 1 || e.weight > 5) E(c.id, "WEIGHT", `${at}: weight 非法 ${e.weight}`);
    else st.wC[e.weight] = (st.wC[e.weight] || 0) + 1;

    /* 文案长度 */
    if (typeof e.title !== "string" || !e.title.length) E(c.id, "TITLE", `${at}: title 缺失`);
    else if ([...e.title].length > MAX_TITLE) E(c.id, "TITLE_LEN", `${at}: title ${[...e.title].length} 字 > ${MAX_TITLE}`);
    if (typeof e.summary !== "string" || !e.summary.length) E(c.id, "SUMMARY", `${at}: summary 缺失`);
    else if ([...e.summary].length > MAX_SUMMARY) E(c.id, "SUMMARY_LEN", `${at}: summary ${[...e.summary].length} 字 > ${MAX_SUMMARY}`);

    /* 语域统计：白话虚词密度是「这一片读起来像不像同一本编年史」的可量化代理 */
    {
      const prose = (typeof e.title === "string" ? e.title : "") + (typeof e.summary === "string" ? e.summary : "");
      st.part += (prose.match(PARTICLE_RE) || []).length;
      st.pchars += prose.length;
    }

    /* detail 完整度 */
    const d = e.detail;
    if (!d || typeof d !== "object") E(c.id, "DETAIL", `${at}: detail 缺失`);
    else {
      for (const k of DETAIL_KEYS) {
        const v = d[k];
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
        if (empty) E(c.id, "DETAIL_FIELD", `${at}: detail.${k} 缺失或为空`);
      }
      if (Array.isArray(d.figures)) {
        if (!d.figures.length) E(c.id, "FIGURES", `${at}: figures 为空`);
        if (d.figures.length > 8) W(c.id, "FIGURES_MANY", `${at}: figures ${d.figures.length} 个 > 8`);
      }
      if (Array.isArray(d.sources) && d.sources.length === 1 && /维基百科|wikipedia/i.test(String(d.sources[0])))
        W(c.id, "SOURCE_WIKI", `${at}: 以维基百科为唯一来源（§6：不写维基百科作为唯一来源）`);
      if (Array.isArray(d.tags) && d.tags.length < 2) W(c.id, "TAGS_FEW", `${at}: tags 少于 2 个`);
      const extra = Object.keys(d).filter((k) => !DETAIL_KEYS.includes(k));
      if (extra.length) W(c.id, "EXTRA_FIELD", `${at}: detail 出现未定义字段 ${extra.join(",")}`);
    }

    /* related */
    if (!Array.isArray(e.related)) E(c.id, "RELATED_TYPE", `${at}: related 必须是数组（可为空）`);
    else {
      if (e.related.length > 4) E(c.id, "RELATED_MANY", `${at}: related ${e.related.length} 项 > 4`);
      if (new Set(e.related).size !== e.related.length) W(c.id, "RELATED_DUP", `${at}: related 有重复项`);
      for (const r of e.related) {
        if (typeof r !== "string") { E(c.id, "RELATED_ITEM", `${at}: related 含非字符串`); continue; }
        if (r === e.id) E(c.id, "RELATED_SELF", `${at}: related 指向自身`);
      }
    }

    /* ---------- 溯源：等级不可手写，核对记录不可半成品 ----------
     * prov.js 对坏记录是静默丢弃（validCheck 为假就不计数），所以「投稿人填了
     * 核对记录、标签却毫无变化」这条路必须在这里堵死，而不是留给读者去猜。 */
    for (const k of TIER_FIELDS) {
      if (e[k] !== undefined) E(c.id, "TIER_FIELD",
        `${at}: 出现等级字段 ${k}——四级由 prov.js 从 sources/checks 现算，数据里写不出「已核」`);
    }
    if (e.checks !== undefined) {
      if (!Array.isArray(e.checks)) {
        E(c.id, "CHECK_SHAPE", `${at}: checks 必须是数组（可为空）`);
      } else {
        e.checks.forEach((ck, i) => {
          const bad = !ck || typeof ck !== "object" || Array.isArray(ck) ||
            typeof ck.by !== "string" || !ck.by.trim() ||
            typeof ck.at !== "string" || !CHECK_DATE_RE.test(ck.at.trim()) ||
            (ck.note !== undefined && typeof ck.note !== "string");
          if (bad) E(c.id, "CHECK_SHAPE",
            `${at}: checks[${i}] 不合式——须有非空 by（谁核的）与 at（YYYY-MM-DD）；note 可选且须为字符串`);
        });
        const srcN = d && Array.isArray(d.sources) ? d.sources.length : 0;
        if (e.checks.length && !srcN) W(c.id, "CHECK_WITHOUT_SOURCE",
          `${at}: 有 ${e.checks.length} 条核对记录却没有任何出处——「核对」没有可核的对象`);
      }
    }

    const badKeys = Object.keys(e).filter((k) => !EV_KEYS.includes(k));
    if (badKeys.length) W(c.id, "EXTRA_KEY", `${at}: 事件出现未定义字段 ${badKeys.join(",")}`);
  }

  /* 分片级 */
  if (c.bytes > MAX_CHUNK_BYTES) E(c.id, "CHUNK_SIZE", `${c.file}: ${(c.bytes / 1024).toFixed(0)}KB > ${MAX_CHUNK_BYTES / 1024}KB`);
  if (st.unsorted) W(c.id, "UNSORTED", `${st.unsorted} 处年份逆序（分片内应按 year 升序）`);
  st.n5 = st.wC[5] || 0;
  st.n4p = (st.wC[4] || 0) + st.n5;
  /* 权重带：两条口径必须分开，不得混写。
   * 2026-09-22 复算 27 片：§4 的目标带 w5 8–15% / w≥4 25–35% 在语料层面普遍未达
   * （当日实测 13/27 片至少一项越带，w5 0.0–11.9%、w≥4 26.3–39.9%，最贴线的是 cn-07），
   * 这些数字是当时的快照，会随数据变动而过期——引用它之前先重跑 validate。
   * 目标带只能给撰稿代理当参照，不能当违规线——否则一开就是十几条噪声，
   * 噪声会淹掉真离群。触发线取"标尺真正失效"处：上沿以 cn-07 的实测离群为锚，
   * 下沿以全库最小非零值为锚。 */
  const NOMINAL = { w5: "8–15%", w4p: "25–35%" };
  const TRIG = { w5Hi: 0.15, w5Lo: 0.05, w4Hi: 0.40 };
  if (c.arr.length >= 20) {
    const p5 = st.n5 / c.arr.length, p4 = st.n4p / c.arr.length;
    if (p5 > TRIG.w5Hi) W(c.id, "W5_HIGH", `weight5 ${(p5 * 100).toFixed(1)}% 越过触发线 ${TRIG.w5Hi * 100}%（§4 目标带 ${NOMINAL.w5}）`);
    if (p5 < TRIG.w5Lo) W(c.id, "W5_LOW", `weight5 ${(p5 * 100).toFixed(1)}% 跌破触发线 ${TRIG.w5Lo * 100}%（§4 目标带 ${NOMINAL.w5}）`);
    if (p4 > TRIG.w4Hi) W(c.id, "W4_HIGH", `weight≥4 ${(p4 * 100).toFixed(1)}% 越过触发线 ${TRIG.w4Hi * 100}%（§4 目标带 ${NOMINAL.w4p}）`);
    const usedDims = Object.keys(st.dimC).length;
    if (usedDims < 6) W(c.id, "DIM_NARROW", `仅覆盖 ${usedDims}/${DIMS.length} 个维度`);
  }
  /* 语域门放在 >=20 的统计带之外：小分片照样能整片白话化，
   * 而 4.0/百字 这条线在 19 条上也足够触发——没有理由让 cn-16 这类小片免检。
   * 上限 4.0 = wd-04 整片白话化时的实测值；摘要均长 <10 字则是反向过矫的信号。 */
  if (st.pchars && c.arr.length) {
    const dens = (st.part / st.pchars) * 100;
    const msg = `白话虚词 ${st.part} 个 / ${st.pchars} 字 = ${dens.toFixed(1)} 每百字（告警线 >${REG_WARN}）`;
    if (dens > REG_ERR) E(c.id, "REG_VERNAC", msg + ` —— 越过错误线 >${REG_ERR}，语域已偏离全库`);
    else if (dens > REG_WARN) W(c.id, "REG_VERNAC", msg);
    st.regDens = dens;
  }
  if (c.arr.length) {
    const avgSum = c.arr.reduce((a, e) => a + (typeof e.summary === "string" ? [...e.summary].length : 0), 0) / c.arr.length;
    st.avgSum = avgSum;
    if (avgSum < MIN_SUMMARY_AVG) W(c.id, "REG_THIN", `摘要均长 ${avgSum.toFixed(1)} 字 < ${MIN_SUMMARY_AVG} —— 压缩过度，已无信息量`);
  }
  /* 与分片大小无关的权重盲区：上面的统计带要求 arr.length>=20，于是全库唯一
   * w5=0 的 cn-16（19 条）恰好躲过 W5_LOW。整片没有 5 级事件意味着这段年代
   * 在 §4 的标尺上提不出顶级锚点——不是渲染故障（js/lod.js 的 minWeight 闸门
   * 只在 step===1 的 L2/L1 生效，L5/L4/L3 按 bin 内最高权重取代表事件），
   * 但它是标定尺失效的信号，与分片大小无关，必须无条件报。 */
  if (c.arr.length && st.n5 === 0)
    W(c.id, "W5_NONE", `${c.file}: ${c.arr.length} 条中 0 条 weight=5 —— 该年代段在 §4 标尺上无顶级锚点（L2 层可显示节点数只取决于 w4 条数，当前 ${st.wC[4] || 0} 条）`);
  if (c.arr.length === 0) W(c.id, "EMPTY", `${c.file}: 空分片（数据仍在编纂中）`);
  c.st = st;
  perChunkStats.push(st);
}

/* ---------- 悬空 related ---------- */
const dangling = [];
for (const c of chunks)
  for (const e of c.arr)
    for (const r of e.related || [])
      if (typeof r === "string" && !idSet.has(r)) dangling.push({ from: e.id, to: r, chunk: c.id });
const nonEmpty = chunks.filter((c) => c.arr.length).length;
const datasetComplete = perChunkStats.every((s) => s.n > 0);
if (dangling.length) {
  const tgt = {};
  for (const d of dangling) { const p = d.to.split("--")[0]; tgt[p] = (tgt[p] || 0) + 1; }
  const detail = Object.entries(tgt).map(([p, n]) => `${p}--*:${n}`).join(" ");
  const msg = `${dangling.length} 条指向不存在 id（目标前缀分布 ${detail}）`;
  const why = !STRICT ? "未开 --strict，故按告警计" : "数据集仍有空分片，补链尚未开始";
  if (STRICT && datasetComplete) for (const d of dangling) E(d.chunk, "RELATED_DANGLING", `${d.from} → ${d.to}`);
  else W("ALL", "RELATED_DANGLING", msg + `（${why}；但断链本身与完整性无关，是缺陷）`);
}

/* ---------- 跨片一致性：同事件重复录入 / 跨轨同级 ----------
 * 两道门都来自 §3/§5/§4A③ 已成文却无人执行的规则。
 * 判据一律用「归一化标题完全相同」这一条机械口径——相似度度量的召回更好但会误报，
 * 留在审计脚本里，不进门禁（门禁一旦掺入误报，人就学会忽略它）。 */
const TKEY = (e) => {
  const t = typeof e.title === "string" ? e.title : "";
  return t.replace(/[^\p{Script=Han}0-9A-Za-z]/gu, "");
};
/* 但「完全相同」有结构性盲区：同一条事件换一种措辞就抓不到。2026-09-22 的入世倒挂
 * （cn--2001--e01「成为…第143个成员」w5 ↔ world--2001--i03「加入世界贸易组织」当时 w3，
 * 相差两级）正是这样从 XTRACK_LEVEL 眼前漏掉的。补一条只出告警的候选门：跨轨同年、
 * 权重不同、汉字最长公共串 ≥6 字 → 列为待裁定候选，不自动判对错。
 * 阈值 6 是实测选的：≥5 时「2024年经济」这类年份巧合会混进来（4 对里 2 对误报），
 * ≥6 只剩 2 对，且都是真要看一眼才知道是不是同一件事的。 */
const NEAR_MIN = 6;
const hanOnly = (t) => (typeof t === "string" ? t : "").replace(/[^\p{Script=Han}]/gu, "");
function hanLcs(a, b) {
  let best = "";
  const m = b.length;
  let prev = new Array(m + 1).fill(0), cur = new Array(m + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best.length) best = a.slice(i - cur[j], i);
    }
    const tmp = prev; prev = cur; cur = tmp; cur.fill(0);
  }
  return best;
}
/* 已裁定的共词对：豁免只按 id 成对生效，理由必须写在这里，不得只写「已确认」。 */
const NEAR_EXEMPT = new Map([
  ["cn--1997--e01|world--1997--e01", "危机爆发（世界轨）与人民币不贬值承诺（中国轨）是同一场危机的两个节点，非同一事件，故允许不同级"],
  ["cn--1984--c01|world--1984--p01", "中国代表团参赛与苏联等国抵制是同一届奥运会的两件不同事"],
]);
{
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const gDim = new Map(), gTrack = new Map(), gYear = new Map();
  for (const c of chunks) {
    for (const e of c.arr) {
      if (!Number.isInteger(e.year)) continue;
      const t = TKEY(e);
      if (!t) continue;
      push(gDim, `${c.track}|${e.year}|${t}`, e);
      push(gTrack, `${e.year}|${t}`, { e, track: c.track });
      push(gYear, e.year, { e, track: c.track });
    }
  }
  for (const [, g] of gDim) {
    if (g.length < 2) continue;
    if (new Set(g.map((e) => e.dim)).size < 2) continue;
    E("ALL", "EVENT_DUP_DIM", g.map((e) => `${e.id} w${e.weight} [${e.dim}]「${e.title}」`).join(" ↔ ") +
      ` —— 同一事件按不同 dim 重复录入，违 §3「一条事件只归一个 dim」与 §5「一条一义」；保留最主要面，另一条删除`);
  }
  const byYearKey = new Map();
  for (const [, g] of gTrack) {
    const cn = g.filter((x) => x.track === "cn"), wd = g.filter((x) => x.track === "world");
    for (const a of cn) for (const b of wd) {
      if (a.e.weight === b.e.weight) continue;
      const k = [a.e.id, b.e.id].sort().join("|");
      if (byYearKey.has(k)) continue;
      byYearKey.set(k, 1);
      W("ALL", "XTRACK_LEVEL", `${a.e.id} w${a.e.weight}「${a.e.title}」 ↔ ${b.e.id} w${b.e.weight}「${b.e.title}」 —— 跨轨同一事件不同级，§4A③ 要求同级`);
    }
  }
  /* XTRACK_NEAR：换了措辞的同事件候选。只出告警，判给不判人——是否同一件事须看正文。 */
  const nearSeen = new Set();
  for (const [, g] of gYear) {
    const cn = g.filter((x) => x.track === "cn"), wd = g.filter((x) => x.track === "world");
    for (const a of cn) for (const b of wd) {
      if (!Number.isInteger(a.e.weight) || !Number.isInteger(b.e.weight)) continue;
      if (a.e.weight === b.e.weight) continue;
      if (TKEY(a.e) === TKEY(b.e)) continue;              // 标题全同的归 XTRACK_LEVEL
      const shared = hanLcs(hanOnly(a.e.title), hanOnly(b.e.title));
      if (shared.length < NEAR_MIN) continue;
      const k = `${a.e.id}|${b.e.id}`;
      if (nearSeen.has(k) || NEAR_EXEMPT.has(k)) continue;
      nearSeen.add(k);
      W("ALL", "XTRACK_NEAR", `${a.e.id} w${a.e.weight}「${a.e.title}」 ↔ ${b.e.id} w${b.e.weight}「${b.e.title}」 —— ` +
        `跨轨同年共词「${shared}」≥${NEAR_MIN} 字而权重不同：须人工确认是否 §4A③ 的同一事件。` +
        (NEAR_EXEMPT.size ? `（已裁定豁免 ${NEAR_EXEMPT.size} 对，理由见 NEAR_EXEMPT）` : ""));
    }
  }
}

/* ---------- 密度空洞 ---------- */
const holes = [];
for (const track of ["cn", "world"]) {
  const ys = [];
  for (const c of chunks) if (c.track === track) for (const e of c.arr) if (Number.isInteger(e.year)) ys.push(e.year);
  if (!ys.length) continue;
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const bins = new Map();
  const binOf = (y) => { let b = Math.floor(y / 50) * 50; if (y < 0 && y % 50 !== 0) b -= 50; return b; };  // 无公元 0：跨界的 bin 单独处理
  for (const y of ys) bins.set(binOf(y), (bins.get(binOf(y)) || 0) + 1);
  /* 每轨一条线？试过按轨分档，实测两轨都需要同一条（1 条即非空），
   * 留着假开关只会让人以为调过。 */
  const HOLE_FLOOR = 1;
  let run = null;
  const loBin = binOf(lo), hiBin = binOf(hi);
  for (let b = loBin; b <= hiBin; b += 50) {
    const n = bins.get(b) || 0;
    if (n < HOLE_FLOOR) run = run ? { ...run, to: b } : { from: b, to: b };
    else { if (run && b - run.from >= 100) holes.push({ track, from: run.from, to: b - 50, span: b - run.from }); run = null; }
  }
  /* 尾段与中段同径：都按 bin 界量，不用原始末年 hi */
  if (run && hiBin - run.from >= 100) holes.push({ track, from: run.from, to: hiBin, span: hiBin - run.from });
}
for (const h of holes) W(h.track === "cn" ? "CN" : "WORLD", "HOLE", `${h.track} ${fmtYear(h.from)}–${fmtYear(h.to)} 连续 ${(h.span / 50) | 0} 个 50 年空洞`);

function fmtYear(y) { return y < 0 ? "前" + -y : String(y); }

/* ---------- manifest 与分片实态对账 ----------
 * loader.js 用 manifest 的 yearFrom/yearTo 判定视窗重叠、用 count 做进度，
 * 而 validate 此前从不读 manifest：改完数据忘记 `node tools/gen-manifest.mjs`
 * 时，站会静默漏加载该区间的分片，页面看着正常、事件却少了，且没有任何门会报。
 * 时间戳两行（生成时间 / generatedAt）每次必变、无消费方，不参与比对。 */
const REGEN = "需重跑 node tools/gen-manifest.mjs";
{
  let mf = null;
  try {
    mf = load("data/manifest.js").__CHRONICLE_MANIFEST;
  } catch (e) {
    E("ALL", "MANIFEST_UNREADABLE", `data/manifest.js 求值失败: ${e.message}`);
  }
  if (mf) {
    if (!Array.isArray(mf.chunks)) {
      E("ALL", "MANIFEST_UNREADABLE", `manifest.chunks 不是数组（格式已变，对账失效）`);
    } else {
      const byFile = new Map(mf.chunks.map((c) => [c.file, c]));
      let realTotal = 0;
      for (const c of chunks) {
        realTotal += c.arr.length;
        const m = byFile.get(c.file);
        if (!m) { E(c.id, "MANIFEST_STALE", `manifest 未登记实存分片 ${c.file}（${c.arr.length} 条）—— ${REGEN}`); continue; }
        byFile.delete(c.file);
        const bad = [];
        if (m.count !== c.arr.length) bad.push(`count manifest=${m.count} 实态=${c.arr.length}`);
        const yrs = c.arr.map((e) => e.year).filter(Number.isInteger);
        /* 空分片的 yearFrom/yearTo 是 gen-manifest 给的全区间占位，不比 */
        if (yrs.length) {
          const lo = Math.min(...yrs), hi = Math.max(...yrs);
          if (m.yearFrom !== lo) bad.push(`yearFrom manifest=${m.yearFrom} 实态=${lo}`);
          if (m.yearTo !== hi) bad.push(`yearTo manifest=${m.yearTo} 实态=${hi}`);
        }
        if (bad.length) E(c.id, "MANIFEST_STALE", `${c.file}: ${bad.join("，")} —— ${REGEN}`);
      }
      for (const f of byFile.keys()) E("ALL", "MANIFEST_STALE", `manifest 登记了不存在的分片 ${f} —— ${REGEN}`);
      if (mf.total !== realTotal) E("ALL", "MANIFEST_STALE", `total manifest=${mf.total} 实态=${realTotal} —— ${REGEN}`);
    }
  }
}

/* ---------- 全局统计 ---------- */
const allEvents = chunks.flatMap((c) => c.arr);
const total = allEvents.length;
const gDim = {}, gW = {}, byTrack = { cn: 0, world: 0 };
const yearSet = new Set();
for (const e of allEvents) {
  gDim[e.dim] = (gDim[e.dim] || 0) + 1;
  gW[e.weight] = (gW[e.weight] || 0) + 1;
  byTrack[e.track] = (byTrack[e.track] || 0) + 1;
  yearSet.add(e.year);
}
/* 主题/去重：同年同轨同维度同标题视为疑似重复 */
const sig = new Map();
for (const e of allEvents) {
  const k = `${e.track}|${e.year}|${e.dim}|${e.title}`;
  sig.set(k, (sig.get(k) || 0) + 1);
}
const dupSig = [...sig.entries()].filter(([, n]) => n > 1);
for (const [k] of dupSig) W("DUP", "EVENT_DUP", `完全相同的 年+维度+标题: ${k}`);

const cnYears = allEvents.filter((e) => e.track === "cn").map((e) => e.year);
const wdYears = allEvents.filter((e) => e.track === "world").map((e) => e.year);
const cov = {
  cn: cnYears.length ? [Math.min(...cnYears), Math.max(...cnYears)] : null,
  world: wdYears.length ? [Math.min(...wdYears), Math.max(...wdYears)] : null,
};
/* 1949 后覆盖度（用户明确要求纳入） */
const post1949 = allEvents.filter((e) => e.year >= 1949);
const post1949ByTrack = { cn: post1949.filter((e) => e.track === "cn").length, world: post1949.filter((e) => e.track === "world").length };
const recentByYear = {};
for (const e of allEvents) if (e.year >= 2020) recentByYear[e.year] = (recentByYear[e.year] || 0) + 1;

const result = {
  pass: errs.length === 0 && (!STRICT || datasetComplete),
  datasetComplete,
  strict: STRICT,
  stats: {
    chunksFound: chunks.length,
    chunksExpected: chunks.length,
    chunksNonEmpty: nonEmpty,
    total,
    byTrack,
    distinctYears: yearSet.size,
    coverage: cov,
    post1949: post1949ByTrack,
    recentByYear,
    dims: gDim,
    weights: gW,
    danglingRelated: dangling.length,
  },
  perChunk: perChunkStats.map((s) => ({
    id: s.id, n: s.n, w5: s.n5, w4plus: s.n4p,
    yFrom: s.years.length ? Math.min(...s.years) : null,
    yTo: s.years.length ? Math.max(...s.years) : null,
  })),
  errors: errs,
  warnings: warns,
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("编年史数据校验" + (STRICT ? " [--strict]" : ""));
  console.log(`分片 ${chunks.length}（非空 ${nonEmpty}）| 事件 ${total} 条 | 覆盖 ${Object.entries(byTrack).map(([k, v]) => `${k}:${v}`).join(" ")} | 不同年份 ${yearSet.size}`);
  for (const c of chunks) {
    const n = c.arr.length;
    const yrs = n ? `${fmtYear(Math.min(...c.arr.map(e => e.year)))}→${fmtYear(Math.max(...c.arr.map(e => e.year)))}` : "—";
    const p = x => n ? (100 * x / n).toFixed(0) + "%" : "—";
    console.log(`  ${c.id.padEnd(6)} ${String(n).padStart(4)}条 ${yrs.padEnd(16)} ${String((c.bytes / 1024).toFixed(0) + "KB").padStart(7)}  w5=${p(c.arr.filter(e => e.weight === 5).length).padStart(4)} w4+=${p(c.arr.filter(e => e.weight >= 4).length).padStart(4)} dim=${new Set(c.arr.map(e => e.dim)).size}/10 语域=${c.st.regDens === undefined ? "—" : c.st.regDens.toFixed(1)} 摘要均长=${c.st.avgSum === undefined ? "—" : c.st.avgSum.toFixed(0)}`);
  }
  console.log(`\n1949 后条目: cn ${post1949ByTrack.cn} / world ${post1949ByTrack.world}`);
  console.log("2020 年后逐年: " + (Object.keys(recentByYear).length ? Object.entries(recentByYear).map(([y, n]) => `${y}:${n}`).join(" ") : "（暂无）"));
  console.log("维度分布: " + DIMS.map(d => `${d}:${gDim[d] || 0}`).join(" "));
  console.log("权重分布: " + [1, 2, 3, 4, 5].map(w => `${w}:${gW[w] || 0}`).join(" "));

  const byCode = {};
  for (const e of errs) (byCode[e.code] || (byCode[e.code] = [])).push(e);
  const byWCode = {};
  for (const w of warns) (byWCode[w.code] || (byWCode[w.code] = [])).push(w);

  console.log(`\n=== ERRORS ${errs.length} ===`);
  for (const [code, list] of Object.entries(byCode)) {
    console.log(`${code} ×${list.length}`);
    list.slice(0, 8).forEach(e => console.log(`   [${e.chunk}] ${e.msg}`));
    if (list.length > 8) console.log(`   …另 ${list.length - 8} 条`);
  }
  console.log(`\n=== WARNINGS ${warns.length} ===`);
  for (const [code, list] of Object.entries(byWCode)) {
    console.log(`${code} ×${list.length}`);
    list.slice(0, 5).forEach(e => console.log(`   [${e.chunk}] ${e.msg}`));
    if (list.length > 5) console.log(`   …另 ${list.length - 5} 条`);
  }
  console.log(`\n${result.pass ? "✅ PASS" : "❌ FAIL"}` + (datasetComplete ? "" : `  （数据集未完整：${nonEmpty}/${chunks.length} 分片有数据，空 ${chunks.length-nonEmpty} 个）`));
}
/* 不用 process.exit：stdout 是管道时会截断报告，消费方拿到半截 JSON */
process.exitCode = result.pass ? 0 : 1;
